#!/usr/bin/env node
// Verify git-tracked art-pipeline/components/ files match COMPONENTS_MANIFEST.json.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const COMPONENTS = path.join(REPO, "art-pipeline", "components");
const MANIFEST_PATH = path.join(COMPONENTS, "COMPONENTS_MANIFEST.json");

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function trackedRelPaths() {
  const raw = execSync("git ls-files art-pipeline/components/", {
    cwd: REPO,
    encoding: "utf8",
  });
  return raw
    .trim()
    .split(/\r?\n/)
    .filter((line) => line && !line.endsWith("COMPONENTS_MANIFEST.json"))
    .map((line) => line.replace(/^art-pipeline\/components\//, "").replace(/\\/g, "/"));
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`Missing manifest: ${MANIFEST_PATH}`);
    console.error("Run: node scripts/generate-components-manifest.js");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const pinned = new Map(manifest.files.map((f) => [f.path, f.sha256.toLowerCase()]));
  const onDisk = trackedRelPaths();

  let failed = 0;
  const diskSet = new Set(onDisk);

  console.log(`Components manifest check (${pinned.size} pinned files)\n`);

  for (const rel of onDisk.sort()) {
    if (!pinned.has(rel)) {
      console.error(`  UNPINNED ADD  ${rel}`);
      failed += 1;
      continue;
    }
    const abs = path.join(COMPONENTS, rel);
    if (!fs.existsSync(abs)) {
      console.error(`  MISSING FILE  ${rel}`);
      failed += 1;
      continue;
    }
    const actual = sha256File(abs);
    const expected = pinned.get(rel);
    if (actual !== expected) {
      console.error(`  HASH MISMATCH ${rel}`);
      console.error(`    expected ${expected}`);
      console.error(`    actual   ${actual}`);
      failed += 1;
    }
  }

  for (const rel of [...pinned.keys()].sort()) {
    if (!diskSet.has(rel)) {
      console.error(`  MANIFEST ORPHAN (deleted from git) ${rel}`);
      failed += 1;
    }
  }

  if (failed) {
    console.error(`\nFAIL — ${failed} manifest violation(s).`);
    console.error("Update COMPONENTS_MANIFEST.json via: node scripts/generate-components-manifest.js");
    process.exit(1);
  }

  console.log("PASS — all components match pinned manifest.");
}

main();
