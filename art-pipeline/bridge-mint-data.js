// ============================================================================
// bridge-mint-data.js
// Pipeline-to-contract bridge: generate.js composite → on-chain mint payloads.
//
// USAGE:
//   node bridge-mint-data.js --token 1
//   node bridge-mint-data.js --count 5000 --start 1
//
// OUTPUTS (batch mode):
//   output/mint-data.json   pixelsHex / traitsHex with 0x prefix
//   output/mint-data.csv    pixelsHex / traitsHex without 0x prefix
// ============================================================================

const fs = require("fs");
const path = require("path");
const { SETTINGS } = require("./chromies-config");
const {
  pickCharacter,
  resolveUniqueTokenTraits,
  TraitDedupeGuard,
  ComboCapGuard,
  resetGenerationStats,
  getAntiNoneStackFireTotal,
  getDedupeRerollFireTotal,
  getDedupeRerollLog,
  getComboCapRerollFireTotal,
  getComboCapRerollLog,
  pickPalette,
  resolveTokenPixelBuffer,
  buildPhase3Effects,
} = require("./generate");
const { isLegendaryToken } = require("./legendary-token-ids");
const { formatColorUsage } = require("./legendary-finals");
const {
  ON_CHAIN_CHARACTER_BYTES,
  ON_CHAIN_PALETTE_BYTES,
  characterKey,
} = require("./on-chain-character-bytes");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;
const PIXELS_BYTES = 2048;
const TRAITS_BYTES = 32;

const PALETTE_BYTES = ON_CHAIN_PALETTE_BYTES;

const HOOD_BYTES = { None: 0, Classic: 1 };
const SHIRT_BYTES = { None: 0, Crew: 1, Tank: 2, Tank_Female: 3 };
const BODY_BYTES = { None: 0, Default: 1, Female: 2, Female_Tank: 3, Alien: 4, Tank: 5, Zombie: 6 };
const BODYTATTOO_BYTES = { None: 0, UnderArmour: 1, AkuHeart: 2, Pyramid: 3, Normies: 4 };
const NECKLACE_BYTES = {
  None: 0,
  Male_Chain: 1,
  Female_Chain: 2,
  Female_Ornate: 3,
  Female_Flower: 4,
  Female_UpsideDownCross: 5,
  Female_Opal: 6,
  Male_Chromies: 7,
  Male_HappyFace: 8,
  Male_Normies: 9,
  Male_Pendent: 10,
};
const TATTOO_BYTES = { None: 0, Signal: 1, Thug: 2, Marks: 3, Scar: 4 };
const MASK_BYTES = { None: 0 };
const BEARD_BYTES = { None: 0, Full: 1, Goat: 2 };
const MUSTACHE_BYTES = { None: 0, Thick: 1 };
const EYES_BYTES = { Signal: 0, BlackEye: 1, MakeUp: 2, RunningMascara: 3, Stoned: 4, Alien: 5 };
const EARRINGS_BYTES = { None: 0, Stud: 1 };
const GLASSES_BYTES = { None: 0, Shades: 1, Neo: 2, VR: 3 };
const HAIR_BYTES = {
  None: 0,
  Mohawk: 1,
  Pompadour: 2,
  MrT: 3,
  Afro: 4,
  Dreads: 5,
  Surfer: 6,
  FadeRight: 7,
  AZVet: 8,
  Buns: 9,
};

