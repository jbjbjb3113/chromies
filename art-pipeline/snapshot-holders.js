// Fetches all unique owner addresses for Normies and Brain Rots contracts.
// Uses Alchemy NFT API: GET /nft/v3/{apiKey}/getOwnersForContract
//
// USAGE:
//   node snapshot-holders.js
//
// OUTPUTS:
//   output/normies-holders.json / .txt
//   output/brainrots-holders.json / .txt

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ALCHEMY_KEY = process.env.ALCHEMY_MAINNET_KEY;
const OUTPUT_DIR = path.join(__dirname, "output");

const COLLECTIONS = [
  {
    name: "Normies",
    contract: "0x9eb6e2025b64f340691e424b7fe7022ffde12438",
    jsonOut: path.join(OUTPUT_DIR, "normies-holders.json"),
    txtOut: path.join(OUTPUT_DIR, "normies-holders.txt"),
  },
  {
    name: "Brain Rots",
    contract: "0x38793a3FDfd098E820ddF59706280681354341fC",
    jsonOut: path.join(OUTPUT_DIR, "brainrots-holders.json"),
    txtOut: path.join(OUTPUT_DIR, "brainrots-holders.txt"),
  },
];

async function fetchOwnersPage(contract, pageKey) {
  const url = new URL(
    `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getOwnersForContract`
  );
  url.searchParams.set("contractAddress", contract);
  if (pageKey) {
    url.searchParams.set("pageKey", pageKey);
  }

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alchemy API ${res.status}: ${body}`);
  }

  return res.json();
}

async function fetchAllOwners(name, contract) {
  const owners = new Set();
  let pageKey;

  do {
    const data = await fetchOwnersPage(contract, pageKey);
    for (const addr of data.owners) {
      owners.add(addr.toLowerCase());
    }
    pageKey = data.pageKey;
    console.log(
      `[${name}] Fetched page: ${data.owners.length} owners (unique so far: ${owners.size})`
    );
  } while (pageKey);

  return Array.from(owners).sort();
}

function writeHolders(sorted, jsonOut, txtOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(sorted, null, 2) + "\n");
  fs.writeFileSync(txtOut, sorted.join("\n") + "\n");
}

async function main() {
  if (!ALCHEMY_KEY) {
    console.error("Missing ALCHEMY_MAINNET_KEY in .env");
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const counts = {};

  for (const { name, contract, jsonOut, txtOut } of COLLECTIONS) {
    const sorted = await fetchAllOwners(name, contract);
    writeHolders(sorted, jsonOut, txtOut);
    counts[name] = sorted.length;
    console.log(`Wrote ${jsonOut}`);
    console.log(`Wrote ${txtOut}`);
  }

  console.log(`Normies unique holders: ${counts["Normies"]}`);
  console.log(`Brain Rots unique holders: ${counts["Brain Rots"]}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
