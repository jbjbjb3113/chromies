// Fetches unique owner addresses for allowlist source collections via Alchemy NFT API.
// GET /nft/v3/{apiKey}/getOwnersForContract (Ethereum mainnet)
//
// Tier 1 (AllowlistOne): Normies holders
// Tier 2 (AllowlistTwo): unique(Brain Rots holders ∪ Akutar holders)
//
// USAGE:
//   node snapshot-holders.js              # fetch + write holder files
//   node snapshot-holders.js --dry-run    # fetch + report counts only (no writes)
//
// OUTPUTS (normal mode):
//   output/normies-holders.json / .txt
//   output/brainrots-holders.json / .txt
//   output/akutars-holders.json / .txt
//   output/tier2-holders.json / .txt      # merged Brain Rots ∪ Akutars
//
// Merkle generation (generate-merkle.js) reads tier2-holders.json — run only at
// fresh-snapshot pass (~August). Do not regenerate roots for Sepolia testing.

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ALCHEMY_KEY = process.env.ALCHEMY_MAINNET_KEY;
const OUTPUT_DIR = path.join(__dirname, "output");
const DRY_RUN = process.argv.includes("--dry-run");

/** Null / burn addresses excluded from all lists. */
const DEAD_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);

const TIER1_SOURCES = [
  {
    name: "Normies",
    contract: "0x9eb6e2025b64f340691e424b7fe7022ffde12438",
    jsonOut: path.join(OUTPUT_DIR, "normies-holders.json"),
    txtOut: path.join(OUTPUT_DIR, "normies-holders.txt"),
  },
];

const TIER2_SOURCES = [
  {
    name: "Brain Rots",
    contract: "0x38793a3FDfd098E820ddF59706280681354341fC",
    jsonOut: path.join(OUTPUT_DIR, "brainrots-holders.json"),
    txtOut: path.join(OUTPUT_DIR, "brainrots-holders.txt"),
  },
  {
    name: "Akutars",
    contract: "0xaaD35C2DadbE77f97301617D82e661776c891Fa9",
    jsonOut: path.join(OUTPUT_DIR, "akutars-holders.json"),
    txtOut: path.join(OUTPUT_DIR, "akutars-holders.txt"),
  },
];

const TIER2_MERGED = {
  jsonOut: path.join(OUTPUT_DIR, "tier2-holders.json"),
  txtOut: path.join(OUTPUT_DIR, "tier2-holders.txt"),
};

async function fetchOwnersPage(contract, pageKey) {
  const url = new URL(
    `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getOwnersForContract`,
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
      `[${name}] Fetched page: ${data.owners.length} owners (unique so far: ${owners.size})`,
    );
  } while (pageKey);

  return filterOwners(Array.from(owners), contract);
}

/**
 * Standard holder filters (no exchange-custody list in legacy pipeline — none added).
 * - Exclude null/dead burn addresses
 * - Exclude the collection contract address itself
 */
function filterOwners(addresses, contractAddress) {
  const contract = contractAddress.toLowerCase();
  const removed = { dead: 0, contract: 0 };

  const kept = addresses.filter((addr) => {
    const lower = addr.toLowerCase();
    if (DEAD_ADDRESSES.has(lower)) {
      removed.dead += 1;
      return false;
    }
    if (lower === contract) {
      removed.contract += 1;
      return false;
    }
    return true;
  });

  if (removed.dead > 0 || removed.contract > 0) {
    console.log(
      `  filtered: ${removed.dead} dead/null, ${removed.contract} contract self`,
    );
  }

  return kept.sort();
}

function mergeUniqueSets(...lists) {
  return Array.from(new Set(lists.flat())).sort();
}

function overlapCount(a, b) {
  const setB = new Set(b);
  let n = 0;
  for (const addr of a) {
    if (setB.has(addr)) n += 1;
  }
  return n;
}

function writeHolders(sorted, jsonOut, txtOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(sorted, null, 2) + "\n");
  fs.writeFileSync(txtOut, sorted.join("\n") + "\n");
}

function printDryRunReport({ normies, brainrots, akutars, tier2 }) {
  const akutarSet = new Set(akutars);
  const brainrotsAkutarsOverlap = brainrots.filter((a) => akutarSet.has(a)).length;
  const tier1Tier2Overlap = overlapCount(normies, tier2);

  console.log("\n=== Allowlist snapshot dry-run ===");
  console.log(`  Tier 1 (Normies):              ${normies.length} unique wallets`);
  console.log(`  Brain Rots (Tier 2 source):    ${brainrots.length} unique wallets`);
  console.log(`  Akutars (Tier 2 source):       ${akutars.length} unique wallets`);
  console.log(`  Brain Rots ∩ Akutars:          ${brainrotsAkutarsOverlap} wallets`);
  console.log(`  Tier 2 merged (BR ∪ Akutars):  ${tier2.length} unique wallets`);
  console.log(`    Brain Rots only:             ${brainrots.length - brainrotsAkutarsOverlap}`);
  console.log(`    Akutars only:                ${akutars.length - brainrotsAkutarsOverlap}`);
  console.log(`  Normies ∩ Tier 2 merged:       ${tier1Tier2Overlap} wallets (both eligibilities kept)`);
  console.log("\nFilters applied: dead/null addresses, collection contract self");
  console.log("Exchange custody: not filtered (legacy pipeline had no custody list)");
  if (DRY_RUN) {
    console.log("\nDry-run only — no holder files written, merkle roots unchanged.");
  }
}

async function main() {
  if (!ALCHEMY_KEY) {
    console.error("Missing ALCHEMY_MAINNET_KEY in .env");
    process.exit(1);
  }

  if (!DRY_RUN) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  } else {
    console.log("Dry-run mode: fetching live mainnet holders, reporting counts only.\n");
  }

  const normies = await fetchAllOwners(TIER1_SOURCES[0].name, TIER1_SOURCES[0].contract);

  const tier2Raw = {};
  for (const source of TIER2_SOURCES) {
    tier2Raw[source.name] = await fetchAllOwners(source.name, source.contract);
  }

  const brainrots = tier2Raw["Brain Rots"];
  const akutars = tier2Raw["Akutars"];
  const tier2 = mergeUniqueSets(brainrots, akutars);

  if (DRY_RUN) {
    printDryRunReport({ normies, brainrots, akutars, tier2 });
    return;
  }

  writeHolders(normies, TIER1_SOURCES[0].jsonOut, TIER1_SOURCES[0].txtOut);
  console.log(`Wrote ${TIER1_SOURCES[0].jsonOut}`);

  for (const source of TIER2_SOURCES) {
    const sorted = tier2Raw[source.name];
    writeHolders(sorted, source.jsonOut, source.txtOut);
    console.log(`Wrote ${source.jsonOut}`);
  }

  writeHolders(tier2, TIER2_MERGED.jsonOut, TIER2_MERGED.txtOut);
  console.log(`Wrote ${TIER2_MERGED.jsonOut} (merged Tier 2)`);

  printDryRunReport({ normies, brainrots, akutars, tier2 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
