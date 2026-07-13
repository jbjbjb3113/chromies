import "dotenv/config";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { chromaAbi } from "../abis/Chroma.ts";
import { chromaCanvasV2Abi } from "../abis/ChromaCanvasV2.ts";

const CHROMA = "0x8162114c056DfC49045c04C66f1E03b761d81eD5" as const;
const CANVAS = "0x6F70Bd58bBBfB4B4af0E073efbFaF68D0b8Abe2c" as const;
const RPC = process.env.SEPOLIA_RPC_URL?.trim() || "https://ethereum-sepolia-rpc.publicnode.com";

async function main() {
  const client = createPublicClient({ chain: sepolia, transport: http(RPC) });

  const [chromaStorage, canvasOnChroma, renderer, totalSupply] = await Promise.all([
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "chromaStorage" }),
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "canvas" }).catch(() => null),
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "renderer" }),
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "totalSupply" }),
  ]);

  console.log("Chroma.chromaStorage:", chromaStorage);
  console.log("Chroma.canvas:", canvasOnChroma);
  console.log("Chroma.renderer:", renderer);
  console.log("Expected canvas:", CANVAS);
  console.log("totalSupply:", totalSupply.toString());

  for (let id = 1n; id <= totalSupply && id <= 5n; id++) {
    const [owner, level, earned, ap] = await Promise.all([
      client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "ownerOf", args: [id] }),
      client.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "getLevel", args: [id] }),
      client.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "totalApEarned", args: [id] }),
      client.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "actionPoints", args: [id] }),
    ]);
    console.log(`#${id} owner=${owner} earned=${earned} ap=${ap} level=${level}`);
  }
}

main().catch(console.error);
