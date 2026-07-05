import { getRevealPayload, preloadRevealData } from "./chroma-reveal.js";

/** Full-payload inscribe — requires prior reveal; writes pixels on-chain + locks. */
export async function getInscribeArgs(tokenId) {
  const { pixelsHex, traitsHex, proof } = await getRevealPayload(tokenId);
  return {
    functionName: "inscribe",
    args: [tokenId, pixelsHex, traitsHex, proof],
  };
}

/** @deprecated Use getInscribeArgs */
export async function getInscribeRevealArgs(tokenId) {
  return getInscribeArgs(tokenId);
}

export { preloadRevealData };
