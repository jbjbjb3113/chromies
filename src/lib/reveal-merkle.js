import { encodePacked, hexToBytes, keccak256 } from "viem";

function encodeUint256(value) {
  const buf = new Uint8Array(32);
  let v = BigInt(value);
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

/** Leaf hash for Chroma.reveal — keccak256(abi.encodePacked(tokenId, pixels, traits)). */
export function computeRevealLeaf(tokenId, pixelsHex, traitsHex) {
  const pixels = hexToBytes(pixelsHex);
  const traits = hexToBytes(traitsHex);
  const packed = new Uint8Array(32 + pixels.length + traits.length);
  packed.set(encodeUint256(tokenId), 0);
  packed.set(pixels, 32);
  packed.set(traits, 32 + pixels.length);
  return keccak256(packed);
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
