import { chromaAbi } from "../../abis/Chroma.ts";
import { chromaCanvasV2Abi } from "../../abis/ChromaCanvasV2.ts";

const OWNER_SCAN_BATCH = 64;

/** Enumerate token IDs owned by `owner` via ownerOf scan (no ERC721Enumerable). */
export async function fetchOwnedChromaTokenIds(publicClient, chromaAddress, owner) {
  const ownerLower = owner.toLowerCase();

  const [balance, totalSupply] = await Promise.all([
    publicClient.readContract({
      address: chromaAddress,
      abi: chromaAbi,
      functionName: "balanceOf",
      args: [owner],
    }),
    publicClient.readContract({
      address: chromaAddress,
      abi: chromaAbi,
      functionName: "totalSupply",
    }),
  ]);

  if (balance === 0n || totalSupply === 0n) return [];

  const owned = [];

  for (let start = 1n; start <= totalSupply; start += BigInt(OWNER_SCAN_BATCH)) {
    const end =
      start + BigInt(OWNER_SCAN_BATCH - 1) > totalSupply
        ? totalSupply
        : start + BigInt(OWNER_SCAN_BATCH - 1);

    const checks = [];
    for (let id = start; id <= end; id += 1n) {
      checks.push(
        publicClient
          .readContract({
            address: chromaAddress,
            abi: chromaAbi,
            functionName: "ownerOf",
            args: [id],
          })
          .then((tokenOwner) => (tokenOwner.toLowerCase() === ownerLower ? id : null))
          .catch(() => null),
      );
    }

    const batch = await Promise.all(checks);
    for (const id of batch) {
      if (id !== null) owned.push(id);
    }

    if (BigInt(owned.length) >= balance) break;
  }

  return owned.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
}

/** Map tokenId string -> revealed flag from Chroma.revealed(). */
export async function fetchTokenRevealStatus(publicClient, chromaAddress, tokenIds) {
  if (!publicClient || !chromaAddress || tokenIds.length === 0) return {};

  const entries = await Promise.all(
    tokenIds.map(async (tokenId) => {
      const revealed = await publicClient.readContract({
        address: chromaAddress,
        abi: chromaAbi,
        functionName: "revealed",
        args: [tokenId],
      });
      return [tokenId.toString(), revealed];
    }),
  );

  return Object.fromEntries(entries);
}

/** Map tokenId string -> isLocked from Chroma.isLocked(). */
export async function fetchTokenLockStatus(publicClient, chromaAddress, tokenIds) {
  if (!publicClient || !chromaAddress || tokenIds.length === 0) return {};

  const entries = await Promise.all(
    tokenIds.map(async (tokenId) => {
      const locked = await publicClient.readContract({
        address: chromaAddress,
        abi: chromaAbi,
        functionName: "isLocked",
        args: [tokenId],
      });
      return [tokenId.toString(), locked];
    }),
  );

  return Object.fromEntries(entries);
}

/** Per-token canvas customization stats from ChromaCanvasV2. */
export async function fetchTokenCanvasStats(publicClient, canvasAddress, tokenIds) {
  if (!publicClient || !canvasAddress || tokenIds.length === 0) return {};

  const entries = await Promise.all(
    tokenIds.map(async (tokenId) => {
      const [customized, pixelsEdited, actionPoints] = await Promise.all([
        publicClient.readContract({
          address: canvasAddress,
          abi: chromaCanvasV2Abi,
          functionName: "isCustomized",
          args: [tokenId],
        }),
        publicClient.readContract({
          address: canvasAddress,
          abi: chromaCanvasV2Abi,
          functionName: "getPixelsEdited",
          args: [tokenId],
        }),
        publicClient.readContract({
          address: canvasAddress,
          abi: chromaCanvasV2Abi,
          functionName: "actionPoints",
          args: [tokenId],
        }),
      ]);
      return [tokenId.toString(), { customized, pixelsEdited, actionPoints }];
    }),
  );

  return Object.fromEntries(entries);
}

/** Live spendable AP for one token (not in tokenURI). */
export async function fetchTokenActionPoints(publicClient, canvasAddress, tokenId) {
  if (!publicClient || !canvasAddress || tokenId == null) return null;

  return publicClient.readContract({
    address: canvasAddress,
    abi: chromaCanvasV2Abi,
    functionName: "actionPoints",
    args: [BigInt(tokenId)],
  });
}
