/**
 * Fail if public/data reveal JSON is out of sync with art-pipeline/output.
 * Run automatically before dev/build; also invoked from .githooks/pre-commit.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

const PAIRS = [
  {
    label: "mint-data.json",
    source: resolve(ROOT, "art-pipeline/output/mint-data.json"),
    target: resolve(ROOT, "public/data/mint-data.json"),
  },
  {
    label: "reveal-merkle-proofs.json",
    source: resolve(ROOT, "art-pipeline/output/reveal-merkle-proofs.json"),
    target: resolve(ROOT, "public/data/reveal-merkle-proofs.json"),
  },
] as const;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main(): void {
  let failed = false;

  for (const { label, source, target } of PAIRS) {
    if (!existsSync(source)) {
      console.error(`\n❌ verify-public-reveal-data: missing source ${source}`);
      console.error(`   Regenerate art-pipeline output, then: npm run sync:public-reveal-data`);
      failed = true;
      continue;
    }
    if (!existsSync(target)) {
      console.error(`\n❌ verify-public-reveal-data: missing ${target}`);
      console.error(`   Run: npm run sync:public-reveal-data`);
      failed = true;
      continue;
    }

    const sourceHash = sha256File(source);
    const targetHash = sha256File(target);

    if (sourceHash !== targetHash) {
      console.error(`\n❌ public/data/${label} is OUT OF SYNC with art-pipeline/output/${label}`);
      console.error(`   source sha256: ${sourceHash}`);
      console.error(`   public sha256: ${targetHash}`);
      console.error(`   Fix: npm run sync:public-reveal-data`);
      failed = true;
    } else {
      console.log(`✓ public/data/${label} matches art-pipeline/output (${sourceHash.slice(0, 12)}…)`);
    }
  }

  const rootPath = resolve(ROOT, "art-pipeline/output/reveal-merkle-root.txt");
  const proofsPath = resolve(ROOT, "public/data/reveal-merkle-proofs.json");
  if (existsSync(rootPath) && existsSync(proofsPath)) {
    const expectedRoot = readFileSync(rootPath, "utf8").trim();
    const proofs = JSON.parse(readFileSync(proofsPath, "utf8")) as { root?: string };
    if (proofs.root?.toLowerCase() !== expectedRoot.toLowerCase()) {
      console.error(`\n❌ public/data/reveal-merkle-proofs.json root mismatch`);
      console.error(`   proofs.root:   ${proofs.root}`);
      console.error(`   expected root: ${expectedRoot}`);
      failed = true;
    } else {
      console.log(`✓ merkle root matches reveal-merkle-root.txt (${expectedRoot.slice(0, 14)}…)`);
    }
  }

  if (failed) {
    console.error(
      "\nReveal mint-data drift causes InvalidMerkleProof on-chain. Sync before committing.\n",
    );
    process.exit(1);
  }
}

main();
