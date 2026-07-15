import { defineChain } from "viem";
import { chromiesCommemorativeAbi } from "../../abis/ChromiesCommemorative.ts";

/**
 * Robinhood Chain mainnet — Arbitrum Orbit L2, ETH gas token.
 * docs.robinhood.com/chain/connecting (chain id 4663; testnet 46630 is not wired here —
 * the launch-edition mint is a mainnet-only collection per spec).
 *
 * rpcUrls.default stays the PUBLIC endpoint (no API key) deliberately: this array is what
 * gets handed to a wallet's `wallet_addEthereumChain` prompt when a user doesn't already
 * have Robinhood Chain configured, and a wallet will persist whatever URL it's given. An
 * Alchemy URL (with embedded key) here would leak into the user's own wallet network
 * settings and burn our rate limit on every future use. The Alchemy-primary/public-
 * fallback wiring lives one layer up, in the wagmi transport config (src/lib/wagmi.js) —
 * that's for OUR app's own reads, not for what we hand to the wallet.
 */
export const ROBINHOOD_MAINNET_PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [ROBINHOOD_MAINNET_PUBLIC_RPC] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

/**
 * Live mainnet ChromiesCommemorative — RE-DEPLOYED + reseeded (100/100) 2026-07-12
 * (the "Robinhood commemorative RE-DO"): new selection seed
 * "chromies-commemorative-redo-v2-2026-07-12" against the frozen non-legendary
 * 5,141 dataset, new ChromiesCommemorative + ChromaRendererRobinhood pair, wired
 * to the SAME already-verified ChromaPaletteData (0xb3ad67d60C44E6db461f8957AF7a2f664c01275a).
 * The prior 2026-07-11 deploy (0x10953E4975C35529a5034D54eBC9266cec0CE69D) is
 * retired — its funds were withdrawn and mintOpen was never left open on it, but
 * its address is intentionally NOT reused below; do not point the frontend at it.
 * See chromies-engine/reports/ROBINHOOD_MAINNET_DEPLOY.md (original) and the RE-DO
 * report (chromies-engine/reports/ROBINHOOD_COMMEMORATIVE_REDO.md) for full detail.
 * mintOpen is false until JB flips it manually — the page must render an "opening soon"
 * state, not an error, until then (see LaunchEdition.jsx MintStatus/mintDisabledReason).
 *
 * CAUTION — address collision across chains, do not assume an address implies a chain:
 * the deployer address ran an equivalent sequence of prior transactions on both Robinhood
 * testnet (46630) and mainnet (4663), so CREATE nonces lined up and produced IDENTICAL
 * contract addresses on both chains for unrelated contracts (from the ORIGINAL 2026-07-11
 * deploy sequence, still true/historical, not re-checked for the RE-DO's new addresses
 * below since testnet nonces were not advanced in lockstep with mainnet's RE-DO run):
 *   0xb3ad67d60C44E6db461f8957AF7a2f664c01275a — mainnet ChromaPaletteData (still live,
 *                                                  reused as-is by the RE-DO renderer)
 *                                                  AND testnet's old dry-run ChromaStorage
 *   0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437 — mainnet ChromaRenderer (retired,
 *                                                  original 2026-07-11 deploy)
 *                                                  AND testnet's old dry-run ChromaRenderer
 * These are genuinely different contracts on genuinely different chains that happen to
 * share an address. Every address below MUST stay keyed by chain id (as this map already
 * does) — never hardcode an address without also pinning the chain id it's valid on.
 */
export const CHROMIES_COMMEMORATIVE_ADDRESS = {
  [robinhoodChain.id]: "0x3C8C9615889762bDcF9647a3C86C74aFA498a158",
};

/** Live label-fix ChromaRendererRobinhood — post setRenderer() mainnet cutover. */
export const CHROMA_RENDERER_ROBINHOOD_ADDRESS = {
  [robinhoodChain.id]: "0x8b6380ca9247D9cA6C8E9a078c2c31E12034e364",
};

export function getChromaRendererRobinhoodAddress(chainId) {
  const address = CHROMA_RENDERER_ROBINHOOD_ADDRESS[chainId] ?? null;
  return address && address !== "0x0000000000000000000000000000000000000000" ? address : null;
}

export { chromiesCommemorativeAbi };

export function getChromiesCommemorativeAddress(chainId) {
  const address = CHROMIES_COMMEMORATIVE_ADDRESS[chainId] ?? null;
  return address && address !== "0x0000000000000000000000000000000000000000" ? address : null;
}

export function isChromiesCommemorativeDeployed(chainId) {
  return Boolean(getChromiesCommemorativeAddress(chainId));
}
