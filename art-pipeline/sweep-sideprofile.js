// ============================================================================
// sweep-sideprofile.js
// SideProfile gender × SP hair × base palette contact sheet (quick-test render path).
// Writes output/quick/sideprofile-sweep.png — no master ledger updates.
//
// USAGE:
//   node sweep-sideprofile.js
//   node sweep-sideprofile.js --gender Male --hair SP_Mohawk,SP_Afro --palette SIGNAL
//   node sweep-sideprofile.js --mtier OffKilter
//   node sweep-sideprofile.js --dry-run
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const {
  pickTokenVariants,
  applyCoverageRules,
  compositeChromie,
  renderPNG,
  extractToBuffer,
  buildPhase3Effects,
  getMutationTier,
} = require("./generate");
const { overlayStrayPixels } = require("./phase3-variance");

const FIXED_TOKEN_ID = 1;
const CHARACTER_NAME = "SideProfile";
const QUICK_DIR = path.join(SETTINGS.outputDir, "quick");
const OUT_FILE = path.join(QUICK_DIR, "sideprofile-sweep.png");

const GRID = SETTINGS.grid;
const TILE_SCALE = 4;
const TILE_SIZE = GRID * TILE_SCALE;
const PADDING = 8;
const LABEL_HEIGHT = 22;
const GALLERY_BG = [0xf5, 0xf5, 0xf5];
const LABEL_COLOR = [0x22, 0x22, 0x22];

const DEFAULT_GENDERS = ["Male", "Female"];
const DEFAULT_PALETTES = ["SIGNAL", "ACID", "CYAN", "GHOST", "BLOOD", "MOSS"];

/** Keep non-swept slots on assets that exist — token #1 can roll missing SP beard/glasses. */
const FIXED_SLOT_OVERRIDES = {
  Male: {
    shirt: "Crew",
    hood: "None",
    beard: "None",
    mustache: "None",
    glasses: "None",
    necklace: "None",
    earrings: "None",
    tattoo: "None",
  },
  Female: {
    shirt: "SP_Crew_Female",
    hood: "None",
    beard: "None",
    mustache: "None",
    glasses: "None",
    necklace: "None",
    earrings: "None",
    tattoo: "None",
  },
};

const FONT_5X7 = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01110", "10001", "10000", "01110", "00001", "10001", "01110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10001", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    help: false,
    dryRun: false,
    genders: [...DEFAULT_GENDERS],
    hairs: null,
    palettes: [...DEFAULT_PALETTES],
    mtier: "Pristine",
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") result.help = true;
    else if (a === "--dry-run") result.dryRun = true;
    else if (a === "--gender") result.genders = splitList(args[++i]);
    else if (a === "--hair") result.hairs = splitList(args[++i]);
    else if (a === "--palette") result.palettes = splitList(args[++i]).map((p) => p.toUpperCase());
    else if (a === "--mtier") result.mtier = args[++i];
    else {
      console.error(`Unknown argument: ${a}`);
      result.help = true;
    }
  }

  return result;
}