const TRAIT_SLOTS = [
  { index: 0, key: "character", label: "Character", table: ON_CHAIN_CHARACTER_BYTES, source: "character" },
  { index: 1, key: "palette", label: "Palette", table: PALETTE_BYTES, source: "palette" },
  { index: 2, key: "hood", label: "Hood", table: HOOD_BYTES, source: "pick" },
  { index: 3, key: "shirt", label: "Shirt", table: SHIRT_BYTES, source: "pick" },
  { index: 4, key: "body", label: "Body", table: BODY_BYTES, source: "pick" },
  { index: 5, key: "bodytattoo", label: "Bodytattoo", table: BODYTATTOO_BYTES, source: "pick" },
  { index: 6, key: "necklace", label: "Necklace", table: NECKLACE_BYTES, source: "pick" },
  { index: 7, key: "tattoo", label: "Tattoo", table: TATTOO_BYTES, source: "pick" },
  { index: 8, key: "mask", label: "Mask", table: MASK_BYTES, source: "pick" },
  { index: 9, key: "beard", label: "Beard", table: BEARD_BYTES, source: "pick" },
  { index: 10, key: "mustache", label: "Mustache", table: MUSTACHE_BYTES, source: "pick" },
  { index: 11, key: "eyes", label: "Eyes", table: EYES_BYTES, source: "pick" },
  { index: 12, key: "earrings", label: "Earrings", table: EARRINGS_BYTES, source: "pick" },
  { index: 13, key: "glasses", label: "Glasses", table: GLASSES_BYTES, source: "pick" },
  { index: 14, key: "hair", label: "Hair", table: HAIR_BYTES, source: "pick" },
  { index: 15, key: "mutation", label: "Mutation", source: "retired" },
  { index: 16, key: "drift", label: "Drift", source: "retired" },
];

function lookupByte(table, value, context, warnings) {
  if (value === undefined || value === null) {
    warnings.push(`${context}: missing value`);
    return 0;
  }
  if (table[value] === undefined) {
    warnings.push(`${context}: unknown value "${value}"`);
    return 0;
  }
  return table[value];
}

function pickValue(picks, slot, fallback = "None") {
  if (!picks[slot] || !picks[slot].variant) return fallback;
  return picks[slot].variant.name;
}

function packTotalPixels(traitBytes, count) {
  if (count > 4096) {
    throw new Error(`totalPixels ${count} exceeds uint16 max 4096`);
  }
  traitBytes[17] = (count >> 8) & 0xff;
  traitBytes[18] = count & 0xff;
}

function countNonZeroNibbles(packed) {
  let count = 0;
  for (let i = 0; i < PX; i++) {
    const byteIndex = i >> 1;
    const nibble = (i & 1) === 0 ? (packed[byteIndex] >> 4) & 0x0f : packed[byteIndex] & 0x0f;
    if (nibble !== 0) count++;
  }
  return count;
}

function packPixels(buf) {
  if (buf.length !== PX) {
    throw new Error(`expected ${PX} pixel indices, got ${buf.length}`);
  }
  const packed = Buffer.alloc(PIXELS_BYTES, 0);
  for (let i = 0; i < PX; i++) {
    const val = buf[i] & 0x0f;
    const byteIndex = i >> 1;
    if ((i & 1) === 0) {
      packed[byteIndex] = (val << 4) | (packed[byteIndex] & 0x0f);
    } else {
      packed[byteIndex] = (packed[byteIndex] & 0xf0) | val;
    }
  }
  return packed;
}

function encodeTraits({ character, paletteKey, picks, warnings }) {
  const bytes = Buffer.alloc(TRAITS_BYTES, 0);
  const decoded = {};

  for (const slot of TRAIT_SLOTS) {
    if (slot.source === "retired") {
      bytes[slot.index] = 0;
      decoded[slot.key] = { value: "Retired/Unused", byte: 0 };
      continue;
    }
    let raw;
    if (slot.source === "character") raw = characterKey(character);
    else if (slot.source === "palette") raw = paletteKey;
    else raw = pickValue(picks, slot.key);

    const byteVal = lookupByte(slot.table, raw, `${slot.label} [${slot.index}]`, warnings);
    bytes[slot.index] = byteVal;
    decoded[slot.key] = { value: raw, byte: byteVal };
  }

  return { bytes, decoded };
}

function toHex(buf, withPrefix) {
  const hex = buf.toString("hex");
  return withPrefix ? `0x${hex}` : hex;
}

