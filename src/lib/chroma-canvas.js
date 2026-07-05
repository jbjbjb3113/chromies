import { chromaAbi, chromaCanvasV2Abi } from "./chroma-contract.js";

/**
 * Encode pixel edits for ChromaCanvasV2.applyDiff.
 * Each entry: uint16 pixelIndex (big-endian) + uint8 newColorIndex (3 bytes).
 */
export function encodeCanvasDiff(indices, original) {
  if (!indices || !original || indices.length !== original.length) {
    throw new Error("Invalid indices for diff encoding.");
  }

  const bytes = [];
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] === original[i]) continue;
    bytes.push((i >> 8) & 0xff, i & 0xff, indices[i]);
  }

  if (bytes.length === 0) return "0x";
  return `0x${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function fetchCanvasDiffs(publicClient, canvasAddress, tokenId) {
  const [pixelIndexes, newColorIndexes] = await publicClient.readContract({
    address: canvasAddress,
    abi: chromaCanvasV2Abi,
    functionName: "getDiff",
    args: [BigInt(tokenId)],
  });
  return { pixelIndexes, newColorIndexes };
}

export async function fetchCanvasEditState(publicClient, chromaAddress, canvasAddress, tokenId) {
  const id = BigInt(tokenId);
  const [actionPoints, isLocked] = await Promise.all([
    publicClient.readContract({
      address: canvasAddress,
      abi: chromaCanvasV2Abi,
      functionName: "actionPoints",
      args: [id],
    }),
    publicClient.readContract({
      address: chromaAddress,
      abi: chromaAbi,
      functionName: "isLocked",
      args: [id],
    }),
  ]);

  return { actionPoints, isLocked };
}

export async function fetchTokenOwner(publicClient, chromaAddress, tokenId) {
  return publicClient.readContract({
    address: chromaAddress,
    abi: chromaAbi,
    functionName: "ownerOf",
    args: [BigInt(tokenId)],
  });
}
