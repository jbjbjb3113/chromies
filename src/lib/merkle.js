export async function fetchMerkleProofs(tier) {
  const path = tier === 1 ? "/merkle-tier1.json" : "/merkle-tier2.json";
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

export function lookupProof(proofsByAddress, address) {
  if (!address || !proofsByAddress) return null;
  const target = address.toLowerCase();
  const entry = Object.entries(proofsByAddress).find(
    ([addr]) => addr.toLowerCase() === target
  );
  return entry ? entry[1] : null;
}

export function proofToBytes32(proof) {
  return proof.map((hex) => hex);
}
