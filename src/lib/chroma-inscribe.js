import { getRevealPayload, preloadRevealData } from "./chroma-reveal.js";

/** Same merkle payload as reveal — Chroma.inscribe() verifies revealRoot leaf. */
export async function getInscribePayload(tokenId) {
  return getRevealPayload(tokenId);
}

export { preloadRevealData };
