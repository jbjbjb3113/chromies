import { encodeAbiParameters, keccak256 } from "viem";
import { chromaCanvasV2Abi } from "../../abis/ChromaCanvasV2.ts";

const EMPTY_DIFF = "0x";

function randomBytes32() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Build commit-reveal salt + commitment for ChromaCanvasV2 burns.
 * commitment = keccak256(abi.encode(user, receiverTokenId, burnTokenId, diffData, salt))
 */
export function generateBurnCommitment(userAddress, receiverTokenId, burnTokenId, diffData = EMPTY_DIFF) {
  const salt = randomBytes32();
  const commitment = keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes" },
        { type: "bytes32" },
      ],
      [userAddress, BigInt(receiverTokenId), BigInt(burnTokenId), diffData, salt],
    ),
  );
  return { salt, commitment, diffData };
}

/** Per-token and total on-chain calculateBurnAP for tokens slated to burn. */
export async function fetchBurnApEstimates(publicClient, canvasAddress, burnTokenIds) {
  if (!publicClient || !canvasAddress || burnTokenIds.length === 0) {
    return { total: 0n, byTokenId: {} };
  }

  const amounts = await Promise.all(
    burnTokenIds.map((tokenId) =>
      publicClient.readContract({
        address: canvasAddress,
        abi: chromaCanvasV2Abi,
        functionName: "calculateBurnAP",
        args: [tokenId],
      }),
    ),
  );

  const byTokenId = {};
  let total = 0n;
  burnTokenIds.forEach((tokenId, index) => {
    const ap = amounts[index];
    byTokenId[tokenId.toString()] = ap;
    total += ap;
  });

  return { total, byTokenId };
}
