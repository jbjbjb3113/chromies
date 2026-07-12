#!/usr/bin/env node
// Reads back getPixels()/getTraits() for every token in one seed-calldata.json
// batch from a live ChromiesCommemorative contract and diffs against the
// expected hex. Exits non-zero (and prints a clear HALT marker) on any
// mismatch so the calling shell loop can stop seeding further batches.
//
// Usage: node scripts/robinhood/verify-seeded-batch.mjs <tokenAddress> <batchIndex>
// Reads the RPC URL from ALCHEMY_RH_MAINNET_URL in .env directly (never as a
// CLI arg / logged shell command) so the key is never echoed to a terminal.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http } from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..");

function loadEnvVar(name) {
  const envPath = path.join(REPO, ".env");
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && m[1].trim() === name) return m[2].trim();
  }
  return undefined;
}

const [tokenAddress, batchIndexStr] = process.argv.slice(2);
if (!tokenAddress || batchIndexStr === undefined) {
  console.error("Usage: node verify-seeded-batch.mjs <tokenAddress> <batchIndex>");
  process.exit(2);
}
const rpcUrl = loadEnvVar("ALCHEMY_RH_MAINNET_URL");
if (!rpcUrl) {
  console.error("ALCHEMY_RH_MAINNET_URL not found in .env");
  process.exit(2);
}
const batchIndex = Number(batchIndexStr);

const seedCalldata = JSON.parse(
  fs.readFileSync(path.join(REPO, "reports/robinhood/seed-calldata.json"), "utf8"),
);
const batch = seedCalldata.batches[batchIndex];
if (!batch) {
  console.error(`No batch ${batchIndex} in seed-calldata.json`);
  process.exit(2);
}

const ABI = [
  {
    type: "function",
    name: "getPixels",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes" }],
  },
  {
    type: "function",
    name: "getTraits",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes" }],
  },
];

async function main() {
  const client = createPublicClient({ transport: http(rpcUrl) });
  let mismatches = 0;

  for (let i = 0; i < batch.ids.length; i++) {
    const id = batch.ids[i];
    const expectedPixels = batch.pixelsHex[i].toLowerCase();
    const expectedTraits = batch.traitsHex[i].toLowerCase();

    const [onChainPixels, onChainTraits] = await Promise.all([
      client.readContract({ address: tokenAddress, abi: ABI, functionName: "getPixels", args: [BigInt(id)] }),
      client.readContract({ address: tokenAddress, abi: ABI, functionName: "getTraits", args: [BigInt(id)] }),
    ]);

    const pixelsMatch = onChainPixels.toLowerCase() === expectedPixels;
    const traitsMatch = onChainTraits.toLowerCase() === expectedTraits;

    if (!pixelsMatch || !traitsMatch) {
      mismatches += 1;
      console.error(`MISMATCH #${id}: pixelsMatch=${pixelsMatch} traitsMatch=${traitsMatch}`);
    } else {
      console.log(`  #${id} OK (pixelsHex + traitsHex match)`);
    }
  }

  if (mismatches > 0) {
    console.error(`\nHALT: batch ${batchIndex} has ${mismatches} mismatch(es).`);
    process.exit(1);
  }
  console.log(`Batch ${batchIndex}: all ${batch.ids.length} tokens verified, 0 mismatches.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
