// ============================================================================
// gallery.js
// Generate N Chromies with per-token palette + drift + mutation + coverage rules.
// Writes per-token files AND a grid PNG. Updates master ledger.
// ============================================================================
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const {
  resolveCharacter,
  pickTokenVariants,
  applyCoverageRules,
  pickPalette,
  compositeChromie,
  renderPNG,
  renderSVG,
  upscalePNG,
  buildMetadata,
  updateMaster,
  buildPhase3Effects,
  getMutationTier,
} = require("./generate");
const { overlayStrayPixels } = require("./phase3-variance");
const { characterKey } = require("./on-chain-character-bytes");

const GRID = SETTINGS.grid;
const TILE_SCALE = 4;
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
    const colonIdx = trimmed.lastIndexOf(":");
    if (colonIdx <= 0) {
      throw new Error(`invalid --character-counts entry "${trimmed}" (expected "Name:count")`);
    }
    const label = trimmed.slice(0, colonIdx).trim();
    const count = parseInt(trimmed.slice(colonIdx + 1), 10);
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

function summarizeCharacterPlan(slots) {
  const counts = {};
  for (const character of slots) {
    const key = characterKey(character);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { count: 24, start: 1, palette: null, tier: null, mtier: null, character: null, gender: null, characters: null, characterCounts: null, json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--count") result.count = parseInt(args[++i], 10);
    else if (a === "--start") result.start = parseInt(args[++i], 10);
    else if (a === "--palette") result.palette = args[++i].toUpperCase();
    else if (a === "--tier")   result.tier   = args[++i];
    else if (a === "--mtier")  result.mtier  = args[++i];
    else if (a === "--character") result.character = args[++i];
    else if (a === "--gender") result.gender = args[++i];
    else if (a === "--characters") result.characters = args[++i];
    else if (a === "--character-counts") result.characterCounts = args[++i];
    else if (a === "--json") result.json = true;
  }
  return result;
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

function buildGalleryTraitRow(tokenId, character, paletteKey, picks, mTier, slotOrder) {
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
  row.mtier = mTier ? mTier.name : null;
  return row;
}

function gridDims(n) {
  const cols = Math.ceil(Math.sqrt(n * 4 / 3));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

function main() {
  let { count, start, palette: paletteOverride, tier: tierOverride, mtier: mtierOverride, character: characterOverride, gender: genderOverride, characters: charactersFlag, characterCounts: characterCountsFlag, json: writeJson } = parseArgs();
  const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
  const slotOrder = Object.keys(traits.slots);

  let characterSpecs = null;
  let characterPlan = null;
  let characterCountEntries = null;

  if (characterCountsFlag) {
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
      characterPlan = buildCharacterAssignmentsFromCounts(start, characterCountEntries);
      count = derivedCount;
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

  const { cols, rows } = gridDims(count);
  const tileSize = GRID * TILE_SCALE;
  const W = cols * (tileSize + PADDING) + PADDING;
  const H = rows * (tileSize + PADDING) + PADDING;

  const palLabel = paletteOverride ? `palette FORCED to ${paletteOverride}` : "palettes per-token";
  const tierLabel = tierOverride ? `, drift FORCED to ${tierOverride}` : "";
  const mtierLabel = mtierOverride ? `, mutation FORCED to ${mtierOverride}` : "";
  const genderLabel = characterPlan ? "" : (genderOverride ? `, gender FORCED to ${genderOverride}` : "");
  const charLabel = characterPlan
    ? `, characters MIX [${characterSpecs.map((s) => (s.gender ? `${s.name} (${s.gender})` : s.name)).join(", ")}]`
    : (characterOverride ? `, character FORCED to ${characterOverride}` : "");
  const jsonLabel = writeJson || characterPlan ? ", traits JSON ON" : "";
  console.log(`Gallery: ${count} tokens, ${cols}x${rows} grid, ${palLabel}${tierLabel}${mtierLabel}${charLabel}${genderLabel}${jsonLabel}`);

  const tokensDir = path.join(SETTINGS.outputDir, "tokens");
  if (!fs.existsSync(tokensDir)) fs.mkdirSync(tokensDir, { recursive: true });

  const gallery = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    gallery.data[i * 4] = GALLERY_BG[0];
    gallery.data[i * 4 + 1] = GALLERY_BG[1];
    gallery.data[i * 4 + 2] = GALLERY_BG[2];
    gallery.data[i * 4 + 3] = 255;
  }

  const paletteCounts = {};
  const tierCounts = {};
  const mTierCounts = {};
  const characterCounts = {};
  const writeTraitJson = writeJson || Boolean(characterPlan);

  const traitRows = [];

  for (let n = 0; n < count; n++) {
    const tokenId = start + n;
    const col = n % cols;
    const row = Math.floor(n / cols);
    const ox = PADDING + col * (tileSize + PADDING);
    const oy = PADDING + row * (tileSize + PADDING);

    let character = characterPlan
      ? characterPlan[n]
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
    paletteCounts[paletteKey] = (paletteCounts[paletteKey] || 0) + 1;

    const picks = pickTokenVariants(tokenId, traits, new Set(), character);
    const renderPicks = applyCoverageRules(picks, traits, character);

    const mTier = getMutationTier(tokenId, mtierOverride);
    mTierCounts[mTier.name] = (mTierCounts[mTier.name] || 0) + 1;

    const baseBuf = compositeChromie(renderPicks, traits, 0, null, null);
    const { tier, driftMap, strays } = buildPhase3Effects(tokenId, picks, baseBuf, tierOverride, character);
    tierCounts[tier.name] = (tierCounts[tier.name] || 0) + 1;

    let buf = compositeChromie(renderPicks, traits, tokenId, driftMap, mTier);
    buf = overlayStrayPixels(buf, strays);
    const pngBuf = renderPNG(buf, palette);

    const baseName = String(tokenId).padStart(4, "0");
    fs.writeFileSync(path.join(tokensDir, `${baseName}.png`), pngBuf);
    fs.writeFileSync(path.join(tokensDir, `${baseName}_1024.png`), upscalePNG(pngBuf, 16));
    fs.writeFileSync(path.join(tokensDir, `${baseName}.svg`), renderSVG(buf, palette));
    fs.writeFileSync(path.join(tokensDir, `${baseName}.json`), JSON.stringify(buildMetadata(tokenId, paletteKey, picks, tier, mTier, character), null, 2));

    updateMaster(tokenId, paletteKey, picks, tier, mTier, character);

    if (writeTraitJson) {
      traitRows.push(buildGalleryTraitRow(tokenId, character, paletteKey, picks, mTier, slotOrder));
    }

    const tilePng = PNG.sync.read(pngBuf);
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const sx = Math.floor(x / TILE_SCALE);
        const sy = Math.floor(y / TILE_SCALE);
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

  const outName = galleryPngName(count, start, paletteOverride, characterOverride, genderOverride, characterSpecs);
  fs.writeFileSync(path.join(SETTINGS.outputDir, outName), PNG.sync.write(gallery));
  console.log(`wrote ${outName}`);
  if (writeTraitJson) {
    const jsonName = galleryTraitsJsonName(count, start, paletteOverride, characterOverride, genderOverride, characterSpecs);
    fs.writeFileSync(
      path.join(SETTINGS.outputDir, jsonName),
      JSON.stringify(traitRows, null, 2)
    );
    console.log(`wrote ${jsonName} (${traitRows.length} tokens)`);
  }
  console.log(`wrote ${count} per-token file sets to tokens/`);
  console.log(`updated master.json + master.csv`);
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
  console.log(`drift distribution:      ${Object.entries(tierCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`mutation distribution:   ${Object.entries(mTierCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
}

if (require.main === module) main();

module.exports = {
  parseCharacterCombo,
  parseCharactersFlag,
  parseCharacterCountsFlag,
  buildCharacterAssignments,
  buildCharacterAssignmentsFromCounts,
  summarizeCharacterPlan,
};
