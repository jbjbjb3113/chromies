import "dotenv/config";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { chromaAbi } from "../abis/Chroma.ts";
import { chromaCanvasV2Abi } from "../abis/ChromaCanvasV2.ts";

const CHROMA = "0x8162114c056DfC49045c04C66f1E03b761d81eD5" as const;
const CANVAS = "0xa2e15dF33b21dDB62190B2Cd8C08e63350608DfB" as const;

async function main() {
  const RPC = process.env.SEPOLIA_RPC_URL?.trim() || "https://ethereum-sepolia-rpc.publicnode.com";
  const client = createPublicClient({ chain: sepolia, transport: http(RPC) });
  const supply = await client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "totalSupply" });
  console.log("totalSupply:", supply.toString());
  for (const id of [1n, 9n, 11n, 12n]) {
    try {
      const owner = await client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "ownerOf", args: [id] });
      const [earned, level, burnAp] = await Promise.all([
        client.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "totalApEarned", args: [id] }),
        client.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "getLevel", args: [id] }),
        client.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "calculateBurnAP", args: [id] }),
      ]);
      console.log(`#${id} owner=${owner.slice(0,10)}... earned=${earned} level=${level} burnAP=${burnAp}`);
    } catch {
      console.log(`#${id} not minted`);
    }
  }
}
main();
