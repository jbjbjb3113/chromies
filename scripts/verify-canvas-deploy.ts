/**
 * Verify new canvas: wiring, TIER thresholds, calculateBurnAP, getLevel via owner-mint + burn.
 */
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
const CANVAS = (process.env.CANVAS_ADDRESS ?? "0xa2e15dF33b21dDB62190B2Cd8C08e63350608DfB") as `0x${string}`;
const RENDERER = "0x7680D210ed242330877b31D9749a92307484Aae1" as const;
const STORAGE = "0x557933b09005C6254d3884A1F93a03e740920A42" as const;
const EMPTY = "0x" as const;

const canvasGetter = [{ type: "function", name: "canvas", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;
const storageGetter = [{ type: "function", name: "chromaStorage", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;
const rendererCanvasGetter = [{ type: "function", name: "chromaCanvas", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;
const ownerMintAbi = [{
  type: "function", name: "mint", stateMutability: "nonpayable",
  inputs: [
    { name: "to", type: "address" }, { name: "tokenId", type: "uint256" },
    { name: "pixels", type: "bytes" }, { name: "traits", type: "bytes" },
  ],
  outputs: [],
}] as const;

type MintRow = { tokenId: number; pixelsHex: string; traitsHex: string };
const loadJson = <T,>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;

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
    await pub.waitForTransactionReceipt({ hash, timeout: 300_000 });
    return hash;
  }

  const [canvasOnChroma, rendererCanvas, storageOnCanvas, t1, t2] = await Promise.all([
    pub.readContract({ address: CHROMA, abi: canvasGetter, functionName: "canvas" }),
    pub.readContract({ address: RENDERER, abi: rendererCanvasGetter, functionName: "chromaCanvas" }),
    pub.readContract({ address: CANVAS, abi: storageGetter, functionName: "chromaStorage" }),
    pub.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "TIER1_THRESHOLD" }),
    pub.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "TIER2_THRESHOLD" }),
  ]);

  console.log("=== Wiring ===");
  console.log("Chroma.canvas:", canvasOnChroma, canvasOnChroma.toLowerCase() === CANVAS.toLowerCase() ? "OK" : "FAIL");
  console.log("Renderer.chromaCanvas:", rendererCanvas, rendererCanvas.toLowerCase() === CANVAS.toLowerCase() ? "OK" : "FAIL");
  console.log("Canvas.chromaStorage:", storageOnCanvas, storageOnCanvas.toLowerCase() === STORAGE.toLowerCase() ? "OK" : "FAIL");
  console.log("TIER1_THRESHOLD:", t1.toString(), t1 === 1500n ? "OK" : "FAIL");
  console.log("TIER2_THRESHOLD:", t2.toString(), t2 === 2000n ? "OK" : "FAIL");

  const supply = await pub.readContract({ address: CHROMA, abi: chromaAbi, functionName: "totalSupply" });
  const receiverId = supply + 1n;
  const burnId = supply + 2n;
  const mintData = loadJson<MintRow[]>("art-pipeline/output/mint-data.json");

  for (const id of [receiverId, burnId]) {
    const entry = mintData.find((r) => r.tokenId === Number(id))!;
    console.log(`Owner-mint #${id}...`);
    await send({
      address: CHROMA, abi: ownerMintAbi, functionName: "mint",
      args: [account.address, id, entry.pixelsHex as `0x${string}`, entry.traitsHex as `0x${string}`],
    });
  }

  const burnAp = await pub.readContract({
    address: CANVAS, abi: chromaCanvasV2Abi, functionName: "calculateBurnAP", args: [burnId],
  });
  const burnPixels = (Buffer.from(mintData.find((r) => r.tokenId === Number(burnId))!.traitsHex.replace(/^0x/, ""), "hex")[17] << 8)
    | Buffer.from(mintData.find((r) => r.tokenId === Number(burnId))!.traitsHex.replace(/^0x/, ""), "hex")[18];
  console.log(`\nBurn candidate #${burnId}: totalPixels=${burnPixels}, calculateBurnAP=${burnAp}`);

  const ok = await pub.readContract({
    address: CHROMA, abi: chromaAbi, functionName: "isApprovedForAll", args: [account.address, CANVAS],
  });
  if (!ok) await send({ address: CHROMA, abi: chromaAbi, functionName: "setApprovalForAll", args: [CANVAS, true] });

  const salt = keccak256(encodeAbiParameters([{ type: "string" }], [`verify-${burnId}-${Date.now()}`]));
  const commitment = keccak256(encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }, { type: "bytes32" }],
    [account.address, receiverId, burnId, EMPTY, salt],
  ));
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

  console.log(`\n=== Post-burn #${receiverId} ===`);
  console.log("totalApEarned:", earned.toString());
  console.log("actionPoints:", ap.toString());
  console.log("getLevel():", level.toString(), "expected:", expected.toString());
  console.log("AP matches calculateBurnAP:", earned === burnAp ? "OK" : "FAIL");

  if (canvasOnChroma.toLowerCase() !== CANVAS.toLowerCase()) throw new Error("canvas wiring failed");
  if (t1 !== 1500n || t2 !== 2000n) throw new Error("thresholds wrong");
  if (earned !== burnAp || ap !== earned || level !== expected || earned === 0n) throw new Error("burn/level verification failed");
  console.log("\nPASS");
}

main().catch((e) => { console.error(e); process.exit(1); });
