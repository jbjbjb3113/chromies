// ============================================================================
// gallery.js
// Generate N Chromies with per-token palette + coverage rules.
// Writes per-token files AND a grid PNG. Updates master ledger.
// ============================================================================
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const {
  resolveCharacter,
  pickCharacter,
  pickTokenVariants,
  finalizeTokenTraits,
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
  compositeChromie,
  renderPNG,
  renderSVG,
  upscalePNG,
  buildMetadata,
  updateMaster,
  buildPhase3Effects,
} = require("./generate");
const { isGoldToken, GOLD_TOKEN_IDS } = require("./gold-token-ids");
const { getLegendaryForToken, LEGENDARY_ASSIGNMENTS, isLegendaryToken } = require("./legendary-token-ids");
const { legendaryFinalExists } = require("./legendary-finals");
const { characterKey } = require("./on-chain-character-bytes");

const GRID = SETTINGS.grid;
const TILE_SCALE = 4;
const SHOWCASE_TILE_SCALE = 8;
const PADDING = 8;
const GALLERY_BG = [0xf5, 0xf5, 0xf5];

const GENDER_TOKENS = new Set(["male", "female", "non-binary", "non_binary"]);

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromStr(s) {
  let seed = 0;
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) | 0;
  return seed;
}

function normalizeGenderToken(token) {
  const g = String(token).toLowerCase().replace(/_/g, "-");
  if (g === "non-binary") return "Non-Binary";
  if (g === "male") return "Male";
  if (g === "female") return "Female";
  return token;
}

/** Parse one combo: "Chubby", "HeroA Female", "SideProfile Male". */
function parseCharacterCombo(raw) {
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].toLowerCase().replace(/_/g, "-");
    if (GENDER_TOKENS.has(last)) {
      return {
        name: parts.slice(0, -1).join(" "),
        gender: normalizeGenderToken(parts[parts.length - 1]),
      };
    }
  }
  return { name: trimmed, gender: null };
}

function parseCharactersFlag(value) {
  return String(value)
    .split(",")
    .map(parseCharacterCombo)
    .filter(Boolean);
}

function parseCharacterCountsFlag(value) {
  const entries = [];
  for (const raw of String(value).split(",")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const sepIdx = Math.max(trimmed.lastIndexOf(":"), trimmed.lastIndexOf("="));
    if (sepIdx <= 0) {
      throw new Error(`invalid --character-counts entry "${trimmed}" (expected "Name:count" or "Name=count")`);
    }
    const label = trimmed.slice(0, sepIdx).trim();
    const count = parseInt(trimmed.slice(sepIdx + 1), 10);
    if (!Number.isFinite(count) || count < 0) {
      throw new Error(`invalid count in --character-counts entry "${trimmed}"`);
    }
    const spec = parseCharacterCombo(label);
    if (!spec) {
      throw new Error(`invalid character label in --character-counts entry "${trimmed}"`);
    }
    entries.push({ spec, count });
  }
  if (entries.length === 0) {
    throw new Error("--character-counts requires at least one entry");
  }
  return entries;
}

function resolveCharacterSpec(spec) {
  let pool = CHARACTERS.filter(
    (c) => c.name.toLowerCase() === spec.name.toLowerCase(),
  );
  if (pool.length === 0) {
    throw new Error(`character "${spec.name}" not found in CHARACTERS config`);
  }
  if (spec.gender) {
    const genderPool = pool.filter(
      (c) => c.gender && c.gender.toLowerCase() === spec.gender.toLowerCase(),
    );
    if (genderPool.length === 0) {
      throw new Error(`no ${spec.name} entry with gender "${spec.gender}"`);
    }
    pool = genderPool;
  }
  return pool[0];
}