function splitList(raw) {
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function printHelp() {
  console.log(`SideProfile sweep contact sheet (token seed #${FIXED_TOKEN_ID})

Axes:
  --gender <Male,Female>     Default: Male,Female
  --hair <variant,...>       Default: SP_HAIR_* files present in components/
  --palette <SIGNAL,...>     Default: SIGNAL,ACID,CYAN,GHOST,BLOOD,MOSS
  --mtier <name>             Mutation tier override (default: Pristine)

Options:
  --dry-run                  Print combo plan only
  --help                     Show this help`);
}


function resolveCharacter(gender) {
  const found = (CHARACTERS || []).find(
    (c) =>
      c.name === CHARACTER_NAME &&
      c.gender &&
      c.gender.toLowerCase() === gender.toLowerCase(),
  );
  if (!found) {
    throw new Error(`Character ${CHARACTER_NAME} (${gender}) not found in chromies-config.js`);
  }
  return found;
}

function discoverHairVariants(traits, genderFilter) {
  const files = fs
    .readdirSync(SETTINGS.componentsDir)
    .filter((name) => /^SP_HAIR_.*\.png$/i.test(name));

  const byFile = new Map(
    traits.slots.hair.variants.map((variant) => [variant.file, variant.name]),
  );

  const discovered = [];
  const unknownFiles = [];

  for (const file of files.sort()) {
    const variantName = byFile.get(file);
    if (!variantName) {
      unknownFiles.push(file);
      continue;
    }
    discovered.push(variantName);
  }

  if (unknownFiles.length > 0) {
    console.warn(`  [WARN] SP_HAIR files without traits.json mapping: ${unknownFiles.join(", ")}`);
  }

  const gendered = discovered.filter((name) => {
    const isFemaleHair = name.endsWith("_Female");
    return genderFilter === "Female" ? isFemaleHair : !isFemaleHair;
  });

  return gendered.sort();
}

function cartesianProduct(lists) {
  return lists.reduce(
    (acc, list) => acc.flatMap((prefix) => list.map((value) => [...prefix, value])),
    [[]],
  );
}

function buildCombos(genders, hairByGender, palettes, hairFilter) {
  const combos = [];

  for (const gender of genders) {
    let hairs = hairByGender[gender] || [];
    if (hairFilter) {
      hairs = hairs.filter((hair) => hairFilter.includes(hair));
    }
    for (const hair of hairs) {
      for (const palette of palettes) {
        combos.push({ gender, hair, palette });
      }
    }
  }

  return combos;
}

function comboLabel(combo) {
  return `${combo.gender}_${combo.hair}_${combo.palette}`;
}

function applySlotOverride(picks, traits, slot, variantName) {
  const slotDef = traits.slots[slot];
  if (!slotDef) return;
  const found = slotDef.variants.find((v) => v.name === variantName);
  if (found) {
    picks[slot] = { variant: found, file: found.file, buffer: null };
  }
}

function loadPickBuffersCached(picks, traits, bufferCache) {
  for (const [slot, pick] of Object.entries(picks)) {
    const filePath = path.join(SETTINGS.componentsDir, pick.file);
    if (!bufferCache.has(filePath)) {
      bufferCache.set(filePath, extractToBuffer(filePath, traits.slots[slot].drawColors));
    }
    pick.buffer = bufferCache.get(filePath);
  }
}

function collectMissingFiles(picks) {
  return Object.entries(picks)
    .filter(([, pick]) => !pick.buffer)
    .map(([slot, pick]) => ({ slot, file: pick.file, variant: pick.variant.name }));
}

function buildRenderPicks({ traits, character, gender, hair, bufferCache }) {
  const picks = pickTokenVariants(FIXED_TOKEN_ID, traits, new Set(), character, false);
  const fixed = FIXED_SLOT_OVERRIDES[gender] || {};
  for (const [slot, variantName] of Object.entries(fixed)) {
    applySlotOverride(picks, traits, slot, variantName);
  }
  applySlotOverride(picks, traits, "hair", hair);
  loadPickBuffersCached(picks, traits, bufferCache);
  return applyCoverageRules(picks, traits, character);
}

function validateComboFiles(ctx, combo) {
  const renderPicks = buildRenderPicks({
    traits: ctx.traits,
    character: ctx.characterByGender[combo.gender],
    gender: combo.gender,
    hair: combo.hair,
    bufferCache: ctx.bufferCache,
  });
  return collectMissingFiles(renderPicks);
}

function renderCombo(ctx, combo) {
  const character = ctx.characterByGender[combo.gender];
  const palette = PALETTES[combo.palette];
  const renderPicks = buildRenderPicks({
    traits: ctx.traits,
    character,
    gender: combo.gender,
    hair: combo.hair,
    bufferCache: ctx.bufferCache,
  });

  const picks = pickTokenVariants(FIXED_TOKEN_ID, ctx.traits, new Set(), character, false);
  for (const [slot, variantName] of Object.entries(FIXED_SLOT_OVERRIDES[combo.gender] || {})) {
    applySlotOverride(picks, ctx.traits, slot, variantName);
  }
  applySlotOverride(picks, ctx.traits, "hair", combo.hair);
  loadPickBuffersCached(picks, ctx.traits, ctx.bufferCache);

  const mTier = getMutationTier(FIXED_TOKEN_ID, ctx.mtier);
  const { driftMap, strays } = buildPhase3Effects(
    FIXED_TOKEN_ID,
    picks,
    compositeChromie(renderPicks, ctx.traits, 0, null, null),
    null,
    character,
  );

  let buf = compositeChromie(renderPicks, ctx.traits, FIXED_TOKEN_ID, driftMap, mTier);
  buf = overlayStrayPixels(buf, strays);
  return renderPNG(buf, palette);
}

function gridDims(n) {
  const cols = Math.ceil(Math.sqrt(n * 4 / 3));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

function setPixel(png, x, y, rgb) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const off = (y * png.width + x) * 4;
  png.data[off] = rgb[0];
  png.data[off + 1] = rgb[1];
  png.data[off + 2] = rgb[2];
  png.data[off + 3] = 255;
}

function drawGlyph(png, x, y, ch, scale, rgb) {
  const glyph = FONT_5X7[ch] || FONT_5X7[" "];
  for (let row = 0; row < glyph.length; row++) {
    for (let col = 0; col < glyph[row].length; col++) {
      if (glyph[row][col] !== "1") continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          setPixel(png, x + col * scale + dx, y + row * scale + dy, rgb);
        }
      }
    }
  }
}

function drawLabel(png, x, y, text, scale = 1) {
  const upper = String(text).toUpperCase();
  let cursor = x;
  for (const ch of upper) {
    drawGlyph(png, cursor, y, ch in FONT_5X7 ? ch : " ", scale, LABEL_COLOR);
    cursor += (FONT_5X7["0"][0].length + 1) * scale;
  }
}

