/**
 * Copy art-pipeline reveal artifacts into public/data for the Vite frontend.
 * Run after regenerating mint-data or merkle proofs.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "public/data");

const FILES = [
  "mint-data.json",
  "reveal-merkle-proofs.json",
] as const;

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const name of FILES) {
    const source = resolve(ROOT, "art-pipeline/output", name);
    const target = resolve(OUT_DIR, name);
    copyFileSync(source, target);
    console.log(`Synced ${name} → public/data/${name}`);
  }

  console.log("\nRun npm run verify:public-reveal-data to confirm hashes match.");
}

main();
