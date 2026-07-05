// ============================================================================
// sweep-crew.js
// Sweep Male HeroA + Crew shirt across hood/hair/glasses/beard/mustache combos.
// Writes 64x64 PNGs to output/sweep/ (no master ledger updates).
//
// USAGE:
//   node sweep-crew.js              # estimate, auto-run if under ~3 min
//   node sweep-crew.js --yes        # skip confirmation when estimate is high
//   node sweep-crew.js --dry-run    # print combo count + estimate only
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const {
  pickTokenVariants,
  loadPickBuffers,
  applyCoverageRules,
  pickPalette,
  compositeChromie,
  renderPNG,
  extractToBuffer,
  buildPhase3Effects,
} = require("./generate");

const FIXED_TOKEN_ID = 1;
const SWEEP_DIR = path.join(SETTINGS.outputDir, "sweep");
const CONFIRM_THRESHOLD_MS = 3 * 60 * 1000;
const BENCHMARK_SAMPLES = 5;

const REQUESTED_VARIANTS = {
  hood: ["None", "Classic"],
  hair: ["Mohawk", "Pompadour", "MrT", "Afro", "Dreads", "Surfer", "FadeRight", "Buns", "AZVet", "None"],
  glasses: ["None", "Shades", "Neo", "VR", "PiratePatch", "3DGlasses", "DFrame", "DFrameFilled"],
  beard: ["None", "Full", "Goat"],
  mustache: ["None", "Thick"],
};

