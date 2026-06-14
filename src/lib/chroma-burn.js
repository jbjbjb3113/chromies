import { encodeAbiParameters, keccak256, toHex } from "viem";
import { ACTION_POINTS_PER_BURN } from "../../abis/ChromaCanvasV2.ts";

const EMPTY_DIFF = "0x";

function randomBytes32() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes, { size: 32 });
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

export function estimateBurnAp(burnCount) {
  return BigInt(burnCount) * ACTION_POINTS_PER_BURN;
}
