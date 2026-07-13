#!/usr/bin/env node
// Verify legendary head component PNGs match HEAD_MANIFEST.json (CI + local).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const COMPONENTS = path.join(REPO, "art-pipeline", "components");
const MANIFEST_PATH = path.join(COMPONENTS, "legendary", "HEAD_MANIFEST.json");

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`Missing manifest: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  let failed = 0;

  console.log(`Legendary head manifest check (${manifest.files.length} files)\n`);

  for (const entry of manifest.files) {
    const abs = path.join(COMPONENTS, entry.path.replace(/^\//, ""));
    if (!fs.existsSync(abs)) {
      console.error(`  MISSING  #${entry.tokenId} ${entry.path}`);
      failed += 1;
      continue;
    }
    const actual = sha256File(abs);
    if (actual !== entry.sha256.toLowerCase()) {
      console.error(`  MISMATCH #${entry.tokenId} ${entry.path}`);
      console.error(`    expected ${entry.sha256}`);
      console.error(`    actual   ${actual}`);
      failed += 1;
      continue;
    }
    console.log(`  OK       #${entry.tokenId} ${entry.artist.padEnd(14)} ${path.basename(entry.path)}`);
  }

  if (failed > 0) {
    console.error(`\nFAIL — ${failed} legendary head(s) do not match manifest.`);
    process.exit(1);
  }

  console.log("\nPASS — all legendary head components match pinned manifest.");
}

main();
