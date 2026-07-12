#!/usr/bin/env node
/**
 * Selects and packages 100 commemorative payloads for the Robinhood Chain
 * "Chain Launch Edition" (src/robinhood/ChromiesCommemorative.sol) from the
 * finalized 5,150-token reveal dataset.
 *
 * Pipeline:
 *   1. Load public/data/mint-data.json (tokenId/pixelsHex/traitsHex, 5,150 records).
 *   2. Exclude the 9 legendary token IDs (art-pipeline/legendary-token-ids.js) —
 *      those are 1/1s reserved for the main collection, never eligible here.
 *   3. Deterministically select 100 tokens from the remaining pool with a seeded
 *      PRNG — same mulberry32/seedFromStr/shufflePick convention already used in
 *      art-pipeline/gold-token-ids.js, so selection is reproducible given the same
 *      input dataset + SELECTION_SEED (re-running this script is a no-op diff).
 *   4. Run integrity/sanity checks (hex validity, exact byte lengths, no dupes, no
 *      legendary leakage, totalPixels within the ChromaStorage-enforced 0-4096
 *      range) before writing anything to disk.
 *   5. Remap the 100 selected *source* tokenIds (from the 5,150 numbering) to
 *      sequential *commemorative* tokenIds 1-100 — the new collection's own,
 *      independent numbering — sorted by source tokenId for auditability.
 *   6. Emit:
 *        reports/robinhood/commemorative-100.json   — full selection + provenance
 *        reports/robinhood/seed-calldata.json       — seedPayloads() call args,
 *          chunked into batches (see BATCH_SIZE) to keep each on-chain
 *          seedPayloads() call comfortably under a single block's gas budget —
 *          seeding all 100 in one call measures ~51M gas in
 *          test/robinhood/ChromiesCommemorative.t.sol's --gas-report.
 *
 * Usage: node scripts/robinhood/select-commemorative-100.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { createHash } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..");
const require = createRequire(path.join(REPO, "art-pipeline/package.json"));

const { LEGENDARY_TOKEN_IDS, isLegendaryToken } = require(
  path.join(REPO, "art-pipeline/legendary-token-ids.js")
);

const MINT_DATA_PATH = path.join(REPO, "public/data/mint-data.json");
const OUT_DIR = path.join(REPO, "reports/robinhood");
const COMMEMORATIVE_COUNT = 100;
// Re-seeded 2026-07-12 for the Robinhood commemorative RE-DO against the
// newly-frozen non-legendary 5,141 dataset (see
// chromies-engine/reports/ROBINHOOD_DATASET_FREEZE_RULING.md). The prior seed
// ("chromies-commemorative-launch-v1") selected against pre-redo trait bytes
// (stale hat encoding, no accessory slot) and is retired — do not reuse.
const SELECTION_SEED = "chromies-commemorative-redo-v2-2026-07-12";
/** seedPayloads() measured at ~510k gas/token (see gas report above) — 10/batch
 * keeps a single call comfortably under typical L2 per-tx/block gas ceilings. */
const BATCH_SIZE = 10;
const PIXELS_LENGTH = 2048;
const TRAITS_LENGTH = 32;

// --- Same PRNG convention as art-pipeline/gold-token-ids.js ---------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromStr(s) {
  let seed = 0;
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) | 0;
  return seed;
}

function shufflePick(rng, arr, count) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

// --- Payload integrity helpers ---------------------------------------------------

function hexByteLength(hex) {
  if (typeof hex !== "string" || !hex.startsWith("0x")) return -1;
  const body = hex.slice(2);
  if (body.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(body)) return -1;
  return body.length / 2;
}

/** Mirrors ChromaStorage._totalPixelsFromTraits / ChromiesCommemorative.getTotalPixels:
 * traits[17:19] (big-endian uint16) — see contracts/ChromaStorage.sol. */
