import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { DEFAULT_CHAIN } from "./chroma-contract.js";

const alchemyKey = import.meta.env.VITE_ALCHEMY_KEY?.trim();

function alchemyRpc(chainSlug) {
  if (!alchemyKey) return undefined;
  return `https://${chainSlug}.g.alchemy.com/v2/${alchemyKey}`;
}

export const wagmiConfig = getDefaultConfig({
  appName: "Chromies",
  projectId: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID ?? "00000000000000000000000000000000",
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(alchemyRpc("eth-mainnet")),
    [sepolia.id]: http(alchemyRpc("eth-sepolia")),
  },
  ssr: false,
});

export const initialChain = DEFAULT_CHAIN;
