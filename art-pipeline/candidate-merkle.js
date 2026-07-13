// Computes a reveal merkle root/proofs for the STAGED candidate dataset only.
// Mirrors generate-reveal-merkle.js's leafHash exactly, but reads/writes the
// staging path — does NOT touch output/reveal-merkle-root.txt or
// output/reveal-merkle-proofs.json (those stay frozen per SESSION_HANDOFF.md
// until the legendary-finals gate clears and a real 5150-token set exists).
const fs = require("fs");
const path = require("path");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { encodeAbiParameters } = require("viem");

const STAGE_DIR = path.resolve(__dirname, "..", "chromies-engine", "generated", "regen_5150_current");
const MINT_DATA_PATH = path.join(STAGE_DIR, "mint-data-excl-legendary.json");
const ROOT_OUT = path.join(STAGE_DIR, "candidate-merkle-root.txt");
const PROOFS_OUT = path.join(STAGE_DIR, "candidate-merkle-proofs.json");

function leafHash(tokenId, pixelsHex, traitsHex) {
  const pixels = pixelsHex.startsWith("0x") ? pixelsHex : `0x${pixelsHex}`;
  const traits = traitsHex.startsWith("0x") ? traitsHex : `0x${traitsHex}`;
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "bytes" }, { type: "bytes" }],
    [BigInt(tokenId), pixels, traits],
  );
  return keccak256(Buffer.from(encoded.slice(2), "hex"));
}

function main() {
  const records = JSON.parse(fs.readFileSync(MINT_DATA_PATH, "utf8"));
  const leaves = records.map((r) => leafHash(r.tokenId, r.pixelsHex, r.traitsHex));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true, hashLeaves: false });
  const root = tree.getHexRoot();
  const proofs = {};
  for (const record of records) {
    proofs[String(record.tokenId)] = tree.getHexProof(
      leafHash(record.tokenId, record.pixelsHex, record.traitsHex),
    );
  }
  fs.writeFileSync(ROOT_OUT, root + "\n");
  fs.writeFileSync(PROOFS_OUT, JSON.stringify({ root, count: records.length, proofs }, null, 2) + "\n");
  console.log(`Candidate reveal merkle (excl. 9 legendary slots): ${records.length} tokens, root: ${root}`);
  console.log(`  ${ROOT_OUT}`);
  console.log(`  ${PROOFS_OUT}`);
}

main();
