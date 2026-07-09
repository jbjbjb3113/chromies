#!/usr/bin/env node
// Generate pinned SHA-256 manifest for git-tracked files under art-pipeline/components/.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const COMPONENTS = path.join(REPO, "art-pipeline", "components");
const OUT = path.join(COMPONENTS, "COMPONENTS_MANIFEST.json");

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
    .map((line) => line.replace(/^art-pipeline\/components\//, "").replace(/\\/g, "/"))
    .sort();
}

function main() {
  const files = trackedRelPaths().map((rel) => {
    const abs = path.join(COMPONENTS, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Tracked file missing on disk: ${rel}`);
    }
    return {
      path: rel,
      sha256: sha256File(abs),
      bytes: fs.statSync(abs).size,
    };
  });

  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString().slice(0, 10),
    root: "art-pipeline/components",
    file_count: files.length,
    note:
      "Pinned SHA-256 for every components/ file. CI fails on add/delete/modify without updating this manifest.",
    files,
  };

  fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${OUT} (${files.length} files)`);
}

main();
