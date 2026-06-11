import { sepolia, mainnet } from "wagmi/chains";
import { chromaAbi, PHASE } from "../../abis/Chroma.ts";

export const CHROMA_ADDRESS = {
  [sepolia.id]: "0x16cE47A7e36053d6460347a22B9857729eb09C94",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

/** ChromaCanvasV2 — per-token AP system. The `canvas` param for marketplace listings. */
export const CANVAS_ADDRESS = {
  [sepolia.id]: "0x35BdcfA0Dc7bCfC813C6B4e7da3AB58D05a5e274",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

export const MARKETPLACE_ADDRESS = {
  [sepolia.id]: "0xBE257661D9574E64B96416D901333BE75AFfC12c",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

export const SUPPORTED_CHAINS = [sepolia, mainnet];

export const DEFAULT_CHAIN = sepolia;

export { chromaAbi, PHASE };

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
