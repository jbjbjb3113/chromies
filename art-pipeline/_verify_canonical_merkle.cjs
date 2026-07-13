// Helper for scripts/verify/determine-canonical-dataset.py — NOT part of the production
// pipeline. Exists solely so the report script can recompute merkle roots using the exact
// same leaf-hash + tree-construction code as the real construction, instead of
// reimplementing keccak256/ABI-encoding/tree logic in Python (which the task explicitly
// forbids: "do NOT reimplement or guess the hashing scheme").
//
// leafHash() and the MerkleTree(...) call below are copied VERBATIM from
// art-pipeline/candidate-merkle.js (the script that produced the frozen root recorded in
// chromies-engine/reports/ROBINHOOD_DATASET_FREEZE_RULING.md and in
// chromies-engine/generated/regen_5150_current/candidate-merkle-root.txt). That file is
// also byte-for-byte identical in its leafHash to art-pipeline/generate-reveal-merkle.js,
// which in turn matches contracts/Chroma.sol's reveal(): `keccak256(abi.encode(tokenId,
// pixels, traits))`. Nothing here changes that logic; this file only parameterizes *which*
// mint-data.json array it runs over, and adds a `legendary-ids` mode that requires the repo's
// own art-pipeline/legendary-token-ids.js so the Python report doesn't hand-copy that list
// either (4 of the 9 legendary IDs are RNG-derived, not literal).
//
// Deliberately placed inside art-pipeline/ (not scripts/verify/) so `require("merkletreejs")`,
// `require("keccak256")`, and `require("viem")` resolve exactly the way they do for
// candidate-merkle.js itself (art-pipeline/node_modules, walking up to the repo-root
// node_modules for viem).
//
// Usage:
//   node _verify_canonical_merkle.cjs root <path-to-mint-data.json>
//     -> prints {"root": "0x...", "count": N, "tokenIds": [...]} to stdout
//   node _verify_canonical_merkle.cjs legendary-ids
//     -> prints [45, 264, ...] (art-pipeline/legendary-token-ids.js's LEGENDARY_TOKEN_IDS)

const fs = require("fs");
const path = require("path");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { encodeAbiParameters } = require("viem");

// --- verbatim from art-pipeline/candidate-merkle.js ---
function leafHash(tokenId, pixelsHex, traitsHex) {
  const pixels = pixelsHex.startsWith("0x") ? pixelsHex : `0x${pixelsHex}`;
  const traits = traitsHex.startsWith("0x") ? traitsHex : `0x${traitsHex}`;
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "bytes" }, { type: "bytes" }],
    [BigInt(tokenId), pixels, traits],
  );
  return keccak256(Buffer.from(encoded.slice(2), "hex"));
}

function computeRoot(mintDataPath) {
  const records = JSON.parse(fs.readFileSync(mintDataPath, "utf8"));
  const leaves = records.map((r) => leafHash(r.tokenId, r.pixelsHex, r.traitsHex));
  // sortPairs: true, hashLeaves: false — verbatim from candidate-merkle.js / generate-reveal-merkle.js
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true, hashLeaves: false });
  const root = tree.getHexRoot();
  return {
    root,
    count: records.length,
    tokenIds: records.map((r) => Number(r.tokenId)),
  };
}

function main() {
  const [mode, arg] = process.argv.slice(2);
  if (mode === "root") {
    if (!arg) throw new Error("usage: node _verify_canonical_merkle.cjs root <mint-data.json>");
    const result = computeRoot(path.resolve(arg));
    process.stdout.write(JSON.stringify(result));
    return;
  }
  if (mode === "legendary-ids") {
    const mod = require(path.join(__dirname, "legendary-token-ids.js"));
    process.stdout.write(JSON.stringify(mod.LEGENDARY_TOKEN_IDS));
    return;
  }
  throw new Error(`unknown mode ${JSON.stringify(mode)}`);
}

main();
