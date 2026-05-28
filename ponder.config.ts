import { createConfig } from "ponder";
import { chromaAbi } from "./abis/Chroma";

const rpcUrl = process.env.PONDER_RPC_URL ?? "http://127.0.0.1:8545";
const chainId = Number(process.env.PONDER_CHAIN_ID ?? 31337);
const chromaAddress = process.env.CHROMA_ADDRESS as `0x${string}` | undefined;
const startBlock = Number(process.env.CHROMA_START_BLOCK ?? 0);

if (!chromaAddress) {
  throw new Error("Missing CHROMA_ADDRESS in environment.");
}

export default createConfig({
  chains: {
    chroma: {
      id: chainId,
      rpc: rpcUrl,
    },
  },
  contracts: {
    Chroma: {
      abi: chromaAbi,
      chain: "chroma",
      address: chromaAddress,
      startBlock,
    },
  },
});
