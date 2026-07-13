/**
 * Diagnose reveal() gas estimate on live Sepolia Chroma.
 * Usage: npx tsx scripts/diagnose-reveal-gas.ts [tokenId]
 */
import "dotenv/config";
import fs from "node:fs";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { chromaAbi } from "../abis/Chroma.ts";

const CHROMA = "0x8162114c056DfC49045c04C66f1E03b761d81eD5" as const;
const RPC =
  process.env.SEPOLIA_RPC_URL?.trim() ||
  "https://ethereum-sepolia-rpc.publicnode.com";

type MintRow = { tokenId: number; pixelsHex: string; traitsHex: string };

function loadMintRow(tokenId: number): MintRow {
  const raw = fs.readFileSync("art-pipeline/output/mint-data.json", "utf8");
  const re = new RegExp(
    `\\{"tokenId":${tokenId},"pixelsHex":"(0x[^"]+)","traitsHex":"(0x[^"]+)"`,
  );
  const match = raw.match(re);
  if (!match) throw new Error(`mint-data row not found for token ${tokenId}`);
  return { tokenId, pixelsHex: match[1], traitsHex: match[2] };
}

async function main() {
  const tokenId = BigInt(process.argv[2] ?? "2");
  const client = createPublicClient({ chain: sepolia, transport: http(RPC) });

  console.log("=== Reveal gas diagnostic (Sepolia) ===");
  console.log(`Chroma:  ${CHROMA}`);
  console.log(`RPC:     ${RPC.replace(/\/v2\/[^/]+$/, "/v2/***")}`);
  console.log(`Token:   #${tokenId}\n`);

  for (const fn of ["revealedTraits", "revealedBaseURI"] as const) {
    try {
      const value = await client.readContract({
        address: CHROMA,
        abi: chromaAbi,
        functionName: fn,
        args: fn === "revealedTraits" ? [tokenId] : [],
      });
      console.log(`${fn}: present → ${value}`);
    } catch {
      console.log(`${fn}: NOT on deployed contract (pre-migration)`);
    }
  }

  const revealRootAbi = [
    {
      type: "function",
      name: "revealRoot",
      stateMutability: "view",
      inputs: [],
      outputs: [{ name: "", type: "bytes32" }],
    },
  ] as const;

  const [owner, revealed, revealRoot, totalSupply] = await Promise.all([
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "ownerOf", args: [tokenId] }),
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "revealed", args: [tokenId] }),
    client.readContract({ address: CHROMA, abi: revealRootAbi, functionName: "revealRoot" }),
    client.readContract({ address: CHROMA, abi: chromaAbi, functionName: "totalSupply" }),
  ]);

  console.log(`totalSupply: ${totalSupply}`);
  console.log(`owner:       ${owner}`);
  console.log(`revealed:    ${revealed}`);
  console.log(`revealRoot:  ${revealRoot}`);

  const proofsDoc = JSON.parse(
    fs.readFileSync("art-pipeline/output/reveal-merkle-proofs.json", "utf8"),
  ) as { root: string; proofs: Record<string, string[]> };

  console.log(`proofs root: ${proofsDoc.root}`);
  console.log(`roots match: ${revealRoot.toLowerCase() === proofsDoc.root.toLowerCase()}\n`);

  const entry = loadMintRow(Number(tokenId));
  const proof = proofsDoc.proofs[tokenId.toString()];
  if (!proof?.length) throw new Error(`No merkle proof for token ${tokenId}`);

  console.log(`pixels calldata: ${(entry.pixelsHex.length - 2) / 2} bytes`);
  console.log(`traits calldata: ${(entry.traitsHex.length - 2) / 2} bytes`);
  console.log(`proof depth:     ${proof.length}\n`);

  try {
    const gas = await client.estimateContractGas({
      address: CHROMA,
      abi: chromaAbi,
      functionName: "reveal",
      args: [tokenId, entry.pixelsHex as `0x${string}`, entry.traitsHex as `0x${string}`, proof as `0x${string}`[]],
      account: owner,
    });
    console.log(`estimateContractGas: ${gas.toString()} (${(Number(gas) / 1000).toFixed(1)}k)`);
    console.log(`With 20% buffer (typical wallet): ~${Math.ceil(Number(gas) * 1.2).toLocaleString()}`);
  } catch (error) {
    const err = error as { shortMessage?: string; message?: string; cause?: unknown };
    console.log("estimateContractGas FAILED:");
    console.log(err.shortMessage ?? err.message ?? error);
    console.log("\nIf this reverts, the wallet may surface a misleading submit error.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
