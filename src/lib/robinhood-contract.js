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
 * Live mainnet ChromiesCommemorative — deployed + seeded (100/100) 2026-07-11.
 * See chromies-engine/reports/ROBINHOOD_MAINNET_DEPLOY.md for the full deploy report.
 * mintOpen is false until JB flips it manually — the page must render an "opening soon"
 * state, not an error, until then (see LaunchEdition.jsx MintStatus/mintDisabledReason).
 *
 * CAUTION — address collision across chains, do not assume an address implies a chain:
 * the deployer address ran an equivalent sequence of prior transactions on both Robinhood
 * testnet (46630) and mainnet (4663), so CREATE nonces lined up and produced IDENTICAL
 * contract addresses on both chains for unrelated contracts:
 *   0xb3ad67d60C44E6db461f8957AF7a2f664c01275a — mainnet ChromaPaletteData (this deploy)
 *                                                  AND testnet's old dry-run ChromaStorage
 *   0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437 — mainnet ChromaRenderer (this deploy)
 *                                                  AND testnet's old dry-run ChromaRenderer
 * These are genuinely different contracts on genuinely different chains that happen to
 * share an address. Every address below MUST stay keyed by chain id (as this map already
 * does) — never hardcode an address without also pinning the chain id it's valid on.
 */
export const CHROMIES_COMMEMORATIVE_ADDRESS = {
  [robinhoodChain.id]: "0x10953E4975C35529a5034D54eBC9266cec0CE69D",
};

export { chromiesCommemorativeAbi };

export function getChromiesCommemorativeAddress(chainId) {
  const address = CHROMIES_COMMEMORATIVE_ADDRESS[chainId] ?? null;
  return address && address !== "0x0000000000000000000000000000000000000000" ? address : null;
}

export function isChromiesCommemorativeDeployed(chainId) {
  return Boolean(getChromiesCommemorativeAddress(chainId));
}
