import { chromaAbi } from "../../abis/Chroma.ts";

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
