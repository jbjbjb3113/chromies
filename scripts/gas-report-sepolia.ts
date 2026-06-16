/**
 * Sepolia gas report: public mint(1) + reveal() for the minted token.
 *
 * Usage (from repo root, with .env containing PRIVATE_KEY + SEPOLIA_RPC_URL):
 *   npx tsx scripts/gas-report-sepolia.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatGwei,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { chromaAbi } from "../abis/Chroma.ts";

const gasReportAbi = [
  ...chromaAbi,
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "phase",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "setPhase",
    stateMutability: "nonpayable",
    inputs: [{ name: "_phase", type: "uint8" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resetClaimed",
    stateMutability: "nonpayable",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [],
  },
] as const;

const CHROMA_ADDRESS = (process.env.CHROMA_ADDRESS ??
  "0xba4c3797a18958877f895b69ca4a67b914949f5d") as `0x${string}`;

const EXPECTED = {
  mint: 115_000,
  revealOrInscribe: 616_000,
  source: "art-pipeline/chromies-project-journal.md (15 gwei mainnet estimates)",
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in environment`);
  return value;
}

function loadJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), relativePath), "utf8"),
  ) as T;
}

async function fetchEthUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { ethereum?: { usd?: number } };
    return json.ethereum?.usd ?? null;
  } catch {
    return null;
  }
}

function formatUsd(eth: number, ethUsd: number | null): string {
  if (ethUsd == null) return "USD n/a";
  return `$${(eth * ethUsd).toFixed(4)}`;
}

function printTxReport(
  label: string,
  receipt: {
    gasUsed: bigint;
    effectiveGasPrice: bigint;
  },
  ethUsd: number | null,
) {
  const gasUsed = receipt.gasUsed;
  const gasPriceWei = receipt.effectiveGasPrice;
  const costWei = gasUsed * gasPriceWei;
  const costEth = Number(formatEther(costWei));

  console.log(`\n=== ${label} ===`);
  console.log(`gasUsed:        ${gasUsed.toString()}`);
  console.log(`gasPrice:       ${formatGwei(gasPriceWei)} gwei`);
  console.log(`total cost:     ${formatEther(costWei)} ETH (${formatUsd(costEth, ethUsd)})`);
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY") as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const ethUsd = await fetchEthUsd();

  console.log("Chromies Sepolia gas report");
  console.log(`Chroma:  ${CHROMA_ADDRESS}`);
  console.log(`Wallet:  ${account.address}`);
  console.log(`ETH/USD: ${ethUsd ?? "unavailable"}`);
  console.log("\nExpected/budgeted (from project journal, not on-chain constants):");
  console.log(`  mint(uint256):           ~${EXPECTED.mint.toLocaleString()} gas`);
  console.log(`  reveal/inscribe:        ~${EXPECTED.revealOrInscribe.toLocaleString()} gas`);
  console.log(`  source: ${EXPECTED.source}`);

  const totalSupply = await publicClient.readContract({
    address: CHROMA_ADDRESS,
    abi: gasReportAbi,
    functionName: "totalSupply",
  });
  const tokenId = totalSupply + 1n;
  console.log(`\nNext token ID: ${tokenId.toString()} (current totalSupply=${totalSupply.toString()})`);

  const mintData = loadJson<Array<{ tokenId: number; pixelsHex: string; traitsHex: string }>>(
    "art-pipeline/output/mint-data.json",
  );
  const proofsDoc = loadJson<{ proofs: Record<string, string[]> }>(
    "art-pipeline/output/reveal-merkle-proofs.json",
  );

  const entry = mintData.find((row) => row.tokenId === Number(tokenId));
  const proof = proofsDoc.proofs[tokenId.toString()];
  if (!entry || !proof?.length) {
    throw new Error(`Missing mint-data or merkle proof for token ${tokenId}`);
  }

  const phase = await publicClient.readContract({
    address: CHROMA_ADDRESS,
    abi: gasReportAbi,
    functionName: "phase",
  });
  const mintPrice = await publicClient.readContract({
    address: CHROMA_ADDRESS,
    abi: gasReportAbi,
    functionName: "MINT_PRICE",
  });

  const owner = await publicClient.readContract({
    address: CHROMA_ADDRESS,
    abi: gasReportAbi,
    functionName: "owner",
  });

  if (phase !== 3) {
    console.log(`\nPhase is ${phase} (need 3=Public). Setting Public as owner…`);
    const setPhaseHash = await walletClient.writeContract({
      address: CHROMA_ADDRESS,
      abi: gasReportAbi,
      functionName: "setPhase",
      args: [3],
    });
    await publicClient.waitForTransactionReceipt({ hash: setPhaseHash });
    console.log("Phase set to Public.");
  }

  if (owner.toLowerCase() === account.address.toLowerCase()) {
    const claimed = await publicClient.readContract({
      address: CHROMA_ADDRESS,
      abi: gasReportAbi,
      functionName: "claimedPublic",
      args: [account.address],
    });
    if (claimed >= 3n) {
      console.log("\nPublic mint cap reached for wallet — calling resetClaimed() as owner…");
      const resetHash = await walletClient.writeContract({
        address: CHROMA_ADDRESS,
        abi: gasReportAbi,
        functionName: "resetClaimed",
        args: [account.address],
      });
      await publicClient.waitForTransactionReceipt({ hash: resetHash });
      console.log("resetClaimed complete.");
    }
  }

  console.log("\nSending mint(1)…");
  const mintHash = await walletClient.writeContract({
    address: CHROMA_ADDRESS,
    abi: gasReportAbi,
    functionName: "mint",
    args: [1n],
    value: mintPrice,
  });
  const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
  printTxReport("mint(uint256 quantity=1)", mintReceipt, ethUsd);
  console.log(`tx: ${mintHash}`);
  console.log(
    `vs expected mint: ${mintReceipt.gasUsed.toString()} actual / ~${EXPECTED.mint.toLocaleString()} budget (${(
      (Number(mintReceipt.gasUsed) / EXPECTED.mint) *
      100
    ).toFixed(1)}%)`,
  );

  const mintedSupply = await publicClient.readContract({
    address: CHROMA_ADDRESS,
    abi: gasReportAbi,
    functionName: "totalSupply",
  });
  if (mintedSupply !== tokenId) {
    throw new Error(`Expected token ${tokenId}, got totalSupply ${mintedSupply}`);
  }

  console.log("\nSending reveal()…");
  const revealHash = await walletClient.writeContract({
    address: CHROMA_ADDRESS,
    abi: gasReportAbi,
    functionName: "reveal",
    args: [tokenId, entry.pixelsHex as `0x${string}`, entry.traitsHex as `0x${string}`, proof as `0x${string}`[]],
  });
  const revealReceipt = await publicClient.waitForTransactionReceipt({ hash: revealHash });
  printTxReport(`reveal(tokenId=${tokenId})`, revealReceipt, ethUsd);
  console.log(`tx: ${revealHash}`);
  console.log(
    `vs expected reveal/inscribe: ${revealReceipt.gasUsed.toString()} actual / ~${EXPECTED.revealOrInscribe.toLocaleString()} budget (${(
      (Number(revealReceipt.gasUsed) / EXPECTED.revealOrInscribe) *
      100
    ).toFixed(1)}%)`,
  );

  console.log("\nSending inscribe() lock-only…");
  const inscribeHash = await walletClient.writeContract({
    address: CHROMA_ADDRESS,
    abi: gasReportAbi,
    functionName: "inscribe",
    args: [tokenId],
  });
  const inscribeReceipt = await publicClient.waitForTransactionReceipt({ hash: inscribeHash });
  printTxReport(`inscribe(tokenId=${tokenId}) lock-only`, inscribeReceipt, ethUsd);
  console.log(`tx: ${inscribeHash}`);

  const locked = await publicClient.readContract({
    address: CHROMA_ADDRESS,
    abi: gasReportAbi,
    functionName: "isLocked",
    args: [tokenId],
  });
  console.log(`\nToken #${tokenId} locked: ${locked}`);

  console.log("\n--- Foundry reference (local, same contract paths) ---");
  console.log("script/TestMint.s.sol — Sepolia mint + reveal + inscribe sequence");
  console.log("test/Chroma.t.sol::test_Reveal_WritesPixels — mint + reveal");
  console.log("test/Chroma.t.sol::test_Inscribe_LocksToken — mint + inscribe (reveal+lock)");
  console.log("Run locally: forge test --match-test \"test_Reveal_WritesPixels|test_Inscribe_LocksToken\" --gas-report");
}

main().catch((error) => {
  console.error("\nGas report failed:", error);
  process.exit(1);
});
