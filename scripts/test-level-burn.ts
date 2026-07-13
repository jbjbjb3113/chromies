/**
 * Verify new canvas wiring and earn-based getLevel() via mint + reveal + burn on Sepolia.
 * Usage: npx tsx scripts/test-level-burn.ts
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
const CANVAS = "0xa2e15dF33b21dDB62190B2Cd8C08e63350608DfB" as const;
const RENDERER = "0x7680D210ed242330877b31D9749a92307484Aae1" as const;
const STORAGE = "0x557933b09005C6254d3884A1F93a03e740920A42" as const;

const chromaCanvasGetterAbi = [
  {
    type: "function",
    name: "canvas",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const canvasStorageGetterAbi = [
  {
    type: "function",
    name: "chromaStorage",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const ownerMintAbi = [
  {
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
  },
] as const;

const EMPTY_DIFF = "0x" as const;

type MintRow = { tokenId: number; pixelsHex: string; traitsHex: string };

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function expectedLevel(earned: bigint): bigint {
  if (earned === 0n) return 0n;
  return BigInt(Math.floor(Math.sqrt(Number(earned / 50n))));
}

async function ownerMintRevealed(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  account: `0x${string}`,
  tokenId: bigint,
) {
  const mintData = loadJson<MintRow[]>("art-pipeline/output/mint-data.json");
  const entry = mintData.find((row) => row.tokenId === Number(tokenId));
  if (!entry) throw new Error(`Missing mint-data for #${tokenId}`);

  console.log(`Owner-minting revealed token #${tokenId}...`);
  const hash = await walletClient.writeContract({
    address: CHROMA,
    abi: ownerMintAbi,
    functionName: "mint",
    args: [account, tokenId, entry.pixelsHex as `0x${string}`, entry.traitsHex as `0x${string}`],
  });
  await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
}

async function burnInto(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  account: `0x${string}`,
  receiverId: bigint,
  burnId: bigint,
) {
  const burnAp = await publicClient.readContract({
    address: CANVAS,
    abi: chromaCanvasV2Abi,
    functionName: "calculateBurnAP",
    args: [burnId],
  });
  console.log(`Burn #${burnId} -> #${receiverId}, calculateBurnAP=${burnAp}`);

  const salt = keccak256(encodeAbiParameters([{ type: "string" }], [`level-test-${burnId}-${Date.now()}`]));
  const commitment = keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes" },
        { type: "bytes32" },
      ],
      [account, receiverId, burnId, EMPTY_DIFF, salt],
    ),
  );

  const commitHash = await walletClient.writeContract({
    address: CANVAS,
    abi: chromaCanvasV2Abi,
    functionName: "submitCommit",
    args: [commitment],
  });
  await publicClient.waitForTransactionReceipt({ hash: commitHash, timeout: 180_000 });

  const revealHash = await walletClient.writeContract({
    address: CANVAS,
    abi: chromaCanvasV2Abi,
    functionName: "revealBurnAndApplyDiff",
    args: [receiverId, burnId, salt, EMPTY_DIFF],
  });
  await publicClient.waitForTransactionReceipt({ hash: revealHash, timeout: 180_000 });

  return burnAp;
}

async function main() {
  const pk = process.env.PRIVATE_KEY?.trim();
  if (!pk) throw new Error("PRIVATE_KEY missing from .env");

  const RPC =
    process.env.SEPOLIA_RPC_URL?.trim() ||
    "https://ethereum-sepolia-rpc.publicnode.com";

  const account = privateKeyToAccount(pk.startsWith("0x") ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`));
  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

  console.log("=== Level burn verification (Sepolia) ===");
  console.log("Deployer:", account.address);

  const [canvasOnChroma, rendererOnChroma, storageOnCanvas] = await Promise.all([
    publicClient.readContract({ address: CHROMA, abi: chromaCanvasGetterAbi, functionName: "canvas" }),
    publicClient.readContract({ address: CHROMA, abi: chromaAbi, functionName: "renderer" }),
    publicClient.readContract({ address: CANVAS, abi: canvasStorageGetterAbi, functionName: "chromaStorage" }),
  ]);

  console.log("\n--- Wiring ---");
  console.log("Chroma.canvas:", canvasOnChroma, canvasOnChroma.toLowerCase() === CANVAS.toLowerCase() ? "OK" : "MISMATCH");
  console.log("Chroma.renderer:", rendererOnChroma, rendererOnChroma.toLowerCase() === RENDERER.toLowerCase() ? "OK" : "MISMATCH");
  console.log("Canvas.chromaStorage:", storageOnCanvas, storageOnCanvas.toLowerCase() === STORAGE.toLowerCase() ? "OK" : "MISMATCH");

  const receiverId = 1n;

  const supplyBefore = await publicClient.readContract({ address: CHROMA, abi: chromaAbi, functionName: "totalSupply" });
  const burnIds = [supplyBefore + 1n, supplyBefore + 2n];

  console.log("\nOwner-minting 2 revealed tokens for burn fuel:", burnIds.map(String).join(", "));
  for (const id of burnIds) {
    await ownerMintRevealed(publicClient, walletClient, account.address, id);
  }

  const approved = await publicClient.readContract({
    address: CHROMA,
    abi: chromaAbi,
    functionName: "isApprovedForAll",
    args: [account.address, CANVAS],
  });
  if (!approved) {
    console.log("Approving canvas...");
    const approveHash = await walletClient.writeContract({
      address: CHROMA,
      abi: chromaAbi,
      functionName: "setApprovalForAll",
      args: [CANVAS, true],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 180_000 });
  }

  let totalBurnAp = 0n;
  for (const burnId of burnIds) {
    totalBurnAp += await burnInto(publicClient, walletClient, account.address, receiverId, burnId);
  }

  const [earned, ap, level, burnCount] = await Promise.all([
    publicClient.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "totalApEarned", args: [receiverId] }),
    publicClient.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "actionPoints", args: [receiverId] }),
    publicClient.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "getLevel", args: [receiverId] }),
    publicClient.readContract({ address: CANVAS, abi: chromaCanvasV2Abi, functionName: "getBurnCount", args: [receiverId] }),
  ]);

  const expected = expectedLevel(earned);
  console.log("\n--- Post-burn (#" + receiverId + ") ---");
  console.log("totalApEarned:", earned.toString(), `(from ${totalBurnAp} burn yield)`);
  console.log("actionPoints:", ap.toString());
  console.log("getLevel():", level.toString());
  console.log("expected level (sqrt(earned/50)):", expected.toString());
  console.log("burnCount:", burnCount.toString());

  if (earned === 0n) throw new Error("totalApEarned is 0 after revealed burns");
  if (earned !== totalBurnAp) throw new Error(`totalApEarned ${earned} != sum burn yield ${totalBurnAp}`);
  if (ap !== earned) throw new Error(`actionPoints ${ap} != totalApEarned ${earned}`);
  if (level !== expected) throw new Error(`getLevel mismatch: on-chain ${level} vs expected ${expected}`);

  console.log("\nPASS: getLevel() reflects lifetime AP earned on new canvas.");
  console.log(`/my-chromies should show Token #${receiverId}: Level ${level}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
