import { encodeAbiParameters, encodePacked, hexToBytes, keccak256 } from "viem";

/** Leaf hash for Chroma.reveal — keccak256(abi.encode(tokenId, pixels, traits)). */
export function computeRevealLeaf(tokenId, pixelsHex, traitsHex) {
  const pixels = hexToBytes(pixelsHex);
  const traits = hexToBytes(traitsHex);
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "bytes" }, { type: "bytes" }],
      [BigInt(tokenId), pixels, traits]
    )
  );
}

/** OpenZeppelin MerkleProof.verify with sortPairs (matches generate-reveal-merkle.js). */
function hashPair(a, b) {
  const [left, right] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  return keccak256(encodePacked(["bytes32", "bytes32"], [left, right]));
}

export function verifyMerkleProof(proof, root, leaf) {
  let computed = leaf;
  for (const p of proof) {
    computed = hashPair(computed, p);
  }
  return computed.toLowerCase() === root.toLowerCase();
}