const FIXED = {
  character: "HeroA",
  gender: "Male",
  shirt: "Crew",
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    yes: args.includes("--yes"),
    dryRun: args.includes("--dry-run"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

function printHelp() {
  console.log(`Crew shirt accessory sweep (Male HeroA)

Options:
  --dry-run   Print combo count and time estimate only
  --yes       Run even if estimated time exceeds 3 minutes
  --help      Show this help`);
}

function slugPart(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function resolveCharacter() {
  const found = (CHARACTERS || []).find(
    (c) =>
      c.name === FIXED.character &&
      c.gender &&
      c.gender.toLowerCase() === FIXED.gender.toLowerCase(),
  );
  if (!found) {
    throw new Error(`Character ${FIXED.character} (${FIXED.gender}) not found in chromies-config.js`);
  }
  return found;
}

function resolveEligibleVariants(traits) {
  const resolved = {};
  for (const [slot, names] of Object.entries(REQUESTED_VARIANTS)) {
    const slotDef = traits.slots[slot];
    if (!slotDef) throw new Error(`traits.json missing slot: ${slot}`);

    const eligible = [];
    const missing = [];
    for (const name of names) {
      const variant = slotDef.variants.find((v) => v.name === name);
      if (variant) eligible.push(name);
      else missing.push(name);
    }
    if (missing.length > 0) {
      console.warn(`  [WARN] ${slot} variants not in traits.json (skipped): ${missing.join(", ")}`);
    }
    if (eligible.length === 0) {
      throw new Error(`No eligible ${slot} variants remain after validation`);
    }
    resolved[slot] = eligible;
  }
  return resolved;
}

function cartesianProduct(lists) {
  return lists.reduce(
    (acc, list) => acc.flatMap((prefix) => list.map((value) => [...prefix, value])),
    [[]],
  );
}

function buildCombos(variants) {
  const keys = ["hood", "hair", "glasses", "beard", "mustache"];
  const lists = keys.map((key) => variants[key]);
  return cartesianProduct(lists).map((values) => {
    const combo = {};
    keys.forEach((key, i) => {
      combo[key] = values[i];
    });
    return combo;
  });
}

function buildOutputName(combo) {
  return `sweep_${slugPart(combo.hood)}_${slugPart(combo.hair)}_${slugPart(combo.glasses)}_${slugPart(combo.beard)}_${slugPart(combo.mustache)}.png`;
}

function comboDescription(combo) {
  return `hood=${combo.hood} hair=${combo.hair} glasses=${combo.glasses} beard=${combo.beard} mustache=${combo.mustache}`;
}

function applySlotOverride(picks, traits, slot, variantName) {
  const slotDef = traits.slots[slot];
  const found = slotDef.variants.find((v) => v.name === variantName);
  picks[slot] = { variant: found, file: found.file, buffer: null };
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

function renderCombo({
  tokenId,
  traits,
  character,
  palette,
  combo,
  bufferCache,
}) {
  const picks = pickTokenVariants(tokenId, traits, new Set(), character, false);
  applySlotOverride(picks, traits, "shirt", FIXED.shirt);
  applySlotOverride(picks, traits, "hood", combo.hood);
  applySlotOverride(picks, traits, "hair", combo.hair);
  applySlotOverride(picks, traits, "glasses", combo.glasses);
  applySlotOverride(picks, traits, "beard", combo.beard);
  applySlotOverride(picks, traits, "mustache", combo.mustache);

  loadPickBuffersCached(picks, traits, bufferCache);
  const renderPicks = applyCoverageRules(picks, traits, character);
  const { driftMap } = buildPhase3Effects(tokenId, picks, null, character);
  const buf = compositeChromie(renderPicks, traits, tokenId, driftMap);
  const pngBuf = renderPNG(buf, palette);
  const missing = collectMissingFiles(picks);

  return { pngBuf, missing };
}

function benchmarkAverageMs(combos, ctx) {
  const samples = combos.slice(0, Math.min(BENCHMARK_SAMPLES, combos.length));
  const t0 = performance.now();
  for (const combo of samples) {
    renderCombo({ ...ctx, combo });
  }
  return (performance.now() - t0) / samples.length;
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
  const character = resolveCharacter();
  const variants = resolveEligibleVariants(traits);
  const combos = buildCombos(variants);
  const total = combos.length;

  const paletteKey = pickPalette(FIXED_TOKEN_ID, traits, character);
  const palette = PALETTES[paletteKey];
  if (!palette || !palette.colors) {
    console.error(`palette ${paletteKey} not defined or missing colors`);
    process.exit(1);
  }

  const counts = Object.entries(variants)
    .map(([slot, list]) => `${slot}=${list.length}`)
    .join(" × ");
  console.log(`Crew sweep: ${FIXED.character} ${FIXED.gender} | shirt=${FIXED.shirt} | palette=${paletteKey}`);
  console.log(`Combos: ${counts} = ${total}`);

  if (!fs.existsSync(SWEEP_DIR)) fs.mkdirSync(SWEEP_DIR, { recursive: true });

  const bufferCache = new Map();
  const ctx = {
    tokenId: FIXED_TOKEN_ID,
    traits,
    character,
    palette,
    bufferCache,
  };

  const avgMs = benchmarkAverageMs(combos, ctx);
  const estimateMs = avgMs * total;
  console.log(`Benchmark: ${avgMs.toFixed(1)} ms/combo (avg of ${Math.min(BENCHMARK_SAMPLES, total)} samples)`);
  console.log(`Estimated total: ~${formatDuration(estimateMs)} for ${total} combos`);

  if (opts.dryRun) {
    console.log("\nDry run — no files written.");
    process.exit(0);
  }

  if (estimateMs > CONFIRM_THRESHOLD_MS && !opts.yes) {
    console.log(`\nEstimate exceeds 3 minutes. Re-run with --yes to proceed.`);
    process.exit(0);
  }

  const sweepStart = performance.now();
  const missingByCombo = [];
  let missingComboCount = 0;

  combos.forEach((combo, index) => {
    const { pngBuf, missing } = renderCombo({ ...ctx, combo });
    const outName = buildOutputName(combo);
    fs.writeFileSync(path.join(SWEEP_DIR, outName), pngBuf);

    const label = `[${index + 1}/${total}] ${comboDescription(combo)}`;
    if (missing.length > 0) {
      missingComboCount += 1;
      const details = missing.map((m) => `${m.slot}:${m.file}`).join(", ");
      missingByCombo.push({ combo, missing, label: `${label}  [MISSING FILE] ${details}` });
      console.log(`${label}  [MISSING FILE]`);
    } else {
      console.log(label);
    }
  });

  const elapsed = performance.now() - sweepStart;
  console.log(`\nDone: ${total} PNGs in ${formatDuration(elapsed)} → output/sweep/`);

  if (missingByCombo.length > 0) {
    console.log(`\nCombos with missing files (${missingComboCount}):`);
    for (const entry of missingByCombo) {
      console.log(`  ${entry.label}`);
      for (const item of entry.missing) {
        console.log(`    ${item.slot.padEnd(10)} → ${item.variant} (${item.file})`);
      }
    }
    process.exitCode = 1;
  }
}

if (require.main === module) main();
