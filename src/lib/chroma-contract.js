import { sepolia, mainnet } from "wagmi/chains";
import { chromaAbi, PHASE } from "../../abis/Chroma.ts";
import { chromaCanvasV2Abi } from "../../abis/ChromaCanvasV2.ts";

export const CHROMA_ADDRESS = {
  [sepolia.id]: "0x422A47Ee8e555CA62FAa38c26E26ae772F75B3fc",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

/** ChromaCanvasV2 — per-token AP system. The `canvas` param for marketplace listings. */
export const CANVAS_ADDRESS = {
  [sepolia.id]: "0x70Bffc256134d0f1078A0907552EC79EF9E346c1",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

export const MARKETPLACE_ADDRESS = {
  [sepolia.id]: "0x7110BFC19394062E8d5DFA77f13aF9b5d14F95F2",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

export const SUPPORTED_CHAINS = [sepolia, mainnet];

export const DEFAULT_CHAIN = sepolia;

export { chromaAbi, chromaCanvasV2Abi, PHASE };

export function getChromaAddress(chainId) {
  return CHROMA_ADDRESS[chainId] ?? null;
}

export function getCanvasAddress(chainId) {
  return CANVAS_ADDRESS[chainId] ?? null;
}

export function getMarketplaceAddress(chainId) {
  const address = MARKETPLACE_ADDRESS[chainId] ?? null;
  return address && address !== "0x0000000000000000000000000000000000000000" ? address : null;
}

export function isChromaDeployed(chainId) {
  const address = getChromaAddress(chainId);
  return Boolean(address && address !== "0x0000000000000000000000000000000000000000");
}

export const PHASE_LABELS = {
  [PHASE.Closed]: "Closed",
  [PHASE.AllowlistOne]: "Allowlist — Tier 1",
  [PHASE.AllowlistTwo]: "Allowlist — Tier 2",
  [PHASE.Public]: "Public Mint",
  [PHASE.Revealed]: "Revealed",
};

/** Per-phase wallet caps (contract: Tier2=2, Public=3; Tier1 reads MAX_PER_WALLET_ONE). */
export const PHASE_WALLET_MAX = {
  [PHASE.AllowlistOne]: null,
  [PHASE.AllowlistTwo]: 2,
  [PHASE.Public]: 3,
};

export function getPhaseWalletMax(phase, maxPerWalletOne) {
  if (phase === PHASE.AllowlistOne) {
    return maxPerWalletOne !== undefined ? Number(maxPerWalletOne) : 2;
  }
  if (phase === PHASE.AllowlistTwo) return PHASE_WALLET_MAX[PHASE.AllowlistTwo];
  if (phase === PHASE.Public) return PHASE_WALLET_MAX[PHASE.Public];
  return 0;
}

export function getClaimedCount(phase, claimedOne, claimedTwo, claimedPublic) {
  if (phase === PHASE.AllowlistOne) return Number(claimedOne ?? 0);
  if (phase === PHASE.AllowlistTwo) return Number(claimedTwo ?? 0);
  if (phase === PHASE.Public) return Number(claimedPublic ?? 0);
  return 0;
}

export function getRemainingMintAllowance(phase, claimedOne, claimedTwo, claimedPublic, maxPerWalletOne) {
  const max = getPhaseWalletMax(phase, maxPerWalletOne);
  const claimed = getClaimedCount(phase, claimedOne, claimedTwo, claimedPublic);
  return Math.max(0, max - claimed);
}