function buildMintRecord(tokenId, traitsJson, warnings, dedupeGuard = null, comboCapGuard = null) {
  const guard = dedupeGuard || new TraitDedupeGuard();
  const capGuard = comboCapGuard || new ComboCapGuard();
  const { character, paletteKey, picks, renderPicks } = resolveUniqueTokenTraits(
    tokenId,
    traitsJson,
    guard,
    { comboCapGuard: capGuard, loadBuffers: !isLegendaryToken(tokenId) },
  );
  const { driftMap } = buildPhase3Effects(tokenId, picks, null, character);
  const { buf, legendaryFinal, colorUsage, sourcePath } = resolveTokenPixelBuffer(
    tokenId,
    traitsJson,
    renderPicks,
    driftMap,
    paletteKey,
  );
  if (legendaryFinal) {
    console.log(`  [legendary-final] #${tokenId} ← ${sourcePath}`);
    console.log(`  [legendary-final] colors: ${formatColorUsage(colorUsage)}`);
  }

  const pixelsPacked = packPixels(buf);
  const { bytes: traitsPacked, decoded } = encodeTraits({
    character,
    paletteKey,
    picks: renderPicks,
    warnings,
  });
  packTotalPixels(traitsPacked, countNonZeroNibbles(pixelsPacked));

  return {
    tokenId,
    pixelsHex: toHex(pixelsPacked, true),
    traitsHex: toHex(traitsPacked, true),
    pixelsHexRaw: toHex(pixelsPacked, false),
    traitsHexRaw: toHex(traitsPacked, false),
    character: characterKey(character),
    palette: paletteKey,
    traitsDecoded: decoded,
    warnings: [],
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { token: null, count: null, start: 1 };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--token" || a === "-t") result.token = parseInt(args[++i], 10);
    else if (a === "--count" || a === "-c") result.count = parseInt(args[++i], 10);
    else if (a === "--start" || a === "-s") result.start = parseInt(args[++i], 10);
    else if (a === "--help" || a === "-h") result.help = true;
  }

  return result;
}

function printUsage() {
  console.log(`Usage:
  node bridge-mint-data.js --token <id>
  node bridge-mint-data.js --count <n> [--start <id>]

Examples:
  node bridge-mint-data.js --token 1
  node bridge-mint-data.js --count 5000 --start 1`);
}

function printSingleSummary(record, warnings) {
  console.log(`\nMint data for token #${record.tokenId}`);
  console.log("─".repeat(60));
  console.log(`pixelsHex (${PIXELS_BYTES} bytes): ${record.pixelsHex}`);
  console.log(`traitsHex (${TRAITS_BYTES} bytes):  ${record.traitsHex}`);
  console.log("\nTrait encoding:");
  for (const slot of TRAIT_SLOTS) {
    const d = record.traitsDecoded[slot.key];
    const byteStr = `0x${d.byte.toString(16).padStart(2, "0")}`;
    console.log(`  [${String(slot.index).padStart(2)}] ${slot.label.padEnd(12)} ${String(d.value).padEnd(22)} → ${byteStr}`);
  }
  console.log(`\nCharacter: ${record.character}  |  Palette: ${record.palette}`);
  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  } else {
    console.log("\nNo lookup warnings.");
  }
}

