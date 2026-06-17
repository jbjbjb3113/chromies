import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { computeRevealLeaf, verifyMerkleProof } from "../src/lib/reveal-merkle.js";

const DATA_DIR = resolve(process.cwd(), "public/data");
const TOKEN_IDS = [1, 2, 3, 4, 5];

async function main(): Promise<void> {
  const mintData = JSON.parse(await readFile(resolve(DATA_DIR, "mint-data.json"), "utf8"));
  const proofsDoc = JSON.parse(
    await readFile(resolve(DATA_DIR, "reveal-merkle-proofs.json"), "utf8"),
  );
  const byId = Object.fromEntries(mintData.map((e: { tokenId: number }) => [String(e.tokenId), e]));

  let failed = 0;
  for (const tokenId of TOKEN_IDS) {
    const id = String(tokenId);
    const entry = byId[id];
    const proof = proofsDoc.proofs?.[id];
    if (!entry || !proof) {
      console.error(`#${id}: missing mint data or proof`);
      failed++;
      continue;
    }

    const leaf = computeRevealLeaf(tokenId, entry.pixelsHex, entry.traitsHex);
    const ok = verifyMerkleProof(proof, proofsDoc.root, leaf);
    console.log(`#${id}: ${ok ? "PASS" : "FAIL"} leaf=${leaf}`);
    if (!ok) failed++;
  }

  if (failed > 0) {
    console.error(`\n${failed} token(s) failed merkle verification`);
    process.exit(1);
  }
  console.log(`\nAll ${TOKEN_IDS.length} tokens verified against root ${proofsDoc.root}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
