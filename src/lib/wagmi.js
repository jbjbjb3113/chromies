import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { mainnet, sepolia } from "wagmi/chains";
import { DEFAULT_CHAIN } from "./chroma-contract.js";

const alchemyKey = import.meta.env.VITE_ALCHEMY_KEY?.trim();
export const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID?.trim();

function alchemyRpc(chainSlug) {
  if (!alchemyKey) return undefined;
  return `https://${chainSlug}.g.alchemy.com/v2/${alchemyKey}`;
}

export const metaMaskConnector = injected({
  target: "metaMask",
  shimDisconnect: true,
});

export const phantomConnector = injected({
  target() {
    if (typeof window === "undefined") return undefined;
    const provider = window.phantom?.ethereum;
    if (!provider) return undefined;
    return { id: "phantom", name: "Phantom", provider };
  },
  shimDisconnect: true,
});

/** @deprecated Use metaMaskConnector — kept for SiteHeader */
export const injectedConnector = metaMaskConnector;

export const walletConnectConnector = projectId
  ? walletConnect({ projectId })
  : null;

const connectors = walletConnectConnector
  ? [metaMaskConnector, phantomConnector, walletConnectConnector]
  : [metaMaskConnector, phantomConnector];

export const wagmiConfig = createConfig({
  connectors,
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(alchemyRpc("eth-mainnet")),
    [sepolia.id]: http(alchemyRpc("eth-sepolia")),
  },
  ssr: false,
});

export { DEFAULT_CHAIN as initialChain };
