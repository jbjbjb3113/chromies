import { sepolia, mainnet } from "wagmi/chains";
import { chromaAbi, PHASE } from "../../abis/Chroma.ts";
import { chromaCanvasV2Abi } from "../../abis/ChromaCanvasV2.ts";

export const CHROMA_STORAGE_ADDRESS = {
  [sepolia.id]: "0x557933b09005C6254d3884A1F93a03e740920A42",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

export const CHROMA_ADDRESS = {
  [sepolia.id]: "0x8162114c056DfC49045c04C66f1E03b761d81eD5",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

/** ChromaCanvasV2 — per-token AP system. The `canvas` param for marketplace listings. */
export const CANVAS_ADDRESS = {
  [sepolia.id]: "0xa2e15dF33b21dDB62190B2Cd8C08e63350608DfB",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

export const MARKETPLACE_ADDRESS = {
  [sepolia.id]: "0x8D0b8327bcC96eF62b3de94687490298a52D3079",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

export const CHROMA_RENDERER_ADDRESS = {
  [sepolia.id]: "0x7680D210ed242330877b31D9749a92307484Aae1",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

export const CHROMA_PALETTE_DATA_ADDRESS = {
  [sepolia.id]: "0x4Ff9Ef71A403579DdfCaC5294792306ebD38F0a7",
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
};

export const SUPPORTED_CHAINS = [sepolia, mainnet];

export const DEFAULT_CHAIN = sepolia;

export { chromaAbi, chromaCanvasV2Abi, PHASE };

export function getChromaStorageAddress(chainId) {
  return CHROMA_STORAGE_ADDRESS[chainId] ?? null;
}

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

export function getChromaRendererAddress(chainId) {
  return CHROMA_RENDERER_ADDRESS[chainId] ?? null;
}

export function getChromaPaletteDataAddress(chainId) {
  return CHROMA_PALETTE_DATA_ADDRESS[chainId] ?? null;
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

/** Per-phase wallet caps — all phases allow 5 mints per wallet on-chain. */
export const PHASE_WALLET_MAX = {
  [PHASE.AllowlistOne]: 5,
  [PHASE.AllowlistTwo]: 5,
  [PHASE.Public]: 5,
};

/** Display fallbacks when contract reads are unavailable (Sepolia/mainnet use on-chain values). */
export const MINT_PRICES_ETH = {
  allowlistOne: "0.0025",
  allowlistTwo: "0.0035",
  public: "0.0045",
};

export function getPhaseWalletMax(phase, maxPerWalletOne) {
  if (phase === PHASE.AllowlistOne) {
    return maxPerWalletOne !== undefined ? Number(maxPerWalletOne) : PHASE_WALLET_MAX[PHASE.AllowlistOne];
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
