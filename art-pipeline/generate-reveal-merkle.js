// Generates merkle tree for permissionless reveal proofs.
// Leaf = keccak256(abi.encode(tokenId, pixels, traits)) — matches Chroma.sol reveal().
//
// USAGE:
//   node generate-reveal-merkle.js
//
// OUTPUTS:
//   output/reveal-merkle-root.txt
//   output/reveal-merkle-proofs.json

const fs = require("fs");
const path = require("path");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { encodeAbiParameters, hexToBytes } = require("viem");

const OUTPUT_DIR = path.join(__dirname, "output");
const MINT_DATA_PATH = path.join(OUTPUT_DIR, "mint-data.json");
const ROOT_OUT = path.join(OUTPUT_DIR, "reveal-merkle-root.txt");
const PROOFS_OUT = path.join(OUTPUT_DIR, "reveal-merkle-proofs.json");

function leafHash(tokenId, pixelsHex, traitsHex) {
  const pixels = hexToBytes(pixelsHex.startsWith("0x") ? pixelsHex : `0x${pixelsHex}`);
  const traits = hexToBytes(traitsHex.startsWith("0x") ? traitsHex : `0x${traitsHex}`);
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "bytes" }, { type: "bytes" }],
    [BigInt(tokenId), pixels, traits]
  );
  return keccak256(Buffer.from(encoded.slice(2), "hex"));
}

function main() {
  if (!fs.existsSync(MINT_DATA_PATH)) {
    console.error(`Missing ${MINT_DATA_PATH} — run bridge-mint-data.js first`);
    process.exit(1);
  }

  const records = JSON.parse(fs.readFileSync(MINT_DATA_PATH, "utf8"));
  const leaves = records.map((r) => leafHash(r.tokenId, r.pixelsHex, r.traitsHex));
  const tree = new MerkleTree(leaves, keccak256, {
    sortPairs: true,
    hashLeaves: false,
  });

  const root = tree.getHexRoot();
  const proofs = {};

  for (const record of records) {
    const id = String(record.tokenId);
    proofs[id] = tree.getHexProof(
      leafHash(record.tokenId, record.pixelsHex, record.traitsHex)
    );
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(ROOT_OUT, root + "\n");
  fs.writeFileSync(
    PROOFS_OUT,
    JSON.stringify({ root, proofs }, null, 2) + "\n"
  );

  console.log(`Reveal merkle: ${records.length} tokens, root: ${root}`);
}

main();