/** Roughly equal counts per character, deterministically shuffled for intermixing. */
function buildCharacterAssignments(count, start, specs) {
  const characters = specs.map(resolveCharacterSpec);
  const n = characters.length;
  const base = Math.floor(count / n);
  let remainder = count % n;
  const slots = [];
  for (const character of characters) {
    const take = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    for (let i = 0; i < take; i++) slots.push(character);
  }
  const shuffleSeed = seedFromStr(
    `gallery-mix:${start}:${count}:${specs.map((s) => `${s.name}|${s.gender || ""}`).join(",")}`,
  );
  const rng = mulberry32(shuffleSeed);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

/** Explicit per-character counts, deterministically shuffled for intermixing. */
function buildCharacterAssignmentsFromCounts(start, entries) {
  const slots = [];
  for (const { spec, count } of entries) {
    const character = resolveCharacterSpec(spec);
    for (let i = 0; i < count; i++) slots.push(character);
  }
  const shuffleSeed = seedFromStr(
    `gallery-mix:${start}:${slots.length}:${entries.map((e) => `${e.spec.name}|${e.spec.gender || ""}:${e.count}`).join(",")}`,
  );
  const rng = mulberry32(shuffleSeed);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

/** Force N characters from --character-counts; fill remaining tiles with null (natural pickCharacter). */
function buildMixedCharacterPlan(totalCount, start, entries) {
  const forcedSlots = [];
  for (const { spec, count } of entries) {
    const character = resolveCharacterSpec(spec);
    for (let i = 0; i < count; i++) forcedSlots.push(character);
  }
  if (forcedSlots.length > totalCount) {
    throw new Error(
      `--character-counts sum (${forcedSlots.length}) exceeds --count (${totalCount})`,
    );
  }
  const slots = [...forcedSlots];
  for (let i = forcedSlots.length; i < totalCount; i++) slots.push(null);
  const shuffleSeed = seedFromStr(
    `gallery-mixed:${start}:${totalCount}:${entries.map((e) => `${e.spec.name}|${e.spec.gender || ""}:${e.count}`).join(",")}`,
  );
  const rng = mulberry32(shuffleSeed);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

function summarizeCharacterPlan(slots) {
  const counts = {};
  let natural = 0;
  for (const character of slots) {
    if (!character) {
      natural += 1;
      continue;
    }
    const key = characterKey(character);
    counts[key] = (counts[key] || 0) + 1;
  }
  if (natural > 0) counts["(natural)"] = natural;
  return counts;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    count: 24,
    start: 1,
    palette: null,
    character: null,
    gender: null,
    characters: null,
    characterCounts: null,
    json: false,
    fromMintData: false,
    specialTokens: false,
    allowLegendaryPlaceholder: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--count") result.count = parseInt(args[++i], 10);
    else if (a === "--start") result.start = parseInt(args[++i], 10);
    else if (a === "--palette") result.palette = args[++i].toUpperCase();
    else if (a === "--character") result.character = args[++i];
    else if (a === "--gender") result.gender = args[++i];
    else if (a === "--characters") result.characters = args[++i];
    else if (a === "--character-counts") result.characterCounts = args[++i];
    else if (a === "--from-mint-data") result.fromMintData = true;
    else if (a === "--special-tokens") result.specialTokens = true;
    else if (a === "--json") result.json = true;
    else if (a === "--allow-legendary-placeholder") result.allowLegendaryPlaceholder = true;
  }
  return result;
}

function printLegendaryPlaceholderBanner() {
  const bar = "!".repeat(72);
  console.warn(`\n${bar}`);
  console.warn("  WARNING: --allow-legendary-placeholder is ACTIVE (gallery.js ONLY)");
  console.warn("  Legendary tokens missing legendary-finals/ PNGs will render via COMPOSITE");
  console.warn("  placeholders — NOT valid for mint, IPFS, or production output.");
  console.warn("  bridge-mint-data.js and generate.js always hard-fail without JB finals.");
  console.warn(`${bar}\n`);
}

function shouldLoadTraitBuffers(tokenId, allowLegendaryPlaceholder) {
  if (!getLegendaryForToken(tokenId)) return true;
  if (!allowLegendaryPlaceholder) return false;
  return !legendaryFinalExists(tokenId);
}

function resolveGalleryPixelBuffer(
  tokenId,
  traits,
  renderPicks,
  driftMap,
  paletteKey,
  allowLegendaryPlaceholder,
) {
  if (
    allowLegendaryPlaceholder &&
    isLegendaryToken(tokenId) &&
    !legendaryFinalExists(tokenId)
  ) {
    return {
      buf: compositeChromie(renderPicks, traits, tokenId, driftMap),
      legendaryFinal: false,
      legendaryPlaceholder: true,
    };
  }
  const result = resolveTokenPixelBuffer(tokenId, traits, renderPicks, driftMap, paletteKey);
  return { ...result, legendaryPlaceholder: false };
}

function loadMintDataRecords() {
  const mintPath = path.join(SETTINGS.outputDir, "mint-data.json");
  if (!fs.existsSync(mintPath)) {
    throw new Error(`mint-data not found at ${mintPath} — run bridge-mint-data.js first`);
  }
  const records = JSON.parse(fs.readFileSync(mintPath, "utf8"));
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("mint-data.json is empty or not an array");
  }
  records.sort((a, b) => a.tokenId - b.tokenId);
  for (let i = 0; i < records.length; i++) {
    const expectedId = i + 1;
    if (records[i].tokenId !== expectedId) {
      throw new Error(
        `mint-data.json gap at index ${i}: expected tokenId ${expectedId}, got ${records[i].tokenId}`,
      );
    }
  }
  return records;
}

/** 9 Normie Legendary + 11 GOLD, in assignment order. */
function buildSpecialTokenPlan() {
  const legendary = LEGENDARY_ASSIGNMENTS.map((a) => ({
    tokenId: a.tokenId,
    expectedPalette: a.palette,
    tier: "Normie Legendary",
  }));
  const gold = GOLD_TOKEN_IDS.map((tokenId) => ({
    tokenId,
    expectedPalette: "GOLD",
    tier: "GOLD",
  }));
  return [...legendary, ...gold];
}

function slugPart(value) {
  return String(value || "any")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function galleryRunBasename(count, start, paletteOverride, characterOverride, genderOverride, characterSpecs) {
  const parts = [`gallery_${count}`];
  if (paletteOverride) {
    parts.push(slugPart(paletteOverride));
  } else if (characterSpecs && characterSpecs.length > 0) {
    for (const spec of characterSpecs) {
      parts.push(slugPart(spec.name));
      if (spec.gender) parts.push(slugPart(spec.gender));
    }
  } else if (characterOverride || genderOverride) {
    if (characterOverride) parts.push(slugPart(characterOverride));
    if (genderOverride) parts.push(slugPart(genderOverride));
  } else {
    parts.push("mixed");
  }
  parts.push(String(start));
  return parts.join("_");
}

function galleryPngName(count, start, paletteOverride, characterOverride, genderOverride, characterSpecs) {
  return `${galleryRunBasename(count, start, paletteOverride, characterOverride, genderOverride, characterSpecs)}.png`;
}

function galleryTraitsJsonName(count, start, paletteOverride, characterOverride, genderOverride, characterSpecs) {
  return `${galleryRunBasename(count, start, paletteOverride, characterOverride, genderOverride, characterSpecs)}_traits.json`;
}

function buildGalleryTraitRow(tokenId, character, paletteKey, picks, slotOrder) {
  const row = {
    tokenId,
    character: character ? character.name : null,
    gender: character?.gender ?? null,
    characterKey: character ? characterKey(character) : null,
    palette: paletteKey,
  };
  for (const slot of slotOrder) {
    if (picks[slot]) row[slot] = picks[slot].variant.name;
  }
  return row;
}

function gridDims(n) {
  const cols = Math.ceil(Math.sqrt(n * 4 / 3));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

/** Non-zero palette indices in the final 64×64 buffer (matches contract _countNonZeroPixels). */
function countNonZeroPixels(buf) {
  let count = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 0) count++;
  }
  return count;
}

function medianOfSorted(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function printGalleryPixelStats(counts) {
  if (counts.length === 0) return;
  const sorted = [...counts].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const med = medianOfSorted(sorted);
  const avg = Math.round(sorted.reduce((s, v) => s + v, 0) / n);
  console.log("");
  console.log("pixel counts (non-zero indices in final 64×64 buffer):");
  console.log(`  n=${n}  min=${min}  median=${med}  max=${max}  mean=${avg}`);
}

function collectMissingFiles(picks) {
  const missing = [];
  for (const [slot, pick] of Object.entries(picks)) {
    const filePath = path.join(SETTINGS.componentsDir, pick.file);
    if (!fs.existsSync(filePath)) missing.push({ slot, file: pick.file });
  }
  return missing;
}

function analyzeRenderedRgb(pngBuf) {
  const px = PNG.sync.read(pngBuf);
  const uniq = new Set();
  let opaque = 0;
  const BLOCK = 6;
  const start = 20;
  let uniformCenterBlocks = 0;
  for (let by = 0; by < 4; by++) {
    for (let bx = 0; bx < 4; bx++) {
      const blockColors = new Set();
      for (let y = start + by * BLOCK; y < start + (by + 1) * BLOCK; y++) {
        for (let x = start + bx * BLOCK; x < start + (bx + 1) * BLOCK; x++) {
          const o = (y * GRID + x) * 4;
          const key = `${px.data[o]},${px.data[o + 1]},${px.data[o + 2]}`;
          if (px.data[o + 3] === 0) continue;
          blockColors.add(key);
        }
      }
      if (blockColors.size >= 1 && blockColors.size <= 2) uniformCenterBlocks++;
    }
  }
  for (let i = 0; i < GRID * GRID; i++) {
    if (px.data[i * 4 + 3] === 0) continue;
    opaque++;
    uniq.add(`${px.data[i * 4]},${px.data[i * 4 + 1]},${px.data[i * 4 + 2]}`);
  }
  return {
    rgbUnique: uniq.size,
    rgbOpaque: opaque,
    centerBlockScore: uniformCenterBlocks / 16,
  };
}

/** Heuristic + metadata classifier for contact-sheet anomaly review. */
function classifyGalleryTile(buf, meta = {}, pngBuf = null) {
  const { legendary, palette, missing, head, characterKey } = meta;

  if (missing.some((m) => ["head", "neck", "body"].includes(m.slot))) return "missing_asset";
  if (characterKey === "Agent" && !head) return "missing_asset";

  if (legendary) {
    if (!legendary.headVariant) return "coming_soon_legendary";
    if (head === "Legendary_ACK") return "circular_glyph";
    if (head === "Legendary_Serc" || head === "Legendary_JackButcher" || head === "Legendary_Timpers") {
      return "grid_blocks";
    }
    return "normie_legendary";
  }

  if (pngBuf) {
    const rgb = analyzeRenderedRgb(pngBuf);
    if (rgb.centerBlockScore >= 0.55) return "grid_blocks";
    if (rgb.centerBlockScore >= 0.28 && rgb.rgbUnique <= 11 && palette?.startsWith("NORMIE_")) {
      return head === "Legendary_ACK" ? "circular_glyph" : "grid_blocks";
    }
  }

  const opaque = countNonZeroPixels(buf);
  if (opaque < 80) return "sparse";

  const BLOCK = 8;
  const blocksPerSide = GRID / BLOCK;
  let uniformBlocks = 0;
  for (let by = 0; by < blocksPerSide; by++) {
    for (let bx = 0; bx < blocksPerSide; bx++) {
      const indices = new Set();
      for (let y = by * BLOCK; y < (by + 1) * BLOCK; y++) {
        for (let x = bx * BLOCK; x < (bx + 1) * BLOCK; x++) {
          const v = buf[y * GRID + x];
          if (v !== 0) indices.add(v);
        }
      }
      if (indices.size >= 1 && indices.size <= 2) uniformBlocks++;
    }
  }
  const blockScore = uniformBlocks / (blocksPerSide * blocksPerSide);

  const uniqueIndices = new Set();
  let cx = 0;
  let cy = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const v = buf[y * GRID + x];
      if (v === 0) continue;
      uniqueIndices.add(v);
      cx += x;
      cy += y;
    }
  }
  cx /= opaque;
  cy /= opaque;

  let inner = 0;
  let mid = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (buf[y * GRID + x] === 0) continue;
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (d < 5) inner += 1;
      else if (d < 14) mid += 1;
    }
  }
  const hollowCenter = inner / opaque < 0.15 && mid / opaque > 0.35;

  if (blockScore >= 0.45 && uniqueIndices.size <= 8) return "grid_blocks";
  if (hollowCenter && uniqueIndices.size <= 6 && opaque < 900) return "circular_glyph";
  return "normal";
}

