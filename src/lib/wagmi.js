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

export const injectedConnector = injected({ shimDisconnect: true });
export const walletConnectConnector = projectId
  ? walletConnect({ projectId })
  : null;

const connectors = walletConnectConnector
  ? [injectedConnector, walletConnectConnector]
  : [injectedConnector];

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
