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
  pickTokenVariants,
  applyCoverageRules,
  pickPalette,
  compositeChromie,
  buildPhase3Effects,
  getMutationTier,
} = require("./generate");
const { overlayStrayPixels } = require("./phase3-variance");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;
const PIXELS_BYTES = 2048;
const TRAITS_BYTES = 32;

const CHARACTER_BYTES = {
  HeroA_Male: 0,
  HeroA_Female: 1,
  Alien: 2,
  Cat: 3,
  Agent: 4,
};

const PALETTE_BYTES = {
  SIGNAL: 0,
  ACID: 1,
  CYAN: 2,
  GHOST: 3,
  BLOOD: 4,
  MOSS: 5,
  SIGNAL_BLONDE: 6,
  SIGNAL_GREY: 7,
  SIGNAL_RED: 8,
  ACID_BLONDE: 9,
  ACID_GREY: 10,
  ACID_RED: 11,
  CYAN_BLONDE: 12,
  CYAN_GREY: 13,
  CYAN_RED: 14,
  GHOST_BLONDE: 15,
  GHOST_GREY: 16,
  GHOST_RED: 17,
  BLOOD_BLONDE: 18,
  BLOOD_GREY: 19,
  BLOOD_RED: 20,
  MOSS_BLONDE: 21,
  MOSS_GREY: 22,
  MOSS_RED: 23,
  CAT: 24,
  ALIEN: 25,
};

const HOOD_BYTES = { None: 0, Classic: 1 };
const SHIRT_BYTES = { None: 0, Crew: 1, Tank: 2, Tank_Female: 3 };
const BODY_BYTES = { None: 0, Default: 1, Female: 2, Female_Tank: 3, Alien: 4, Tank: 5 };
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
const MUTATION_BYTES = { Pristine: 0, Standard: 1, Drifted: 2, OffKilter: 3 };
const DRIFT_BYTES = { Pristine: 0, Standard: 1, Drifted: 2, OffKilter: 3 };

const TRAIT_SLOTS = [
  { index: 0, key: "character", label: "Character", table: CHARACTER_BYTES, source: "character" },
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
  { index: 15, key: "mutation", label: "Mutation", table: MUTATION_BYTES, source: "mutation" },
  { index: 16, key: "drift", label: "Drift", table: DRIFT_BYTES, source: "drift" },
];

function characterKey(character) {
  if (!character) return "HeroA_Male";
  if (character.name === "HeroA") {
    return character.gender === "Female" ? "HeroA_Female" : "HeroA_Male";
  }
  return character.name;
}

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

function encodeTraits({ character, paletteKey, picks, mTier, driftTier, warnings }) {
  const bytes = Buffer.alloc(TRAITS_BYTES, 0);
  const decoded = {};

  for (const slot of TRAIT_SLOTS) {
    let raw;
    if (slot.source === "character") raw = characterKey(character);
    else if (slot.source === "palette") raw = paletteKey;
    else if (slot.source === "mutation") raw = mTier ? mTier.name : "Standard";
    else if (slot.source === "drift") raw = driftTier ? driftTier.name : "Standard";
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

function buildMintRecord(tokenId, traitsJson, warnings) {
  const character = pickCharacter(tokenId);
  const paletteKey = pickPalette(tokenId, traitsJson, character);
  const picks = pickTokenVariants(tokenId, traitsJson, new Set(), character);
  const renderPicks = applyCoverageRules(picks, traitsJson, character);
  const mTier = getMutationTier(tokenId);
  const baseBuf = compositeChromie(renderPicks, traitsJson, 0, null, null);
  const { tier: driftTier, driftMap, strays } = buildPhase3Effects(
    tokenId,
    picks,
    baseBuf,
    null,
    character
  );

  let buf = compositeChromie(renderPicks, traitsJson, tokenId, driftMap, null);
  buf = overlayStrayPixels(buf, strays);

  const pixelsPacked = packPixels(buf);
  const { bytes: traitsPacked, decoded } = encodeTraits({
    character,
    paletteKey,
    picks,
    mTier,
    driftTier,
    warnings,
  });

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

  for (let i = 0; i < count; i++) {
    const tokenId = start + i;
    const warnings = [];
    const record = buildMintRecord(tokenId, traitsJson, warnings);
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
  TRAIT_SLOTS,
};
