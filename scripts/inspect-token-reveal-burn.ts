import "dotenv/config";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { chromaAbi } from "../abis/Chroma.ts";
import { chromaCanvasV2Abi } from "../abis/ChromaCanvasV2.ts";

const CHROMA = "0x8162114c056DfC49045c04C66f1E03b761d81eD5" as const;
const CANVAS = (process.env.CANVAS_ADDRESS ??
  "0xa2e15dF33b21dDB62190B2Cd8C08e63350608DfB") as `0x${string}`;

async function main() {
  const RPC = process.env.SEPOLIA_RPC_URL?.trim() || "https://ethereum-sepolia-rpc.publicnode.com";
  const client = createPublicClient({ chain: sepolia, transport: http(RPC) });
  const supply = await client.readContract({
    address: CHROMA,
    abi: chromaAbi,
    functionName: "totalSupply",
  });
  console.log(`canvas: ${CANVAS}`);
  console.log(`totalSupply: ${supply}`);

  const max = supply < 10n ? supply : 10n;
  for (let id = 1n; id <= max; id++) {
    try {
      const [owner, revealed, earned, level, burnAp] = await Promise.all([
        client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "ownerOf", args: [id] }),
        client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "revealed", args: [id] }),
        client.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "totalApEarned", args: [id] }),
        client.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "getLevel", args: [id] }),
        client.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "calculateBurnAP", args: [id] }),
      ]);
      console.log(
        `#${id} revealed=${revealed} burnAP=${burnAp} earned=${earned} level=${level} owner=${owner.slice(0, 10)}...`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`#${id} err ${msg.slice(0, 80)}`);
    }
  }
}

main();