function formatTileContext(entry) {
  const parts = [
    `tile ${entry.tileIndex}`,
    `#${entry.tokenId}`,
    `pos=${entry.col},${entry.row}`,
    entry.palette,
    entry.characterKey,
  ];
  if (entry.legendary) parts.push(`legendary=${entry.legendary.artist}`);
  if (entry.gold) parts.push("GOLD");
  if (entry.missing.length > 0) {
    parts.push(`missing=[${entry.missing.map((m) => `${m.slot}:${m.file}`).join(", ")}]`);
  }
  if (entry.head) parts.push(`head=${entry.head}`);
  return parts.join(" | ");
}

function printGalleryTileReport(tileLog) {
  console.log("");
  console.log("gallery tile map (index → tokenId):");
  for (const entry of tileLog) {
    console.log(`  ${entry.tileIndex}: #${entry.tokenId} (col=${entry.col}, row=${entry.row})`);
  }

  const groups = {
    grid_blocks: [],
    circular_glyph: [],
    coming_soon_legendary: [],
    normie_legendary: [],
    missing_asset: [],
    sparse: [],
  };
  for (const entry of tileLog) {
    if (groups[entry.visualClass]) groups[entry.visualClass].push(entry);
  }

  console.log("");
  console.log(`visual anomaly report (${tileLog.length} tiles):`);
  if (groups.grid_blocks.length === 0) {
    console.log("  (a) gray grid-of-blocks: none detected");
  } else {
    console.log(`  (a) gray grid-of-blocks (${groups.grid_blocks.length}):`);
    for (const entry of groups.grid_blocks) console.log(`      ${formatTileContext(entry)}`);
  }
  if (groups.circular_glyph.length === 0) {
    console.log("  (b) circular glyph: none detected");
  } else {
    console.log(`  (b) circular glyph (${groups.circular_glyph.length}):`);
    for (const entry of groups.circular_glyph) console.log(`      ${formatTileContext(entry)}`);
  }
  if (groups.coming_soon_legendary.length > 0) {
    console.log(`  coming soon legendary (${groups.coming_soon_legendary.length}):`);
    for (const entry of groups.coming_soon_legendary) console.log(`      ${formatTileContext(entry)}`);
  }
  if (groups.normie_legendary.length > 0) {
    console.log(`  normie legendary greyscale 1/1 (${groups.normie_legendary.length}):`);
    for (const entry of groups.normie_legendary) console.log(`      ${formatTileContext(entry)}`);
  }
  if (groups.missing_asset.length > 0) {
    console.log(`  missing assets (${groups.missing_asset.length}):`);
    for (const entry of groups.missing_asset) console.log(`      ${formatTileContext(entry)}`);
  }
  if (groups.sparse.length > 0) {
    console.log(`  sparse / near-empty (${groups.sparse.length}):`);
    for (const entry of groups.sparse) console.log(`      ${formatTileContext(entry)}`);
  }
}

