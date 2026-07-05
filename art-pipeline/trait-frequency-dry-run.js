// ============================================================================
// trait-frequency-dry-run.js
// Full-collection trait roll simulation (5150 tokens) — no PNG I/O, no writes.
//
// USAGE:  node trait-frequency-dry-run.js [--start N] [--count N]
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const {
  pickCharacter,
  pickPalette,
  resolveUniqueTokenTraits,
  TraitDedupeGuard,
  ComboCapGuard,
  buildNearDupComboKey,
  resetGenerationStats,
  getAntiNoneStackFireTotal,
  getDedupeRerollFireTotal,
  getDedupeRerollLog,
  getComboCapRerollFireTotal,
  getComboCapRerollLog,
  buildTraitVectorKey,
  COMBO_CAP_MAX,
} = require("./generate");
const { characterKey } = require("./on-chain-character-bytes");
const { isGoldToken, GOLD_TOKEN_IDS, GOLD_COUNT } = require("./gold-token-ids");
const {
  getLegendaryForToken,
  LEGENDARY_ASSIGNMENTS,
  LEGENDARY_TOKEN_IDS,
} = require("./legendary-token-ids");

const COLLECTION_SIZE = 5150;
const SHIRT_PALETTE_SUFFIXES = [
  "SHIRT_RED", "SHIRT_PURPLE", "SHIRT_ORANGE", "SHIRT_OLIVE",
  "SHIRT_GREEN", "SHIRT_GOLD", "SHIRT_BLUE",
];
const SHIRT_PALETTE_FAMILIES = ["SIGNAL", "ACID", "CYAN", "GHOST", "BLOOD", "MOSS"];

const STAT_SLOTS = [
  "character",
  "palette",
  "hair",
  "glasses",
  "eyes",
  "beard",
  "mustache",
  "shirt",
  "hood",
  "necklace",
  "tattoo",
  "bodytattoo",
  "earrings",
  "expression",
];

const DARK_GLASSES_RE = /shades|neo|vr|dframefilled|3dglasses/i;

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { start: 1, count: COLLECTION_SIZE };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--start") result.start = parseInt(args[++i], 10);
    else if (args[i] === "--count") result.count = parseInt(args[++i], 10);
  }
  return result;
}