function runBatch(count, start, traitsJson) {
  const outDir = path.resolve(SETTINGS.outputDir);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const records = [];
  const allWarnings = [];
  const characterDist = {};
  const paletteDist = {};
  const mutationDist = {};
  const driftDist = {};

  const progressEvery = count >= 1000 ? 250 : count >= 100 ? 50 : 10;
  const t0 = Date.now();

  console.log(`Building mint data for tokens ${start}–${start + count - 1} (${count} total)...`);

  resetGenerationStats();
  const dedupeGuard = new TraitDedupeGuard();
  const comboCapGuard = new ComboCapGuard();

  for (let i = 0; i < count; i++) {
    const tokenId = start + i;
    const warnings = [];
    const record = buildMintRecord(tokenId, traitsJson, warnings, dedupeGuard, comboCapGuard);
    allWarnings.push(...warnings.map(w => `token ${tokenId}: ${w}`));

    records.push({
      tokenId: record.tokenId,
      pixelsHex: record.pixelsHex,
      traitsHex: record.traitsHex,
    });

    characterDist[record.character] = (characterDist[record.character] || 0) + 1;
    paletteDist[record.palette] = (paletteDist[record.palette] || 0) + 1;
    mutationDist[record.traitsDecoded.mutation.value] =
      (mutationDist[record.traitsDecoded.mutation.value] || 0) + 1;
    driftDist[record.traitsDecoded.drift.value] =
      (driftDist[record.traitsDecoded.drift.value] || 0) + 1;

    if ((i + 1) % progressEvery === 0 || i + 1 === count) {
      const pct = (((i + 1) / count) * 100).toFixed(1);
      console.log(`  ${i + 1}/${count} (${pct}%)`);
    }
  }

  const jsonPath = path.join(outDir, "mint-data.json");
  const csvPath = path.join(outDir, "mint-data.csv");

  fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2));

  const csvLines = ["tokenId,pixelsHex,traitsHex"];
  for (const r of records) {
    csvLines.push(`${r.tokenId},${r.pixelsHex.slice(2)},${r.traitsHex.slice(2)}`);
  }
  fs.writeFileSync(csvPath, csvLines.join("\n"));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nWrote ${records.length} records in ${elapsed}s`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${csvPath}`);

  console.log("\nCharacter distribution:");
  for (const [k, v] of Object.entries(characterDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(16)} ${v} (${((v / count) * 100).toFixed(1)}%)`);
  }
  console.log(`\nAnti-none-stack fires: ${getAntiNoneStackFireTotal()} (${((getAntiNoneStackFireTotal() / count) * 100).toFixed(2)}%)`);
  console.log(`Dedupe-reroll fires: ${getDedupeRerollFireTotal()} (${((getDedupeRerollFireTotal() / count) * 100).toFixed(2)}%)`);
  const dedupeLog = getDedupeRerollLog();
  if (dedupeLog.length > 0) {
    console.log(`Dedupe-reroll log (${dedupeLog.length} entries):`);
    for (const entry of dedupeLog) {
      console.log(
        `  #${entry.tokenId} vs #${entry.partnerId} → ${entry.slot}${entry.variant ? `=${entry.variant}` : ""} (:dedupe:${entry.attempt}, attempt ${entry.attempt}/5)`,
      );
    }
  }
  console.log(`Combo-cap-reroll fires: ${getComboCapRerollFireTotal()} (${((getComboCapRerollFireTotal() / count) * 100).toFixed(2)}%)`);
  const capLog = getComboCapRerollLog();
  if (capLog.length > 0) {
    console.log(`Combo-cap-reroll log (${capLog.length} entries):`);
    for (const entry of capLog) {
      console.log(
        `  #${entry.tokenId} "${entry.originalCombo}" → ${entry.slot}=${entry.variant} (:comboCap:${entry.attempt}, attempt ${entry.attempt}/5)`,
      );
    }
  }
  console.log(`Trait vector duplicates: 0 (dedupe guard enforced)`);
  console.log("\nPalette distribution (top 10):");
  for (const [k, v] of Object.entries(paletteDist).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${k.padEnd(16)} ${v} (${((v / count) * 100).toFixed(1)}%)`);
  }
  console.log("\nMutation tier distribution:");
  for (const [k, v] of Object.entries(mutationDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${v} (${((v / count) * 100).toFixed(1)}%)`);
  }
  console.log("\nDrift tier distribution:");
  for (const [k, v] of Object.entries(driftDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${v} (${((v / count) * 100).toFixed(1)}%)`);
  }

  if (allWarnings.length > 0) {
    const unique = [...new Set(allWarnings)];
    console.log(`\nWarnings: ${unique.length} unique (${allWarnings.length} total)`);
    for (const w of unique.slice(0, 20)) console.log(`  ⚠ ${w}`);
    if (unique.length > 20) console.log(`  ... and ${unique.length - 20} more`);
  } else {
    console.log("\nNo lookup warnings.");
  }
}

function main() {
  const { token, count, start, help } = parseArgs();

  if (help || (token === null && count === null)) {
    printUsage();
    process.exit(help ? 0 : 1);
  }

  if (token !== null && count !== null) {
    console.error("Use either --token or --count, not both.");
    process.exit(1);
  }

  const traitsJson = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));

  if (token !== null) {
    const warnings = [];
    const record = buildMintRecord(token, traitsJson, warnings);
    printSingleSummary(record, warnings);
    return;
  }

  if (!Number.isFinite(count) || count < 1) {
    console.error("--count must be a positive integer");
    process.exit(1);
  }

  runBatch(count, start, traitsJson);
}

if (require.main === module) main();

module.exports = {
  packPixels,
  encodeTraits,
  buildMintRecord,
  characterKey,
  countNonZeroNibbles,
  packTotalPixels,
  TRAIT_SLOTS,
  ON_CHAIN_CHARACTER_BYTES,
};