function blitTile(gallery, pngBuf, col, row, cols, label) {
  const cellW = TILE_SIZE + PADDING;
  const cellH = TILE_SIZE + PADDING + LABEL_HEIGHT;
  const ox = PADDING + col * cellW;
  const oy = PADDING + row * cellH;

  const tilePng = PNG.sync.read(pngBuf);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const sx = Math.floor(x / TILE_SCALE);
      const sy = Math.floor(y / TILE_SCALE);
      const so = (sy * GRID + sx) * 4;
      const dx = ox + x;
      const dy = oy + y;
      const doff = (dy * gallery.width + dx) * 4;
      gallery.data[doff] = tilePng.data[so];
      gallery.data[doff + 1] = tilePng.data[so + 1];
      gallery.data[doff + 2] = tilePng.data[so + 2];
      gallery.data[doff + 3] = 255;
    }
  }

  drawLabel(gallery, ox + 2, oy + TILE_SIZE + 4, label, 1);
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function main() {
  const opts = parseArgs();
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));

  for (const paletteKey of opts.palettes) {
    const palette = PALETTES[paletteKey];
    if (!palette || !palette.colors) {
      console.error(`palette ${paletteKey} not defined or missing colors`);
      process.exit(1);
    }
  }

  const hairByGender = {};
  for (const gender of opts.genders) {
    resolveCharacter(gender);
    hairByGender[gender] = discoverHairVariants(traits, gender);
  }

  const plannedCombos = buildCombos(opts.genders, hairByGender, opts.palettes, opts.hairs);
  const attempted = plannedCombos.length;

  console.log(`SideProfile sweep | token #${FIXED_TOKEN_ID} | mtier=${opts.mtier} | output/quick/sideprofile-sweep.png`);
  for (const gender of opts.genders) {
    console.log(`  ${gender} hair files: ${(hairByGender[gender] || []).join(", ") || "(none)"}`);
  }
  console.log(`  palettes: ${opts.palettes.join(", ")}`);
  console.log(`  planned combos: ${attempted}`);

  if (attempted === 0) {
    console.error("\nNo combos to render — check --gender/--hair/--palette filters.");
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log("\nDry run — combos:");
    for (const combo of plannedCombos) {
      console.log(`  ${comboLabel(combo)}`);
    }
    process.exit(0);
  }

  if (!fs.existsSync(QUICK_DIR)) fs.mkdirSync(QUICK_DIR, { recursive: true });

  const characterByGender = Object.fromEntries(
    opts.genders.map((gender) => [gender, resolveCharacter(gender)]),
  );
  const bufferCache = new Map();
  const ctx = { traits, characterByGender, bufferCache, mtier: opts.mtier };

  const skipped = [];
  const rendered = [];

  for (const combo of plannedCombos) {
    const missing = validateComboFiles(ctx, combo);
    if (missing.length > 0) {
      skipped.push({
        combo,
        reason: "missing files",
        missing,
      });
      continue;
    }

    const pngBuf = renderCombo(ctx, combo);
    rendered.push({ combo, pngBuf });
    process.stdout.write(`\r  rendered ${rendered.length}/${attempted - skipped.length} eligible`);
  }
  process.stdout.write("\n");

  if (rendered.length === 0) {
    console.error("\nNo combos rendered — all planned combos were skipped.");
  } else {
    const { cols, rows } = gridDims(rendered.length);
    const cellW = TILE_SIZE + PADDING;
    const cellH = TILE_SIZE + PADDING + LABEL_HEIGHT;
    const W = cols * cellW + PADDING;
    const H = rows * cellH + PADDING;

    const gallery = new PNG({ width: W, height: H });
    for (let i = 0; i < W * H; i++) {
      gallery.data[i * 4] = GALLERY_BG[0];
      gallery.data[i * 4 + 1] = GALLERY_BG[1];
      gallery.data[i * 4 + 2] = GALLERY_BG[2];
      gallery.data[i * 4 + 3] = 255;
    }

    rendered.forEach((entry, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      blitTile(gallery, entry.pngBuf, col, row, cols, comboLabel(entry.combo));
    });

    fs.writeFileSync(OUT_FILE, PNG.sync.write(gallery));
    console.log(`\nWrote ${path.relative(process.cwd(), OUT_FILE)} (${cols}x${rows} grid, ${rendered.length} cells)`);
  }

  console.log("\nSummary");
  console.log(`  attempted: ${attempted}`);
  console.log(`  rendered:  ${rendered.length}`);
  console.log(`  skipped:   ${skipped.length}`);

  if (skipped.length > 0) {
    console.log("\nSkipped combos:");
    for (const entry of skipped) {
      const label = comboLabel(entry.combo);
      const details = entry.missing.map((m) => `${m.slot}:${m.file}`).join(", ");
      console.log(`  ${label} — ${entry.reason} (${details})`);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) main();
