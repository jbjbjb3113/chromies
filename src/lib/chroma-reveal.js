import { computeRevealLeaf, verifyMerkleProof } from "./reveal-merkle.js";

const MINT_DATA_URL = "/data/mint-data.json";
const PROOFS_URL = "/data/reveal-merkle-proofs.json";

let mintDataByTokenId = null;
let proofsDoc = null;

async function loadMintDataByTokenId() {
  if (mintDataByTokenId) return mintDataByTokenId;

  const res = await fetch(MINT_DATA_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Failed to load mint data (${res.status})`);

  const entries = await res.json();
  const byId = {};
  for (const entry of entries) {
    byId[String(entry.tokenId)] = entry;
  }
  mintDataByTokenId = byId;
  return byId;
}

async function loadProofsDoc() {
  if (proofsDoc) return proofsDoc;

  const res = await fetch(PROOFS_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Failed to load reveal proofs (${res.status})`);

  proofsDoc = await res.json();
  return proofsDoc;
}

/** Preload reveal JSON (call once when page mounts with unrevealed tokens). */
export async function preloadRevealData() {
  await Promise.all([loadMintDataByTokenId(), loadProofsDoc()]);
}

/** Single mint-data row for a token (pixelsHex, traitsHex). */
export async function getMintDataEntry(tokenId) {
  const mintData = await loadMintDataByTokenId();
  const entry = mintData[tokenId.toString()];
  if (!entry?.pixelsHex || !entry?.traitsHex) {
    throw new Error(`No mint data for Chromie #${tokenId}`);
  }
  return entry;
}

/** pixelsHex, traitsHex, and merkle proof for Chroma.reveal(). */
export async function getRevealPayload(tokenId) {
  const id = tokenId.toString();
  const [mintData, proofs] = await Promise.all([loadMintDataByTokenId(), loadProofsDoc()]);

  const entry = mintData[id];
  if (!entry?.pixelsHex || !entry?.traitsHex) {
    throw new Error(`No mint data for Chromie #${id}`);
  }

  const proof = proofs?.proofs?.[id];
  if (!Array.isArray(proof) || proof.length === 0) {
    throw new Error(`No merkle proof for Chromie #${id}`);
  }

  const root = proofs.root;
  if (!root) {
    throw new Error("Reveal proofs missing merkle root");
  }

  const leaf = computeRevealLeaf(id, entry.pixelsHex, entry.traitsHex);
  if (!verifyMerkleProof(proof, root, leaf)) {
    const msg = `mint data out of sync with proofs for Chromie #${id}`;
    console.error(msg, { leaf, root, tokenId: id });
    throw new Error(msg);
  }

  return {
    pixelsHex: entry.pixelsHex,
    traitsHex: entry.traitsHex,
    proof,
    root,
  };
}
