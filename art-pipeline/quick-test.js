// ============================================================================
// quick-test.js
// Fast outfit/character combo previews — fixed token seed, override flags only.
// Writes to output/quick/ (no master.json/csv side effects).
//
// USAGE:
//   node quick-test.js --gender Male --shirt Crew --hood None --hair Mohawk --glasses Shades --palette SIGNAL
//   node quick-test.js --character SideProfile --gender Female --shirt SP_Crew_Female --hair SP_Afro_Female --glasses SP_Shades
//   node quick-test.js --palette ACID --mtier Pristine --tier None
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const {
  pickCharacter,
  resolveCharacter,
  pickTokenVariants,
  loadPickBuffers,
  applyCoverageRules,
  pickPalette,
  compositeChromie,
  renderPNG,
  upscalePNG,
  buildPhase3Effects,
  getMutationTier,
} = require("./generate");
const { overlayStrayPixels } = require("./phase3-variance");

const FIXED_TOKEN_ID = 1;
const QUICK_DIR = path.join(SETTINGS.outputDir, "quick");

/** Per-slot CLI overrides applied after token seed picks. */
const SLOT_OVERRIDE_FLAGS = [
  "hair",
  "hood",
  "shirt",
  "body",
  "head",
  "neck",
  "eyes",
  "glasses",
  "beard",
  "mustache",
  "tattoo",
  "bodytattoo",
  "necklace",
  "earrings",
  "expression",
  "mask",
];

function emptySlotOverrides() {
  return Object.fromEntries(SLOT_OVERRIDE_FLAGS.map((slot) => [slot, null]));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    palette: null,
    tier: null,
    mtier: null,
    skip: new Set(),
    character: null,
    gender: null,
    ...emptySlotOverrides(),
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      result.help = true;
    } else if (a === "--palette" || a === "-p") result.palette = args[++i].toUpperCase();
    else if (a === "--tier") result.tier = args[++i];
    else if (a === "--mtier") result.mtier = args[++i];
    else if (a === "--character") result.character = args[++i];
    else if (a === "--gender") result.gender = args[++i];
    else if (SLOT_OVERRIDE_FLAGS.includes(a.slice(2))) result[a.slice(2)] = args[++i];
    else if (a === "--skip") args[++i].split(",").forEach((s) => result.skip.add(s.trim().toLowerCase()));
    else if (a.startsWith("--skip=")) a.slice(7).split(",").forEach((s) => result.skip.add(s.trim().toLowerCase()));
    else {
      console.error(`Unknown argument: ${a}`);
      result.help = true;
    }
  }

  return result;
}

function printHelp() {
  console.log(`Quick Chromie combo preview (token seed #${FIXED_TOKEN_ID}, writes to output/quick/)

Flags:
  --character <name>   Character type (e.g. HeroA, SideProfile, Alien)
  --gender <Male|Female>
  --palette, -p <name> Palette family (SIGNAL, ACID, ...)
  --mtier <name>       Mutation tier override
  --tier <name>        Drift tier override
  --skip <slots>       Comma-separated slots to skip

Slot overrides (variant name from traits.json):
  --hair <variant>
  --hood <variant>
  --shirt <variant>
  --body <variant>
  --head <variant>
  --neck <variant>
  --eyes <variant>
  --glasses <variant>     e.g. Shades, Neo, VR, None, SP_Shades, SP_Neo
  --beard <variant>
  --mustache <variant>
  --tattoo <variant>
  --bodytattoo <variant>
  --necklace <variant>
  --earrings <variant>
  --mask <variant>

Examples:
  node quick-test.js --gender Male --shirt Crew --hood None --hair Mohawk --glasses Shades --palette SIGNAL
  node quick-test.js --character SideProfile --gender Female --shirt SP_Crew_Female --hair SP_Afro_Female --glasses None`);
}

function applySlotOverrides(picks, traits, opts) {
  for (const slot of SLOT_OVERRIDE_FLAGS) {
    applySlotOverride(picks, traits, slot, opts[slot]);
  }
}

