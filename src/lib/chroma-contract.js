import { sepolia, mainnet } from "wagmi/chains";
import { chromaAbi, PHASE } from "../../abis/Chroma.ts";

export const CHROMA_ADDRESS = {
  [sepolia.id]: "0xd328B64ed99fbfE39cFAE80B46Db28553bcD35D9",
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
