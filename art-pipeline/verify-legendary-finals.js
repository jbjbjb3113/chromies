// ============================================================================
// verify-legendary-finals.js
// Round-trip: legendary-finals/*.png → mint pixelsHex → unpack → zero-diff check.
//
// USAGE:
//   node verify-legendary-finals.js              # verify mint-data.json if present
//   node verify-legendary-finals.js --generate   # build mint records on the fly
//   node verify-legendary-finals.js --check-missing  # confirm hard-fail for absent files
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { SETTINGS } = require("./chromies-config");
const {
  LEGENDARY_TOKEN_IDS,
  legendaryFinalExists,
  loadLegendaryFinalBuffer,
  formatColorUsage,
} = require("./legendary-finals");
const { packPixels, buildMintRecord } = require("./bridge-mint-data");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;
const MINT_DATA_PATH = path.join(__dirname, "output", "mint-data.json");

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    generate: args.includes("--generate"),
    checkMissing: args.includes("--check-missing"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

function unpackPixels(hex) {
  const packed = Buffer.from(hex.replace(/^0x/i, ""), "hex");
  const out = new Uint8Array(PX);
  for (let i = 0; i < PX; i++) {
    const byteIndex = i >> 1;
    out[i] = (i & 1) === 0 ? (packed[byteIndex] >> 4) & 0x0f : packed[byteIndex] & 0x0f;
  }
  return out;
}

function buffersEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function firstDiff(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return { index: i, x: i % GRID, y: Math.floor(i / GRID), a: a[i], b: b[i] };
    }
  }
  return null;
}

function verifyRoundTrip(tokenId, record) {
  if (!legendaryFinalExists(tokenId)) {
    return { tokenId, status: "skip", reason: "no source file in legendary-finals/" };
  }

  const { buf: sourceBuf, colorUsage, paletteKey } = loadLegendaryFinalBuffer(tokenId);
  const mintBuf = unpackPixels(record.pixelsHex);

  if (!buffersEqual(sourceBuf, mintBuf)) {
    const diff = firstDiff(sourceBuf, mintBuf);
    return {
      tokenId,
      status: "fail",
      reason: `pixel buffer mismatch after round-trip (first diff: ${JSON.stringify(diff)})`,
      paletteKey,
      colorUsage: formatColorUsage(colorUsage),
    };
  }

  return {
    tokenId,
    status: "ok",
    paletteKey,
    colorUsage: formatColorUsage(colorUsage),
    nonZero: sourceBuf.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0),
  };
}

function checkMissingHardFail() {
  const traitsJson = JSON.parse(fs.readFileSync(path.join(__dirname, SETTINGS.traitsFile), "utf8"));
  let passed = 0;
  let failed = 0;

  console.log("Checking hard-fail for legendary IDs without legendary-finals/ PNG…\n");

  for (const tokenId of LEGENDARY_TOKEN_IDS) {
    if (legendaryFinalExists(tokenId)) {
      console.log(`  #${tokenId}: file present — skip missing-file test`);
      continue;
    }
    try {
      buildMintRecord(tokenId, traitsJson, [], null);
      console.error(`  #${tokenId}: FAIL — generation succeeded without legendary-final (expected hard-fail)`);
      failed += 1;
    } catch (err) {
      if (/Legendary final render missing/.test(err.message)) {
        console.log(`  #${tokenId}: OK — hard-fail: ${err.message.split("\n")[0]}`);
        passed += 1;
      } else {
        console.error(`  #${tokenId}: FAIL — unexpected error: ${err.message}`);
        failed += 1;
      }
    }
  }

  console.log(`\nMissing-file hard-fail: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

function main() {
  const { generate, checkMissing, help } = parseArgs();
  if (help) {
    console.log(`Usage:
  node verify-legendary-finals.js
  node verify-legendary-finals.js --generate
  node verify-legendary-finals.js --check-missing`);
    process.exit(0);
  }

  if (checkMissing) {
    process.exit(checkMissingHardFail() ? 0 : 1);
  }

  const traitsJson = JSON.parse(fs.readFileSync(path.join(__dirname, SETTINGS.traitsFile), "utf8"));
  let recordsById = new Map();

  if (generate || !fs.existsSync(MINT_DATA_PATH)) {
    console.log("Building mint records for legendary token IDs…");
    for (const tokenId of LEGENDARY_TOKEN_IDS) {
      if (!legendaryFinalExists(tokenId)) {
        console.log(`  #${tokenId}: skip (no legendary-finals/ PNG)`);
        continue;
      }
      try {
        const record = buildMintRecord(tokenId, traitsJson, [], null);
        recordsById.set(tokenId, record);
      } catch (err) {
        console.error(`  #${tokenId}: buildMintRecord failed: ${err.message}`);
        process.exit(1);
      }
    }
  } else {
    const records = JSON.parse(fs.readFileSync(MINT_DATA_PATH, "utf8"));
    recordsById = new Map(
      records
        .filter((r) => LEGENDARY_TOKEN_IDS.includes(r.tokenId))
        .map((r) => [r.tokenId, r]),
    );
    console.log(`Loaded ${recordsById.size} legendary records from mint-data.json`);
  }

  const present = LEGENDARY_TOKEN_IDS.filter((id) => legendaryFinalExists(id));
  const absent = LEGENDARY_TOKEN_IDS.filter((id) => !legendaryFinalExists(id));

  console.log(`\nLegendary finals present: ${present.length}/9`);
  if (absent.length > 0) {
    console.log(`Missing: ${absent.map((id) => `#${id}`).join(", ")}`);
  }

  let ok = 0;
  let fail = 0;
  let skip = 0;

  console.log("\nRound-trip verification (source PNG ↔ pixelsHex):");
  for (const tokenId of LEGENDARY_TOKEN_IDS) {
    if (!legendaryFinalExists(tokenId)) {
      console.log(`  #${tokenId}: SKIP (no source file)`);
      skip += 1;
      continue;
    }
    const record = recordsById.get(tokenId);
    if (!record) {
      console.error(`  #${tokenId}: FAIL — no mint record (run with --generate or build mint-data.json)`);
      fail += 1;
      continue;
    }
    const result = verifyRoundTrip(tokenId, record);
    if (result.status === "ok") {
      console.log(`  #${tokenId}: OK (${result.paletteKey}, ${result.nonZero} non-zero px)`);
      console.log(`    colors: ${result.colorUsage}`);
      ok += 1;
    } else {
      console.error(`  #${tokenId}: FAIL — ${result.reason}`);
      fail += 1;
    }
  }

  console.log(`\nResult: ${ok}/${present.length} zero-diff round-trips (${skip} skipped, ${fail} failed)`);

  if (present.length > 0 && fail > 0) {
    process.exit(1);
  }
  if (present.length === 0) {
    console.log("\nNo legendary-finals/ PNGs present — run with --check-missing to verify hard-fail behavior.");
  }
}

if (require.main === module) main();

module.exports = { verifyRoundTrip, unpackPixels, checkMissingHardFail };