function slugPart(value) {
  if (value == null || value === "") return "none";
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function buildOutputName(character, paletteKey, picks) {
  const characterName = character?.name ?? "unknown";
  const gender = character?.gender ?? "any";
  const shirt = picks.shirt?.variant?.name ?? "none";
  const hair = picks.hair?.variant?.name ?? "none";
  return `quick_${slugPart(characterName)}_${slugPart(gender)}_${slugPart(shirt)}_${slugPart(hair)}_${slugPart(paletteKey)}.png`;
}

function applySlotOverride(picks, traits, slot, variantName) {
  if (!variantName) return;
  const slotDef = traits.slots[slot];
  if (!slotDef) {
    console.warn(`  [WARN] slot "${slot}" not found in traits.json`);
    return;
  }
  const found = slotDef.variants.find((v) => v.name === variantName);
  if (found) {
    picks[slot] = { variant: found, file: found.file, buffer: null };
  } else {
    console.warn(`  [WARN] ${slot} variant "${variantName}" not found`);
  }
}

function collectMissingFiles(picks) {
  return Object.entries(picks)
    .filter(([, pick]) => !pick.buffer)
    .map(([slot, pick]) => ({ slot, file: pick.file, variant: pick.variant.name }));
}

function main() {
  const opts = parseArgs();
  if (opts.help) {
    printHelp();
    process.exit(opts.help && process.argv.length <= 3 ? 0 : 1);
  }

  const tokenId = FIXED_TOKEN_ID;
  const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
  const character = resolveCharacter(tokenId, opts.character, opts.gender);

  const paletteKey = opts.palette || pickPalette(tokenId, traits, character);
  const palette = PALETTES[paletteKey];
  if (!palette || !palette.colors) {
    console.error(`palette ${paletteKey} not defined or missing colors`);
    process.exit(1);
  }

  const charLabel = character
    ? `${character.name}${character.gender ? ` (${character.gender})` : ""}`
    : "rolled";
  console.log(`Quick preview #${tokenId} | palette: ${paletteKey} | character: ${charLabel}`);
  if (opts.skip.size > 0) console.log(`  skip: ${[...opts.skip].join(", ")}`);
  const activeOverrides = SLOT_OVERRIDE_FLAGS.filter((slot) => opts[slot]).map(
    (slot) => `${slot}=${opts[slot]}`,
  );
  if (activeOverrides.length > 0) console.log(`  overrides: ${activeOverrides.join(", ")}`);

  const picks = pickTokenVariants(tokenId, traits, opts.skip, character, false);
  applySlotOverrides(picks, traits, opts);

  loadPickBuffers(picks, traits, character);
  const renderPicks = applyCoverageRules(picks, traits, character);
  const mTier = getMutationTier(tokenId, opts.mtier);
  const { tier, driftMap, strays } = buildPhase3Effects(
    tokenId,
    picks,
    compositeChromie(renderPicks, traits, 0, null, null),
    opts.tier,
    character,
  );

  const missing = collectMissingFiles(renderPicks);
  if (missing.length > 0) {
    console.log("\n  [MISSING FILE]");
    for (const item of missing) {
      console.log(`    ${item.slot.padEnd(10)} → ${item.variant} (${item.file})`);
    }
  }

  const t0 = performance.now();
  let buf = compositeChromie(renderPicks, traits, tokenId, driftMap, mTier);
  buf = overlayStrayPixels(buf, strays);
  const pngBuf = renderPNG(buf, palette, {
    transparentIndex0: character?.name === "Zombie",
  });
  const renderMs = performance.now() - t0;

  if (!fs.existsSync(QUICK_DIR)) fs.mkdirSync(QUICK_DIR, { recursive: true });

  const outName = buildOutputName(character, paletteKey, picks);
  const outPath = path.join(QUICK_DIR, outName);
  const outPath1024 = path.join(QUICK_DIR, outName.replace(/\.png$/, "_1024.png"));

  fs.writeFileSync(outPath, pngBuf);
  fs.writeFileSync(outPath1024, upscalePNG(pngBuf, 16));

  console.log(`\n  drift:    ${tier.name}`);
  console.log(`  mutation: ${mTier.name}`);
  console.log(`  render:   ${renderMs.toFixed(1)} ms`);
  console.log(`  wrote:    quick/${outName}`);
  console.log(`  wrote:    quick/${path.basename(outPath1024)}`);

  if (missing.length > 0) {
    console.log(`\n  ⚠ ${missing.length} missing component file(s) — preview may be incomplete`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