function main() {
  let {
    count,
    start,
    palette: paletteOverride,
    character: characterOverride,
    gender: genderOverride,
    characters: charactersFlag,
    characterCounts: characterCountsFlag,
    json: writeJson,
    fromMintData,
    specialTokens,
    allowLegendaryPlaceholder,
  } = parseArgs();

  if (allowLegendaryPlaceholder) {
    printLegendaryPlaceholderBanner();
  }

  const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
  const slotOrder = Object.keys(traits.slots);

  let characterSpecs = null;
  let characterPlan = null;
  let characterCountEntries = null;
  let mintRecords = null;
  let specialPlan = null;

  if (specialTokens && fromMintData) {
    console.error("--special-tokens cannot be combined with --from-mint-data");
    process.exit(1);
  }

  if (specialTokens) {
    if (charactersFlag || characterCountsFlag || characterOverride || genderOverride) {
      console.warn("  [WARN] --special-tokens set; ignoring character overrides");
    }
    specialPlan = buildSpecialTokenPlan();
    count = specialPlan.length;
    console.log(`  special tokens: ${LEGENDARY_ASSIGNMENTS.length} Normie Legendary + ${GOLD_TOKEN_IDS.length} GOLD`);
  } else if (fromMintData) {
    if (charactersFlag || characterCountsFlag || characterOverride || genderOverride) {
      console.warn("  [WARN] --from-mint-data set; ignoring character overrides");
    }
    try {
      mintRecords = loadMintDataRecords();
      count = mintRecords.length;
      start = mintRecords[0].tokenId;
      writeJson = true;
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    console.log(`  mint-data: ${count} tokens (IDs ${start}–${start + count - 1})`);
  } else if (characterCountsFlag) {
    if (charactersFlag) {
      console.warn("  [WARN] --character-counts set; ignoring --characters");
    }
    try {
      characterCountEntries = parseCharacterCountsFlag(characterCountsFlag);
      characterSpecs = characterCountEntries.map((e) => e.spec);
      const derivedCount = characterCountEntries.reduce((sum, e) => sum + e.count, 0);
      if (derivedCount === 0) {
        console.error("--character-counts sum is 0");
        process.exit(1);
      }
      if (count > derivedCount) {
        characterPlan = buildMixedCharacterPlan(count, start, characterCountEntries);
        console.log(
          `  mixed gallery: ${count} total (${derivedCount} forced + ${count - derivedCount} natural)`,
        );
      } else {
        characterPlan = buildCharacterAssignmentsFromCounts(start, characterCountEntries);
        count = derivedCount;
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    const plannedCounts = summarizeCharacterPlan(characterPlan);
    console.log(
      `  planned character counts: ${Object.entries(plannedCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
    if (characterOverride || genderOverride) {
      console.warn("  [WARN] --character-counts set; ignoring --character / --gender");
    }
  } else if (charactersFlag) {
    characterSpecs = parseCharactersFlag(charactersFlag);
    if (characterSpecs.length === 0) {
      console.error("--characters requires at least one character combo");
      process.exit(1);
    }
    try {
      characterPlan = buildCharacterAssignments(count, start, characterSpecs);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    const plannedCounts = summarizeCharacterPlan(characterPlan);
    console.log(
      `  planned character split: ${Object.entries(plannedCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
    if (characterOverride || genderOverride) {
      console.warn("  [WARN] --characters set; ignoring --character / --gender");
    }
  }

  const tileScale = specialTokens ? SHOWCASE_TILE_SCALE : TILE_SCALE;
  const cols = specialTokens ? count : gridDims(count).cols;
  const rows = specialTokens ? 1 : gridDims(count).rows;
  const tileSize = GRID * tileScale;
  const W = cols * (tileSize + PADDING) + PADDING;
  const H = rows * (tileSize + PADDING) + PADDING;

  const palLabel = paletteOverride ? `palette FORCED to ${paletteOverride}` : "palettes per-token";
  const genderLabel = characterPlan ? "" : (genderOverride ? `, gender FORCED to ${genderOverride}` : "");
  const charLabel = characterPlan
    ? `, characters MIX [${characterSpecs.map((s) => (s.gender ? `${s.name} (${s.gender})` : s.name)).join(", ")}]`
    : (characterOverride ? `, character FORCED to ${characterOverride}` : "");
  const jsonLabel = writeJson || characterPlan || fromMintData ? ", traits JSON ON" : "";
  const mintLabel = fromMintData ? ", source mint-data.json" : "";
  const specialLabel = specialTokens ? ", special-token showcase" : "";
  console.log(`Gallery: ${count} tokens, ${cols}x${rows} grid, ${palLabel}${charLabel}${genderLabel}${jsonLabel}${mintLabel}${specialLabel}`);

  const skipPerTokenWrites = fromMintData || specialTokens;
  const tokensDir = path.join(SETTINGS.outputDir, "tokens");
  if (!skipPerTokenWrites && !fs.existsSync(tokensDir)) {
    fs.mkdirSync(tokensDir, { recursive: true });
  }

  const gallery = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    gallery.data[i * 4] = GALLERY_BG[0];
    gallery.data[i * 4 + 1] = GALLERY_BG[1];
    gallery.data[i * 4 + 2] = GALLERY_BG[2];
    gallery.data[i * 4 + 3] = 255;
  }

  const paletteCounts = {};
  const pixelCounts = [];
  const characterCounts = {};
  let goldCount = 0;
  let legendaryCount = 0;
  let legendaryPlaceholderCount = 0;
  const writeTraitJson = writeJson || Boolean(characterPlan) || fromMintData;

  const traitRows = [];
  const tileLog = [];

  resetGenerationStats();
  const dedupeGuard = fromMintData ? null : new TraitDedupeGuard();
  const comboCapGuard = fromMintData ? null : new ComboCapGuard();

  for (let n = 0; n < count; n++) {
    const tokenId = specialPlan
      ? specialPlan[n].tokenId
      : fromMintData
        ? mintRecords[n].tokenId
        : start + n;
    const col = n % cols;
    const row = Math.floor(n / cols);
    const ox = PADDING + col * (tileSize + PADDING);
    const oy = PADDING + row * (tileSize + PADDING);

    let character = fromMintData
      ? pickCharacter(tokenId)
      : characterPlan
        ? (characterPlan[n] ?? pickCharacter(tokenId))
        : resolveCharacter(tokenId, characterOverride, genderOverride);
    if (!characterPlan && genderOverride && character?.gender?.toLowerCase() !== genderOverride.toLowerCase()) {
      console.warn(
        `  [WARN] token ${tokenId}: expected gender ${genderOverride}, got ${character?.gender || "unknown"}`,
      );
    }
    const charKey = character ? characterKey(character) : "unknown";
    characterCounts[charKey] = (characterCounts[charKey] || 0) + 1;

    const paletteKey = paletteOverride || pickPalette(tokenId, traits, character);
    const palette = PALETTES[paletteKey];
    if (!palette || !palette.colors) {
      console.error(`\npalette ${paletteKey} not defined for token ${tokenId} — skipping`);
      continue;
    }
    if (specialPlan) {
      const expected = specialPlan[n].expectedPalette;
      if (paletteKey !== expected) {
        console.warn(
          `  [WARN] token ${tokenId}: expected palette ${expected}, got ${paletteKey}`,
        );
      }
    }
    paletteCounts[paletteKey] = (paletteCounts[paletteKey] || 0) + 1;
    if (isGoldToken(tokenId)) goldCount += 1;
    if (getLegendaryForToken(tokenId)) legendaryCount += 1;

    let picks;
    let renderPicks;
    const loadBuffers = shouldLoadTraitBuffers(tokenId, allowLegendaryPlaceholder);
    if (dedupeGuard) {
      const resolved = resolveUniqueTokenTraits(tokenId, traits, dedupeGuard, {
        character,
        paletteKey,
        loadBuffers,
        comboCapGuard,
      });
      picks = resolved.picks;
      renderPicks = resolved.renderPicks;
    } else {
      picks = pickTokenVariants(tokenId, traits, new Set(), character, loadBuffers);
      ({ renderPicks } = finalizeTokenTraits(tokenId, picks, traits, character));
    }

    const { driftMap } = buildPhase3Effects(tokenId, picks, null, character);
    const { buf, legendaryFinal, sourcePath, legendaryPlaceholder } = resolveGalleryPixelBuffer(
      tokenId,
      traits,
      renderPicks,
      driftMap,
      paletteKey,
      allowLegendaryPlaceholder,
    );
    if (legendaryPlaceholder) {
      legendaryPlaceholderCount += 1;
      console.warn(`  [legendary-placeholder] #${tokenId} — composite fallback (no legendary-finals/ PNG)`);
    } else if (legendaryFinal) {
      console.log(`  [legendary-final] #${tokenId} ← ${sourcePath}`);
    }
    pixelCounts.push(countNonZeroPixels(buf));
    const pngBuf = renderPNG(buf, palette);
    const missing = collectMissingFiles(renderPicks);
    const legendary = getLegendaryForToken(tokenId);
    const tileMeta = {
      legendary,
      palette: paletteKey,
      missing,
      head: renderPicks.head?.variant?.name || null,
      characterKey: charKey,
    };
    const visualClass = classifyGalleryTile(buf, tileMeta, pngBuf);
    tileLog.push({
      tileIndex: n,
      col,
      row,
      tokenId,
      palette: paletteKey,
      characterKey: charKey,
      legendary,
      gold: isGoldToken(tokenId),
      missing,
      head: tileMeta.head,
      visualClass,
    });

    if (!skipPerTokenWrites) {
      const baseName = String(tokenId).padStart(4, "0");
      fs.writeFileSync(path.join(tokensDir, `${baseName}.png`), pngBuf);
      fs.writeFileSync(path.join(tokensDir, `${baseName}_1024.png`), upscalePNG(pngBuf, 16));
      fs.writeFileSync(path.join(tokensDir, `${baseName}.svg`), renderSVG(buf, palette));
      fs.writeFileSync(
        path.join(tokensDir, `${baseName}.json`),
        JSON.stringify(buildMetadata(tokenId, paletteKey, picks, character), null, 2),
      );
      updateMaster(tokenId, paletteKey, picks, character);
    }

    if (writeTraitJson) {
      traitRows.push(buildGalleryTraitRow(tokenId, character, paletteKey, picks, slotOrder));
    }

    const tilePng = PNG.sync.read(pngBuf);
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const sx = Math.floor(x / tileScale);
        const sy = Math.floor(y / tileScale);
        const so = (sy * GRID + sx) * 4;
        const dx = ox + x;
        const dy = oy + y;
        const doff = (dy * W + dx) * 4;
        gallery.data[doff] = tilePng.data[so];
        gallery.data[doff + 1] = tilePng.data[so + 1];
        gallery.data[doff + 2] = tilePng.data[so + 2];
        gallery.data[doff + 3] = 255;
      }
    }
    process.stdout.write(`\r  rendered ${n + 1}/${count}`);
  }
  process.stdout.write("\n");

  const outName = specialTokens
    ? "gallery_special_tokens.png"
    : fromMintData
      ? `gallery_${count}_mint_data.png`
      : galleryPngName(count, start, paletteOverride, characterOverride, genderOverride, characterSpecs);
  fs.writeFileSync(path.join(SETTINGS.outputDir, outName), PNG.sync.write(gallery));
  console.log(`wrote ${outName}`);
  if (writeTraitJson) {
    const jsonName = fromMintData
      ? `gallery_${count}_mint_data_traits.json`
      : galleryTraitsJsonName(count, start, paletteOverride, characterOverride, genderOverride, characterSpecs);
    fs.writeFileSync(
      path.join(SETTINGS.outputDir, jsonName),
      JSON.stringify(traitRows, null, 2)
    );
    console.log(`wrote ${jsonName} (${traitRows.length} tokens)`);
  }
  if (!skipPerTokenWrites) {
    console.log(`wrote ${count} per-token file sets to tokens/`);
    console.log(`updated master.json + master.csv`);
  }
  if (!paletteOverride) {
    console.log(`palette distribution:    ${Object.entries(paletteCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  console.log(`character distribution:  ${Object.entries(characterCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (characterPlan) {
    const planned = summarizeCharacterPlan(characterPlan);
    const mismatches = Object.keys({ ...planned, ...characterCounts }).filter(
      (key) => (planned[key] || 0) !== (characterCounts[key] || 0),
    );
    if (mismatches.length > 0) {
      console.warn(`  [WARN] character plan/render mismatch: ${mismatches.join(", ")}`);
    }
  }
  printGalleryPixelStats(pixelCounts);
  if (!fromMintData) {
    console.log(`anti-none-stack fires:   ${getAntiNoneStackFireTotal()}`);
    console.log(`dedupe-reroll fires:     ${getDedupeRerollFireTotal()}`);
    const dedupeLog = getDedupeRerollLog();
    if (dedupeLog.length > 0) {
      console.log(`dedupe-reroll log (${dedupeLog.length} entries):`);
      for (const entry of dedupeLog) {
        console.log(
          `  #${entry.tokenId} vs #${entry.partnerId} → ${entry.slot}${entry.variant ? `=${entry.variant}` : ""} (:dedupe:${entry.attempt}, attempt ${entry.attempt}/5)`,
        );
      }
    }
    console.log(`combo-cap-reroll fires:  ${getComboCapRerollFireTotal()}`);
    const capLog = getComboCapRerollLog();
    if (capLog.length > 0) {
      console.log(`combo-cap-reroll log (${capLog.length} entries):`);
      for (const entry of capLog) {
        console.log(
          `  #${entry.tokenId} "${entry.originalCombo}" → ${entry.slot}=${entry.variant} (:comboCap:${entry.attempt}, attempt ${entry.attempt}/5)`,
        );
      }
    }
  }
  printGalleryTileReport(tileLog);
  if (fromMintData) {
    console.log(`GOLD tokens:             ${goldCount}`);
    console.log(`Normie Legendary tokens: ${legendaryCount}`);
  }
  if (legendaryPlaceholderCount > 0) {
    console.warn(
      `\n  [legendary-placeholder] ${legendaryPlaceholderCount} tile(s) used composite fallback — NOT mint-safe output`,
    );
  }
  if (specialPlan) {
    console.log("special token lineup:");
    for (const entry of specialPlan) {
      console.log(`  #${entry.tokenId} ${entry.expectedPalette} (${entry.tier})`);
    }
  }
}

if (require.main === module) main();

module.exports = {
  parseCharacterCombo,
  parseCharactersFlag,
  parseCharacterCountsFlag,
  buildCharacterAssignments,
  buildCharacterAssignmentsFromCounts,
  buildMixedCharacterPlan,
  summarizeCharacterPlan,
  loadMintDataRecords,
  buildSpecialTokenPlan,
  countNonZeroPixels,
  printGalleryPixelStats,
  classifyGalleryTile,
  analyzeRenderedRgb,
  collectMissingFiles,
  printGalleryTileReport,
};
