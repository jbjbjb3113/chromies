import { chromaAbi, chromaStorageAbi } from "../../abis/Chroma.ts";

export const TOKEN_DISPLAY_STATE = {
  Unrevealed: "unrevealed",
  RevealedOffChain: "revealed-offchain",
  Inscribed: "inscribed",
};

/** Resolve unrevealed / revealed-off-chain / inscribed from on-chain flags. */
export function resolveTokenDisplayState(revealed, hasData) {
  if (!revealed) return TOKEN_DISPLAY_STATE.Unrevealed;
  if (!hasData) return TOKEN_DISPLAY_STATE.RevealedOffChain;
  return TOKEN_DISPLAY_STATE.Inscribed;
}

/** Read revealed + ChromaStorage.hasData for a token. */
export async function fetchTokenDisplayState(publicClient, chromaAddress, tokenId) {
  const id = BigInt(tokenId);
  const storageAddress = await publicClient.readContract({
    address: chromaAddress,
    abi: chromaAbi,
    functionName: "chromaStorage",
  });

  const [revealed, hasData] = await Promise.all([
    publicClient.readContract({
      address: chromaAddress,
      abi: chromaAbi,
      functionName: "revealed",
      args: [id],
    }),
    publicClient.readContract({
      address: storageAddress,
      abi: chromaStorageAbi,
      functionName: "hasData",
      args: [id],
    }),
  ]);

  return {
    revealed,
    hasData,
    state: resolveTokenDisplayState(revealed, hasData),
  };
}