function hexLuminance(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function shirtColorLuminance(paletteKey) {
  const pal = PALETTES[paletteKey];
  if (!pal?.colors?.[9]) return null;
  return hexLuminance(pal.colors[9]);
}

function isDarkGlasses(name) {
  if (!name || name === "None") return false;
  return DARK_GLASSES_RE.test(name);
}

function inc(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function printFreqTable(title, counts, total) {
  console.log(`\n${title}`);
  console.log(`${"variant".padEnd(36)} ${"count".padStart(6)}  ${"pct".padStart(7)}`);
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [name, n] of rows) {
    console.log(`${name.padEnd(36)} ${String(n).padStart(6)}  ${((n / total) * 100).toFixed(2).padStart(6)}%`);
  }
}

function buildTraitRecord(tokenId, traits, dedupeGuard, comboCapGuard) {
  const resolved = resolveUniqueTokenTraits(tokenId, traits, dedupeGuard, {
    comboCapGuard,
    metadataOnly: true,
    loadBuffers: false,
    logDedupeRerolls: false,
    logComboCapRerolls: false,
  });
  const { character, paletteKey: palette, renderPicks } = resolved;
  const legendary = getLegendaryForToken(tokenId);

  const record = {
    tokenId,
    character: characterKey(character),
    palette,
    legendary: legendary ? legendary.palette : null,
    isGold: isGoldToken(tokenId),
    _character: character,
    _renderPicks: renderPicks,
  };

  for (const slot of Object.keys(traits.slots)) {
    record[slot] = renderPicks[slot]?.variant?.name ?? "None";
  }

  return record;
}

function traitVectorHash(record, traits, character, renderPicks) {
  return buildTraitVectorKey(character, record.palette, renderPicks, traits);
}

function nearDupKey(record) {
  return buildNearDupComboKey(record._character, record._renderPicks);
}

function main() {
  const { start, count } = parseArgs();
  const end = Math.min(start + count - 1, COLLECTION_SIZE);
  const total = end - start + 1;

  const traits = JSON.parse(fs.readFileSync(path.join(__dirname, SETTINGS.traitsFile), "utf8"));

  const slotCounts = Object.fromEntries(STAT_SLOTS.map((s) => [s, {}]));
  const shirtPaletteCounts = {};
  for (const fam of SHIRT_PALETTE_FAMILIES) {
    for (const suf of SHIRT_PALETTE_SUFFIXES) {
      shirtPaletteCounts[`${fam}_${suf}`] = 0;
    }
  }

  let darkGlasses = 0;
  let bareEyed = 0;
  let glassesEligible = 0;
  let darkTorso = 0;
  let torsoVisible = 0;

  const heroGlasses = {
    HeroA_Male: {},
    HeroA_Female: {},
  };

  const hashCounts = new Map();
  const nearDupCounts = new Map();

  const rarity = {
    GOLD: 0,
    legendary: 0,
    legendaryComingSoon: 0,
    Agent: 0,
    Alien: 0,
    Cat: 0,
  };

  console.log(`Trait frequency dry run: tokens ${start}–${end} (${total} total)`);
  console.log("(traits only — no PNG compositing, no mint-data writes)\n");

  resetGenerationStats();
  const dedupeGuard = new TraitDedupeGuard();
  const comboCapGuard = new ComboCapGuard();

  for (let tokenId = start; tokenId <= end; tokenId++) {
    const record = buildTraitRecord(tokenId, traits, dedupeGuard, comboCapGuard);

    inc(slotCounts.character, record.character);
    inc(slotCounts.palette, record.palette);

    for (const slot of STAT_SLOTS) {
      if (slot === "character" || slot === "palette") continue;
      inc(slotCounts[slot], record[slot] || "None");
    }

    if (record.isGold) rarity.GOLD += 1;
    const leg = getLegendaryForToken(tokenId);
    if (leg) {
      rarity.legendary += 1;
      if (leg.artist === "Coming Soon") rarity.legendaryComingSoon += 1;
    }
    if (record.character === "Agent") rarity.Agent += 1;
    if (record.character === "Alien") rarity.Alien += 1;
    if (record.character === "Cat") rarity.Cat += 1;

    const g = record.glasses || "None";
    if (g !== "None") {
      glassesEligible += 1;
      if (isDarkGlasses(g)) darkGlasses += 1;
    } else {
      bareEyed += 1;
    }

    if (heroGlasses[record.character]) {
      inc(heroGlasses[record.character], g);
    }

    if (shirtPaletteCounts[record.palette] !== undefined) {
      shirtPaletteCounts[record.palette] += 1;
    }

    const shirtVisible = record.shirt && record.shirt !== "None";
    const hoodCovers = record.hood && !["None", "Female_None"].includes(record.hood)
      && /Classic|Hooded|Hoodie/i.test(record.hood);
    if (shirtVisible && !hoodCovers && record.palette !== "GOLD" && !record.palette.startsWith("NORMIE_")) {
      torsoVisible += 1;
      const lum = shirtColorLuminance(record.palette);
      if (lum != null && lum < 0.22) darkTorso += 1;
    }

    const hash = traitVectorHash(record, traits, record._character, record._renderPicks);
    hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);

    const nd = nearDupKey(record);
    nearDupCounts.set(nd, (nearDupCounts.get(nd) || 0) + 1);
  }

  for (const slot of STAT_SLOTS) {
    printFreqTable(`=== ${slot} ===`, slotCounts[slot], total);
  }

  console.log("\n=== Cross-cut: glasses (post-coverage) ===");
  console.log(`  dark-lens glasses:  ${darkGlasses}  (${((darkGlasses / total) * 100).toFixed(2)}% of all tokens)`);
  console.log(`  bare-eyed (None):     ${bareEyed}  (${((bareEyed / total) * 100).toFixed(2)}%)`);
  console.log(`  any glasses worn:     ${glassesEligible}  (${((glassesEligible / total) * 100).toFixed(2)}%)`);
  console.log(`  dark-lens / wearing:  ${glassesEligible ? ((darkGlasses / glassesEligible) * 100).toFixed(2) : 0}%`);

  console.log("\n=== Cross-cut: shirt palette (_SHIRT_* entries, 42 variants) ===");
  const shirtRows = Object.entries(shirtPaletteCounts).sort((a, b) => b[1] - a[1]);
  let shirtReachable = 0;
  let shirtZero = 0;
  for (const [name, n] of shirtRows) {
    if (n > 0) shirtReachable += 1;
    else shirtZero += 1;
    console.log(`  ${name.padEnd(28)} ${String(n).padStart(5)}  (${((n / total) * 100).toFixed(2)}%)`);
  }
  console.log(`  reachable: ${shirtReachable}/42  |  zero-count: ${shirtZero}/42`);

  console.log("\n=== Cross-cut: dark shirt/torso (palette index 9 luminance < 0.22, shirt visible) ===");
  console.log(`  dark torso: ${darkTorso} / ${torsoVisible} visible-shirt tokens (${torsoVisible ? ((darkTorso / torsoVisible) * 100).toFixed(2) : 0}%)`);
  console.log(`  dark torso / all: ${((darkTorso / total) * 100).toFixed(2)}%`);

  console.log("\n=== Cross-cut: HeroA × glasses ===");
  for (const [char, counts] of Object.entries(heroGlasses)) {
    const charTotal = Object.values(counts).reduce((s, n) => s + n, 0);
    printFreqTable(char, counts, charTotal);
  }

  const dupHashes = [...hashCounts.values()].filter((n) => n > 1).length;
  const dupTokens = [...hashCounts.values()].reduce((s, n) => s + (n > 1 ? n : 0), 0);
  console.log("\n=== Uniqueness: full trait vector ===");
  console.log(`  unique vectors:     ${hashCounts.size}`);
  console.log(`  duplicate vectors:  ${dupTokens} tokens in ${dupHashes} collision groups`);
  console.log(`  dedupe reroll fires:  ${getDedupeRerollFireTotal()}  (${((getDedupeRerollFireTotal() / total) * 100).toFixed(2)}% of run)`);
  const dedupeLog = getDedupeRerollLog();
  if (dedupeLog.length > 0) {
    console.log(`  dedupe reroll log (${dedupeLog.length} entries):`);
    for (const entry of dedupeLog) {
      console.log(
        `    #${entry.tokenId} vs #${entry.partnerId} → ${entry.slot}=${entry.variant || "?"} (:dedupe:${entry.attempt}, attempt ${entry.attempt}/5)`,
      );
    }
  }

  console.log(`\n=== Anti-none-stack rule ===`);
  console.log(`  tokens affected:    ${getAntiNoneStackFireTotal()}  (${((getAntiNoneStackFireTotal() / total) * 100).toFixed(2)}% of run)`);

  console.log(`\n=== Combo cap (character + hair + glasses + shirt, max ${60}/combo) ===`);
  console.log(`  cap-reroll fires:   ${getComboCapRerollFireTotal()}  (${((getComboCapRerollFireTotal() / total) * 100).toFixed(2)}% of run)`);
  const capLog = getComboCapRerollLog();
  if (capLog.length > 0) {
    console.log(`  cap-reroll log (${capLog.length} entries):`);
    for (const entry of capLog) {
      console.log(
        `    #${entry.tokenId} "${entry.originalCombo}" → ${entry.slot}=${entry.variant} (:comboCap:${entry.attempt}, attempt ${entry.attempt}/5)`,
      );
    }
  }

  const nearDupTop = [...comboCapGuard.counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const nearDupMax = nearDupTop.length > 0 ? nearDupTop[0][1] : 0;
  console.log("\n=== Near-duplicates (character + hair + glasses + shirt, cap-tracked only) ===");
  console.log(`  max combo count:    ${nearDupMax}  (cap ${COMBO_CAP_MAX})`);
  console.log(`${"combo".padEnd(72)} ${"count".padStart(6)}`);
  for (const [key, n] of nearDupTop) {
    console.log(`${key.padEnd(72)} ${String(n).padStart(6)}`);
  }

  const charWeights = CHARACTERS.reduce((s, c) => s + (c.weight || 0), 0);
  const agentWeight = CHARACTERS.find((c) => c.name === "Agent")?.weight ?? 0;
  const alienWeight = CHARACTERS.find((c) => c.name === "Alien")?.weight ?? 0;
  const catWeight = CHARACTERS.find((c) => c.name === "Cat")?.weight ?? 0;

  console.log("\n=== Rarity floor check ===");
  console.log(`  GOLD:              ${rarity.GOLD}  (expected ${GOLD_COUNT}, ids: ${GOLD_TOKEN_IDS.join(", ")})`);
  console.log(`  Normie Legendary:  ${rarity.legendary}  (expected 9, incl. ${rarity.legendaryComingSoon} Coming Soon)`);
  console.log(`    assigned ids:    ${LEGENDARY_TOKEN_IDS.join(", ")}`);
  for (const a of LEGENDARY_ASSIGNMENTS) {
    console.log(`      #${a.tokenId} ${a.palette} (${a.artist})`);
  }
  console.log(`  Agent:             ${rarity.Agent}  (expected ~${Math.round((agentWeight / charWeights) * COLLECTION_SIZE)} at weight ${agentWeight}/${charWeights})`);
  console.log(`  Alien:             ${rarity.Alien}  (expected ~${Math.round((alienWeight / charWeights) * COLLECTION_SIZE)} at weight ${alienWeight}/${charWeights})`);
  console.log(`  Cat:               ${rarity.Cat}  (expected 0, config weight ${catWeight})`);
}

if (require.main === module) main();

module.exports = { buildTraitRecord, main };
