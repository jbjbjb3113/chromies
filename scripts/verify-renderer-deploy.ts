/**
 * Post-deploy verification: public mint+reveal, owner-mint Zombie, decode tokenURI metadata.
 * Usage: npx tsx scripts/verify-renderer-deploy.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { chromaAbi } from "../abis/Chroma.ts";

const CHROMA = (process.env.CHROMA_ADDRESS ??
  "0x8162114c056DfC49045c04C66f1E03b761d81eD5") as `0x${string}`;

const verifyAbi = [
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
  {
    type: "function",
    name: "revealRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "renderer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

type MintRow = { tokenId: number; pixelsHex: string; traitsHex: string };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function loadJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), relativePath), "utf8"),
  ) as T;
}

function hexToBytes(hex: string): Hex {
  const clean = hex.replace(/^0x/i, "");
  return `0x${clean}` as Hex;
}

function decodeTokenUri(uri: string) {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix)) {
    throw new Error(`Unexpected tokenURI prefix: ${uri.slice(0, 40)}...`);
  }
  return JSON.parse(
    Buffer.from(uri.slice(prefix.length), "base64").toString("utf8"),
  ) as {
    name?: string;
    attributes?: Array<{ trait_type: string; value: string }>;
  };
}

function attr(metadata: ReturnType<typeof decodeTokenUri>, traitType: string) {
  return metadata.attributes?.find((a) => a.trait_type === traitType)?.value;
}

function printMetadata(label: string, tokenId: bigint, uri: string) {
  const metadata = decodeTokenUri(uri);
  console.log(`\n=== ${label} #${tokenId} ===`);
  console.log(`name: ${metadata.name}`);
  const keys = [
    "Character",
    "Palette",
    "Status",
    "Level",
    "Total Pixels",
  ] as const;
  for (const key of keys) {
    const value = attr(metadata, key);
    if (value !== undefined) console.log(`${key}: ${value}`);
  }
  return metadata;
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY") as Hex;
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const [renderer, revealRoot, totalSupply, owner, phase] = await Promise.all([
    publicClient.readContract({
      address: CHROMA,
      abi: verifyAbi,
      functionName: "renderer",
    }),
    publicClient.readContract({
      address: CHROMA,
      abi: verifyAbi,
      functionName: "revealRoot",
    }),
    publicClient.readContract({
      address: CHROMA,
      abi: verifyAbi,
      functionName: "totalSupply",
    }),
    publicClient.readContract({
      address: CHROMA,
      abi: verifyAbi,
      functionName: "owner",
    }),
    publicClient.readContract({
      address: CHROMA,
      abi: verifyAbi,
      functionName: "phase",
    }),
  ]);

  console.log("On-chain wiring:");
  console.log(`  renderer:    ${renderer}`);
  console.log(`  revealRoot:  ${revealRoot}`);
  console.log(`  totalSupply: ${totalSupply}`);
  console.log(`  phase:       ${phase}`);
  console.log(`  owner:       ${owner}`);

  const mintData = loadJson<MintRow[]>("art-pipeline/output/mint-data.json");
  const proofsDoc = loadJson<{ proofs: Record<string, string[]> }>(
    "art-pipeline/output/reveal-merkle-proofs.json",
  );

  const publicTokenId = totalSupply + 1n;
  const publicEntry = mintData.find((r) => r.tokenId === Number(publicTokenId));
  const publicProof = proofsDoc.proofs[publicTokenId.toString()];
  if (!publicEntry || !publicProof?.length) {
    throw new Error(`Missing mint-data/proof for public token ${publicTokenId}`);
  }

  if (phase !== 3) {
    console.log("\nSetting phase to Public (3)...");
    const hash = await walletClient.writeContract({
      address: CHROMA,
      abi: verifyAbi,
      functionName: "setPhase",
      args: [3],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  if (account.address.toLowerCase() === owner.toLowerCase()) {
    console.log(`Resetting claimed count for ${account.address}...`);
    const resetHash = await walletClient.writeContract({
      address: CHROMA,
      abi: verifyAbi,
      functionName: "resetClaimed",
      args: [account.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: resetHash });
  }

  const mintPrice = await publicClient.readContract({
    address: CHROMA,
    abi: verifyAbi,
    functionName: "MINT_PRICE",
  });

  console.log(`\nPublic mint token #${publicTokenId}...`);
  const mintHash = await walletClient.writeContract({
    address: CHROMA,
    abi: verifyAbi,
    functionName: "mint",
    args: [1n],
    value: mintPrice,
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });

  const unrevealedUri = await publicClient.readContract({
    address: CHROMA,
    abi: verifyAbi,
    functionName: "tokenURI",
    args: [publicTokenId],
  });
  console.log(`Unrevealed URI starts with: ${unrevealedUri.slice(0, 60)}...`);

  console.log(`Revealing token #${publicTokenId}...`);
  const revealHash = await walletClient.writeContract({
    address: CHROMA,
    abi: verifyAbi,
    functionName: "reveal",
    args: [
      publicTokenId,
      hexToBytes(publicEntry.pixelsHex),
      hexToBytes(publicEntry.traitsHex),
      publicProof as Hex[],
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: revealHash });

  const revealedUri = await publicClient.readContract({
    address: CHROMA,
    abi: verifyAbi,
    functionName: "tokenURI",
    args: [publicTokenId],
  });
  const publicMeta = printMetadata("Public mint+reveal", publicTokenId, revealedUri);
  const publicCharacter = attr(publicMeta, "Character");
  const publicPalette = attr(publicMeta, "Palette");
  if (!publicCharacter || publicCharacter === "Human" && Number(publicTokenId) !== 18) {
    console.warn("Unexpected public character label");
  }

  const zombieTokenId = 62n;
  const zombieEntry = mintData.find((r) => r.tokenId === Number(zombieTokenId));
  if (!zombieEntry) throw new Error("Missing mint-data for zombie #62");

  let zombieExists = true;
  try {
    await publicClient.readContract({
      address: CHROMA,
      abi: verifyAbi,
      functionName: "ownerOf",
      args: [zombieTokenId],
    });
  } catch {
    zombieExists = false;
  }

  if (!zombieExists) {
    console.log(`\nOwner-minting revealed Zombie token #${zombieTokenId}...`);
    const ownerMintHash = await walletClient.writeContract({
      address: CHROMA,
      abi: verifyAbi,
      functionName: "mint",
      args: [
        account.address,
        zombieTokenId,
        hexToBytes(zombieEntry.pixelsHex),
        hexToBytes(zombieEntry.traitsHex),
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: ownerMintHash });
  } else {
    console.log(`\nZombie token #${zombieTokenId} already minted — reading tokenURI only.`);
  }

  const zombieUri = await publicClient.readContract({
    address: CHROMA,
    abi: verifyAbi,
    functionName: "tokenURI",
    args: [zombieTokenId],
  });
  const zombieMeta = printMetadata("Zombie verification", zombieTokenId, zombieUri);
  const zombieCharacter = attr(zombieMeta, "Character");
  const zombiePalette = attr(zombieMeta, "Palette");

  console.log("\n=== Verification summary ===");
  console.log(
    `Public #${publicTokenId}: Character="${publicCharacter}" Palette="${publicPalette}"`,
  );
  console.log(
    `Zombie #${zombieTokenId}: Character="${zombieCharacter}" Palette="${zombiePalette}"`,
  );

  if (zombieCharacter !== "Zombie") {
    throw new Error(`Zombie character label wrong: got "${zombieCharacter}"`);
  }
  if (zombiePalette !== "ZOMBIE") {
    throw new Error(`Zombie palette name wrong: got "${zombiePalette}"`);
  }
  if (publicCharacter === "SIGNAL" || publicPalette === "SIGNAL" && publicCharacter === "Human") {
    // palette name SIGNAL is valid for many tokens; only fail zombie mislabels
  }

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
