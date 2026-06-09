import { sepolia, mainnet } from "wagmi/chains";
import { chromaAbi, PHASE } from "../../abis/Chroma.ts";

export const CHROMA_ADDRESS = {
  [sepolia.id]: "0x8d65E485d6c11896ce62692E565c8dE80473CeC9",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

export const SUPPORTED_CHAINS = [sepolia, mainnet];

export const DEFAULT_CHAIN = sepolia;

export { chromaAbi, PHASE };

export function getChromaAddress(chainId) {
  return CHROMA_ADDRESS[chainId] ?? null;
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
