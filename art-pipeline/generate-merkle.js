// Generates merkle trees for Tier 1 (Normies) and Tier 2 (Brain Rots) allowlists.
// Leaf = keccak256(abi.encodePacked(address)) — matches Chroma.sol _verifyAllowlist.
//
// USAGE:
//   node generate-merkle.js
//
// OUTPUTS:
//   output/merkle-tier1.json / merkle-tier1-root.txt
//   output/merkle-tier2.json / merkle-tier2-root.txt

const fs = require("fs");
const path = require("path");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const OUTPUT_DIR = path.join(__dirname, "output");

const TIERS = [
  {
    name: "Tier 1",
    input: path.join(OUTPUT_DIR, "normies-holders.json"),
    jsonOut: path.join(OUTPUT_DIR, "merkle-tier1.json"),
    rootOut: path.join(OUTPUT_DIR, "merkle-tier1-root.txt"),
  },
  {
    name: "Tier 2",
    input: path.join(OUTPUT_DIR, "brainrots-holders.json"),
    jsonOut: path.join(OUTPUT_DIR, "merkle-tier2.json"),
    rootOut: path.join(OUTPUT_DIR, "merkle-tier2-root.txt"),
  },
];

function leafHash(address) {
  return keccak256(Buffer.from(address.replace(/^0x/i, ""), "hex"));
}

function buildMerkleTree(addresses) {
  const leaves = addresses.map(leafHash);
  const tree = new MerkleTree(leaves, keccak256, {
    sortPairs: true,
    hashLeaves: false,
  });
  return tree;
}

function generateTier({ name, input, jsonOut, rootOut }) {
  const addresses = JSON.parse(fs.readFileSync(input, "utf8"));
  const tree = buildMerkleTree(addresses);

  const root = tree.getHexRoot();
  const proofs = {};

  for (const addr of addresses) {
    proofs[addr] = tree.getHexProof(leafHash(addr));
  }

  fs.writeFileSync(
    jsonOut,
    JSON.stringify({ root, proofs }, null, 2) + "\n"
  );
  fs.writeFileSync(rootOut, root + "\n");

  console.log(`${name}: ${addresses.length} addresses, root: ${root}`);
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const tier of TIERS) {
    if (!fs.existsSync(tier.input)) {
      console.error(`Missing ${tier.input} — run snapshot-holders.js first`);
      process.exit(1);
    }
    generateTier(tier);
  }
}

main();
