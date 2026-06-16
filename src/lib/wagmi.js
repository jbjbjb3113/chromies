import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { mainnet, sepolia } from "wagmi/chains";
import { DEFAULT_CHAIN } from "./chroma-contract.js";
import { INJECTED_WALLETS } from "./wallet-providers.js";

const alchemyKey = import.meta.env.VITE_ALCHEMY_KEY?.trim();
export const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID?.trim();

function alchemyRpc(chainSlug) {
  if (!alchemyKey) return undefined;
  return `https://${chainSlug}.g.alchemy.com/v2/${alchemyKey}`;
}

function createInjectedWalletConnector(walletId) {
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
  });
}

export const metaMaskConnector = createInjectedWalletConnector("metaMask");
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
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(alchemyRpc("eth-mainnet")),
    [sepolia.id]: http(alchemyRpc("eth-sepolia")),
  },
  // Explicit connector list above — avoid duplicate MIPD auto-discovered wallets.
  multiInjectedProviderDiscovery: false,
  ssr: false,
});

export { DEFAULT_CHAIN as initialChain };
