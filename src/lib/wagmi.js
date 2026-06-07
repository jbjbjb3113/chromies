import { connectorsForWallets, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet, sepolia } from "wagmi/chains";
import { DEFAULT_CHAIN } from "./chroma-contract.js";

const alchemyKey = import.meta.env.VITE_ALCHEMY_KEY?.trim();
const projectId =
  import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID ?? "00000000000000000000000000000000";

function alchemyRpc(chainSlug) {
  if (!alchemyKey) return undefined;
  return `https://${chainSlug}.g.alchemy.com/v2/${alchemyKey}`;
}

const { wallets } = getDefaultWallets({
  appName: "Chromies",
  projectId,
});

const rainbowConnectors = connectorsForWallets(wallets, {
  appName: "Chromies",
  projectId,
});

export const wagmiConfig = createConfig({
  connectors: [injected(), ...rainbowConnectors],
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(alchemyRpc("eth-mainnet")),
    [sepolia.id]: http(alchemyRpc("eth-sepolia")),
  },
  ssr: false,
});

export const initialChain = DEFAULT_CHAIN;
