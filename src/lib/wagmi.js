import { createConfig, fallback, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { mainnet, sepolia } from "wagmi/chains";
import { DEFAULT_CHAIN } from "./chroma-contract.js";
import { robinhoodChain, ROBINHOOD_MAINNET_PUBLIC_RPC } from "./robinhood-contract.js";
import { INJECTED_WALLETS } from "./wallet-providers.js";

const alchemyKey = import.meta.env.VITE_ALCHEMY_KEY?.trim();
// Optional dedicated override — set this if the shared VITE_ALCHEMY_KEY app doesn't have
// the Robinhood Chain network enabled. See robinhood-contract.js header comment for the
// exact var name/value and where to set it (dev vs Cloudflare Pages prod).
const robinhoodAlchemyUrlOverride = import.meta.env.VITE_ALCHEMY_RH_MAINNET_URL?.trim();
export const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID?.trim();

function alchemyRpc(chainSlug) {
  if (!alchemyKey) return undefined;
  return `https://${chainSlug}.g.alchemy.com/v2/${alchemyKey}`;
}

/**
 * Robinhood Chain mainnet transport — Alchemy primary, public RPC fallback.
 * `fallback()` (viem) tries transports in order and moves to the next on failure, so a
 * dead/rate-limited Alchemy key degrades to the public RPC instead of erroring the page.
 * Prefers a dedicated VITE_ALCHEMY_RH_MAINNET_URL if JB sets one; otherwise reuses the
 * shared VITE_ALCHEMY_KEY against the robinhood-mainnet app slug.
 */
function robinhoodMainnetTransport() {
  const alchemyUrl = robinhoodAlchemyUrlOverride || alchemyRpc("robinhood-mainnet");
  const transports = alchemyUrl
    ? [http(alchemyUrl), http(ROBINHOOD_MAINNET_PUBLIC_RPC)]
    : [http(ROBINHOOD_MAINNET_PUBLIC_RPC)];
  return fallback(transports);
}

function createInjectedWalletConnector(walletId, injectedOptions = {}) {
  const { name, getProvider } = INJECTED_WALLETS[walletId];
  // Static target keeps connector.id stable (e.g. "metaMask"). A target() function
  // falls back to id "injected" when the provider is momentarily unavailable,
  // which breaks useConnectors() lookups by wallet id.
  return injected({
    target: {
      id: walletId,
      name,
      provider() {
        return getProvider();
      },
    },
    shimDisconnect: true,
    ...injectedOptions,
  });
}

export const metaMaskConnector = createInjectedWalletConnector("metaMask", {
  // MetaMask may inject asynchronously when other wallets own window.ethereum.
  unstable_shimAsyncInject: 1_000,
});
export const phantomConnector = createInjectedWalletConnector("phantom");
export const trustConnector = createInjectedWalletConnector("trust");
export const coinbaseConnector = createInjectedWalletConnector("coinbase");
export const rainbowConnector = createInjectedWalletConnector("rainbow");
export const okxConnector = createInjectedWalletConnector("okx");
export const rabbyConnector = createInjectedWalletConnector("rabby");
export const braveConnector = createInjectedWalletConnector("brave");

/** @deprecated Use metaMaskConnector — kept for legacy imports */
export const injectedConnector = metaMaskConnector;

export const walletConnectConnector = projectId
  ? walletConnect({ projectId })
  : null;

const injectedConnectors = [
  metaMaskConnector,
  phantomConnector,
  trustConnector,
  coinbaseConnector,
  rainbowConnector,
  okxConnector,
  rabbyConnector,
  braveConnector,
];

/** Registered connector factories keyed by wallet id (for connect() without id lookup). */
export const WALLET_CONNECTOR_BY_ID = {
  metaMask: metaMaskConnector,
  phantom: phantomConnector,
  trust: trustConnector,
  coinbase: coinbaseConnector,
  rainbow: rainbowConnector,
  okx: okxConnector,
  rabby: rabbyConnector,
  brave: braveConnector,
};

const connectors = walletConnectConnector
  ? [...injectedConnectors, walletConnectConnector]
  : injectedConnectors;

export const wagmiConfig = createConfig({
  connectors,
  chains: [mainnet, sepolia, robinhoodChain],
  transports: {
    [mainnet.id]: http(alchemyRpc("eth-mainnet")),
    [sepolia.id]: http(alchemyRpc("eth-sepolia")),
    [robinhoodChain.id]: robinhoodMainnetTransport(),
  },
  // Explicit connector list above — avoid duplicate MIPD auto-discovered wallets.
  multiInjectedProviderDiscovery: false,
  ssr: false,
});

export { DEFAULT_CHAIN as initialChain };