function totalPixelsFromTraitsHex(traitsHex) {
  const body = traitsHex.slice(2);
  const hi = parseInt(body.slice(34, 36), 16);
  const lo = parseInt(body.slice(36, 38), 16);
  return (hi << 8) | lo;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function selectDeterministic(pool, count, seedStr) {
  const rng = mulberry32(seedFromStr(seedStr));
  const sortedPool = [...pool].sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
  return shufflePick(rng, sortedPool, count);
}

function main() {
  console.log(`Loading reveal dataset: ${path.relative(REPO, MINT_DATA_PATH)}`);
  const mintData = JSON.parse(fs.readFileSync(MINT_DATA_PATH, "utf8"));
  if (!Array.isArray(mintData) || mintData.length === 0) {
    throw new Error("mint-data.json is empty or malformed");
  }
  console.log(`Loaded ${mintData.length} tokens.`);

  const pool = mintData.filter((r) => !isLegendaryToken(r.tokenId));
  console.log(
    `Pool size after excluding ${LEGENDARY_TOKEN_IDS.length} legendary tokens (${LEGENDARY_TOKEN_IDS.join(", ")}): ${pool.length}`
  );
  if (pool.length < COMMEMORATIVE_COUNT) {
    throw new Error(`Pool too small: need ${COMMEMORATIVE_COUNT}, have ${pool.length}`);
  }

  // Determinism self-check: re-run selection twice — must match exactly, every time.
  const runA = selectDeterministic(pool, COMMEMORATIVE_COUNT, SELECTION_SEED);
  const runB = selectDeterministic(pool, COMMEMORATIVE_COUNT, SELECTION_SEED);
  const idsA = runA.map((r) => r.tokenId).join(",");
  const idsB = runB.map((r) => r.tokenId).join(",");
  if (idsA !== idsB) {
    throw new Error("Selection is not deterministic — PRNG or pool ordering drifted between runs");
  }

  const selected = runA;

  // --- Sanity / integrity checks --------------------------------------------------
  const seenSourceIds = new Set();
  const errors = [];
  for (const record of selected) {
    const tokenId = Number(record.tokenId);

    if (isLegendaryToken(tokenId)) errors.push(`Token ${tokenId} is legendary — must never be selected`);
    if (seenSourceIds.has(tokenId)) errors.push(`Token ${tokenId} selected more than once`);
    seenSourceIds.add(tokenId);

    const pixelsBytes = hexByteLength(record.pixelsHex);
    if (pixelsBytes !== PIXELS_LENGTH) {
      errors.push(`Token ${tokenId}: pixelsHex is ${pixelsBytes} bytes, expected ${PIXELS_LENGTH}`);
    }

    const traitsBytes = hexByteLength(record.traitsHex);
    if (traitsBytes !== TRAITS_LENGTH) {
      errors.push(`Token ${tokenId}: traitsHex is ${traitsBytes} bytes, expected ${TRAITS_LENGTH}`);
    } else {
      const totalPixels = totalPixelsFromTraitsHex(record.traitsHex);
      if (totalPixels > 4096) {
        errors.push(`Token ${tokenId}: totalPixels ${totalPixels} exceeds the 4096 ChromaStorage ceiling`);
      }
    }
  }
  if (seenSourceIds.size !== COMMEMORATIVE_COUNT) {
    errors.push(`Expected ${COMMEMORATIVE_COUNT} unique tokens, got ${seenSourceIds.size}`);
  }
  if (errors.length > 0) {
    throw new Error(`Sanity checks failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  console.log(`Sanity checks passed for all ${selected.length} selected payloads.`);

  // --- Remap to sequential commemorative tokenIds 1..100 (sorted by source id) ---
  const ordered = [...selected].sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
  const commemorative = ordered.map((record, index) => ({
    commemorativeTokenId: index + 1,
    sourceTokenId: Number(record.tokenId),
    pixelsHex: record.pixelsHex,
    traitsHex: record.traitsHex,
    totalPixels: totalPixelsFromTraitsHex(record.traitsHex),
  }));

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    selectionSeed: SELECTION_SEED,
    sourceDataset: path.relative(REPO, MINT_DATA_PATH).replace(/\\/g, "/"),
    sourcePoolSize: pool.length,
    excludedLegendaryTokenIds: LEGENDARY_TOKEN_IDS,
    commemorativeCount: commemorative.length,
    tokens: commemorative,
  };
  const manifestPath = path.join(OUT_DIR, "commemorative-100.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${path.relative(REPO, manifestPath).replace(/\\/g, "/")}`);

  // --- Batch into seedPayloads() call args ----------------------------------------
  const batches = [];
  for (let i = 0; i < commemorative.length; i += BATCH_SIZE) {
    batches.push(commemorative.slice(i, i + BATCH_SIZE));
  }
  const seedCalldata = {
    generatedAt: manifest.generatedAt,
    contractFunction: "seedPayloads(uint256[] ids, bytes[] pixelsHex, bytes[] traitsHex)",
    note: "Call once per batch, in order, before setMintOpen(true) — seeding locks permanently once mint opens.",
    batchSize: BATCH_SIZE,
    batchCount: batches.length,
    batches: batches.map((batch, batchIndex) => ({
      batchIndex,
      ids: batch.map((t) => t.commemorativeTokenId),
      pixelsHex: batch.map((t) => t.pixelsHex),
      traitsHex: batch.map((t) => t.traitsHex),
    })),
  };
  const calldataPath = path.join(OUT_DIR, "seed-calldata.json");
  fs.writeFileSync(calldataPath, JSON.stringify(seedCalldata, null, 2));
  console.log(
    `Wrote ${path.relative(REPO, calldataPath).replace(/\\/g, "/")} (${batches.length} batches of up to ${BATCH_SIZE})`
  );

  const manifestHash = sha256Hex(JSON.stringify(manifest.tokens));
  console.log(`\nSelection manifest sha256 (tokens array): ${manifestHash}`);
  console.log(`Commemorative tokenId -> source tokenId map:`);
  for (const t of commemorative) {
    console.log(`  #${String(t.commemorativeTokenId).padStart(3, "0")} <- source #${t.sourceTokenId}`);
  }
}

main();
