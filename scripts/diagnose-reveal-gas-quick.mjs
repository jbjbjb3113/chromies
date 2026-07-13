import fs from "node:fs";
import "dotenv/config";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { chromaAbi } from "../abis/Chroma.ts";

const CHROMA = "0x8162114c056DfC49045c04C66f1E03b761d81eD5";
const tokenId = BigInt(process.argv[2] ?? "2");

function loadRow(id) {
  const raw = fs.readFileSync("art-pipeline/output/mint-data.json", "utf8");
  const block = raw.split(`"tokenId": ${id},`)[1];
  if (!block) throw new Error(`token ${id} not found`);
  const pixelsHex = block.match(/"pixelsHex": "(0x[^"]+)"/)[1];
  const traitsHex = block.match(/"traitsHex": "(0x[^"]+)"/)[1];
  return { pixelsHex, traitsHex };
}

const proofs = JSON.parse(
  fs.readFileSync("art-pipeline/output/reveal-merkle-proofs.json", "utf8"),
);
const { pixelsHex, traitsHex } = loadRow(Number(tokenId));
const client = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

const owner = await client.readContract({
  address: CHROMA,
  abi: chromaAbi,
  functionName: "ownerOf",
  args: [tokenId],
});

try {
  const gas = await client.estimateContractGas({
    address: CHROMA,
    abi: chromaAbi,
    functionName: "reveal",
    args: [tokenId, pixelsHex, traitsHex, proofs.proofs[tokenId.toString()]],
    account: owner,
  });
  console.log(`estimateContractGas (owner): ${gas} (${(Number(gas) / 1000).toFixed(1)}k)`);
  console.log(`with 20% wallet buffer: ${Math.ceil(Number(gas) * 1.2)}`);
} catch (error) {
  console.log("estimateContractGas (owner) FAILED:", error?.shortMessage ?? error?.message ?? error);
}

try {
  await client.estimateContractGas({
    address: CHROMA,
    abi: chromaAbi,
    functionName: "reveal",
    args: [tokenId, pixelsHex, traitsHex, proofs.proofs[tokenId.toString()]],
    account: "0x1111111111111111111111111111111111111111",
  });
} catch (error) {
  console.log("estimateContractGas (wrong owner) FAILED:", error?.shortMessage ?? error?.message ?? error);
}

// token 1+ public vs art sync check (post-sync should all match)
function rowFrom(path, id) {
  const raw = fs.readFileSync(path, "utf8");
  const block = raw.split(`"tokenId": ${id},`)[1];
  if (!block) return null;
  return {
    pixelsHex: block.match(/"pixelsHex": "(0x[^"]+)"/)[1],
    traitsHex: block.match(/"traitsHex": "(0x[^"]+)"/)[1],
  };
}

for (const id of [1, 2, 3, 4, 10]) {
  const art = rowFrom("art-pipeline/output/mint-data.json", id);
  const pub = rowFrom("public/data/mint-data.json", id);
  if (!art || !pub) {
    console.log(`token${id} traits art vs public match: n/a (missing row)`);
    continue;
  }
  const match =
    art.pixelsHex === pub.pixelsHex && art.traitsHex === pub.traitsHex;
  console.log(`token${id} traits art vs public match: ${match}`);
}
