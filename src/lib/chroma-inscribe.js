import { getRevealPayload, preloadRevealData } from "./chroma-reveal.js";

/** Lock-only inscribe for already-revealed tokens (preserves canvas edits). */
export function inscribeRevealedArgs(tokenId) {
  return { functionName: "inscribe", args: [tokenId] };
}

/** Reveal+lock for unrevealed tokens — verifies revealRoot merkle leaf. */
export async function getInscribeRevealArgs(tokenId) {
  const { pixelsHex, traitsHex, proof } = await getRevealPayload(tokenId);
  return {
    functionName: "inscribe",
    args: [tokenId, pixelsHex, traitsHex, proof],
  };
}

/** @deprecated Use inscribeRevealedArgs or getInscribeRevealArgs */
export async function getInscribePayload(tokenId) {
  return getRevealPayload(tokenId);
}

export { preloadRevealData };
