import "dotenv/config";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { chromaAbi } from "../abis/Chroma.ts";
import { chromaCanvasV2Abi } from "../abis/ChromaCanvasV2.ts";

const CHROMA = "0x8162114c056DfC49045c04C66f1E03b761d81eD5" as const;
const CANVAS = "0xa2e15dF33b21dDB62190B2Cd8C08e63350608DfB" as const;
const EMPTY = "0x" as const;
const TIMEOUT = 300_000;

const ownerMintAbi = [{
  type: "function",
  name: "mint",
  stateMutability: "nonpayable",
  inputs: [
    { name: "to", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "pixels", type: "bytes" },
    { name: "traits", type: "bytes" },
  ],
  outputs: [],
}] as const;

type MintRow = { tokenId: number; pixelsHex: string; traitsHex: string };

function loadJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

async function main() {
  const pk = process.env.PRIVATE_KEY!.trim();
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`);
  const RPC = process.env.SEPOLIA_RPC_URL!.trim();
  const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

  const fees = await pub.estimateFeesPerGas();
  const gas = {
    maxFeePerGas: (fees.maxFeePerGas ?? 2_000_000_000n) * 3n,
    maxPriorityFeePerGas: (fees.maxPriorityFeePerGas ?? 1_000_000_000n) * 3n,
  };

  async function send(args: Parameters<typeof wallet.writeContract>[0]) {
    const nonce = await pub.getTransactionCount({ address: account.address, blockTag: "latest" });
    const hash = await wallet.writeContract({ ...args, ...gas, nonce });
    console.log("  tx:", hash);
    const r = await pub.waitForTransactionReceipt({ hash, timeout: TIMEOUT });
    console.log("  status:", r.status);
    return r;
  }

  const supply = await pub.readContract({ address: CHROMA, abi: chromaAbi, functionName: "totalSupply" });
  const receiverId = supply + 1n;
  const burnId = supply + 2n;
  const mintData = loadJson<MintRow[]>("art-pipeline/output/mint-data.json");

  for (const id of [receiverId, burnId]) {
    const entry = mintData.find((r) => r.tokenId === Number(id));
    if (!entry) throw new Error(`no mint-data for #${id}`);
    console.log(`Owner-mint revealed #${id}...`);
    await send({
      address: CHROMA,
      abi: ownerMintAbi,
      functionName: "mint",
      args: [account.address, id, entry.pixelsHex as `0x${string}`, entry.traitsHex as `0x${string}`],
    });
  }

  const ok = await pub.readContract({
    address: CHROMA, abi: chromaAbi, functionName: "isApprovedForAll", args: [account.address, CANVAS],
  });
  if (!ok) {
    console.log("Approving canvas...");
    await send({ address: CHROMA, abi: chromaAbi, functionName: "setApprovalForAll", args: [CANVAS, true] });
  }

  const burnAp = await pub.readContract({
    address: CANVAS, abi: chromaCanvasV2Abi, functionName: "calculateBurnAP", args: [burnId],
  });
  console.log(`calculateBurnAP(#${burnId}):`, burnAp.toString());

  const salt = keccak256(encodeAbiParameters([{ type: "string" }], [`level-${burnId}-into-${receiverId}`]));
  const commitment = keccak256(encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }, { type: "bytes32" }],
    [account.address, receiverId, burnId, EMPTY, salt],
  ));

  console.log(`Burn #${burnId} into #${receiverId}...`);
  await send({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "submitCommit", args: [commitment] });
  await send({
    address: CANVAS, abi: chromaCanvasV2Abi, functionName: "revealBurnAndApplyDiff",
    args: [receiverId, burnId, salt, EMPTY],
  });

  const [earned, ap, level] = await Promise.all([
    pub.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "totalApEarned", args: [receiverId] }),
    pub.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "actionPoints", args: [receiverId] }),
    pub.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "getLevel", args: [receiverId] }),
  ]);
  const expected = earned === 0n ? 0n : BigInt(Math.floor(Math.sqrt(Number(earned / 50n))));

  console.log(`\n#${receiverId} totalApEarned:`, earned.toString());
  console.log(`#${receiverId} actionPoints:`, ap.toString());
  console.log(`#${receiverId} getLevel():`, level.toString(), "expected:", expected.toString());

  if (earned === 0n || level !== expected || ap !== earned) process.exit(1);
  console.log("PASS — /my-chromies should show Level", level.toString(), `on token #${receiverId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
