import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet, sepolia } from "wagmi/chains";
import { DEFAULT_CHAIN } from "./chroma-contract.js";

const alchemyKey = import.meta.env.VITE_ALCHEMY_KEY?.trim();

function alchemyRpc(chainSlug) {
  if (!alchemyKey) return undefined;
  return `https://${chainSlug}.g.alchemy.com/v2/${alchemyKey}`;
}

export const injectedConnector = injected({ shimDisconnect: true });

export const wagmiConfig = createConfig({
  connectors: [injectedConnector],
  chains: [sepolia, mainnet],
  transports: {
    [sepolia.id]: http(alchemyRpc("eth-sepolia")),
    [mainnet.id]: http(alchemyRpc("eth-mainnet")),
  },
  ssr: false,
});

export { DEFAULT_CHAIN as initialChain };
