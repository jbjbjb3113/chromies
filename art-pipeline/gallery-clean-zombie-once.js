// ============================================================================
// gallery-clean-zombie-once.js — ONE-OFF review run (do not commit)
// 1000-token contact sheet: Zombie tokens get clean accessory constraint;
// all other characters roll normally.
// ============================================================================
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS } = require("./chromies-config");
const {
  pickCharacter,
  pickTokenVariants,
  loadPickBuffers,
  applyCoverageRules,
  pickPalette,
  compositeChromie,
  renderPNG,
  buildPhase3Effects,
} = require("./generate");

const GRID = SETTINGS.grid;
const TILE_SCALE = 4;
const PADDING = 8;
const GALLERY_BG = [0xf5, 0xf5, 0xf5];
const REVIEW_DIR = path.join(SETTINGS.outputDir, "review");

const CLEAN_ZOMBIE_SLOTS = ["hair", "beard", "mustache", "earrings", "tattoo", "bodytattoo"];

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 1000;
  let start = 1;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count") count = parseInt(args[++i], 10);
    else if (args[i] === "--start") start = parseInt(args[++i], 10);
  }
  return { count, start };
}

function gridDims(n) {
  const cols = Math.ceil(Math.sqrt(n * 4 / 3));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

function applyCleanZombieConstraint(picks, traits, character) {
  if (!character || character.name !== "Zombie") return;
  for (const slot of CLEAN_ZOMBIE_SLOTS) {
    const slotDef = traits.slots[slot];
    if (!slotDef) continue;
    const noneV = slotDef.variants.find((v) => v.name === "None");
    if (noneV) picks[slot] = { variant: noneV, file: noneV.file, buffer: null };
  }
}

function main() {
  const { count, start } = parseArgs();
  const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
  const { cols, rows } = gridDims(count);
  const tileSize = GRID * TILE_SCALE;
  const W = cols * (tileSize + PADDING) + PADDING;
  const H = rows * (tileSize + PADDING) + PADDING;

  if (!fs.existsSync(REVIEW_DIR)) fs.mkdirSync(REVIEW_DIR, { recursive: true });

  console.log(`Clean-Zombie gallery: ${count} tokens (${cols}x${rows}), start=${start}`);
  console.log(`Zombie constraint: ${CLEAN_ZOMBIE_SLOTS.join(", ")}=None`);
  console.log(`Other characters: full trait freedom`);

  const gallery = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    gallery.data[i * 4] = GALLERY_BG[0];
    gallery.data[i * 4 + 1] = GALLERY_BG[1];
    gallery.data[i * 4 + 2] = GALLERY_BG[2];
    gallery.data[i * 4 + 3] = 255;
  }

  const characterCounts = {};
  const zombieSlotChecks = { violations: 0, tokens: 0 };
  const paletteCounts = {};

  for (let n = 0; n < count; n++) {
    const tokenId = start + n;
    const col = n % cols;
    const row = Math.floor(n / cols);
    const ox = PADDING + col * (tileSize + PADDING);
    const oy = PADDING + row * (tileSize + PADDING);

    const character = pickCharacter(tokenId);
    const charKey = `${character.name}${character.gender ? `_${character.gender}` : ""}`;
    characterCounts[charKey] = (characterCounts[charKey] || 0) + 1;

    const paletteKey = pickPalette(tokenId, traits, character);
    paletteCounts[paletteKey] = (paletteCounts[paletteKey] || 0) + 1;
    const palette = PALETTES[paletteKey];

    const picks = pickTokenVariants(tokenId, traits, new Set(), character, false);
    applyCleanZombieConstraint(picks, traits, character);
    loadPickBuffers(picks, traits, character);
    const renderPicks = applyCoverageRules(picks, traits, character);

    if (character.name === "Zombie") {
      zombieSlotChecks.tokens++;
      for (const slot of CLEAN_ZOMBIE_SLOTS) {
        const name = renderPicks[slot]?.variant?.name;
        if (name && name !== "None") zombieSlotChecks.violations++;
      }
    }

    const { driftMap } = buildPhase3Effects(tokenId, picks, null, character);
    const buf = compositeChromie(renderPicks, traits, tokenId, driftMap);
    const pngBuf = renderPNG(buf, palette, { transparentIndex0: true });

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
    if ((n + 1) % 50 === 0 || n + 1 === count) process.stdout.write(`\r  rendered ${n + 1}/${count}`);
  }
  process.stdout.write("\n");

  const outPath = path.join(REVIEW_DIR, `gallery_clean_zombie_${count}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(gallery));

  const manifest = {
    generatedAt: new Date().toISOString(),
    count,
    start,
    constraint: { Zombie: CLEAN_ZOMBIE_SLOTS.map((s) => `${s}=None`) },
    zombieConstraintViolations: zombieSlotChecks.violations,
    zombieTokenCount: zombieSlotChecks.tokens,
    characterCounts,
    paletteCounts,
    output: outPath,
    note: "One-off review run — no master.json writes",
  };
  fs.writeFileSync(
    path.join(REVIEW_DIR, `gallery_clean_zombie_${count}.json`),
    JSON.stringify(manifest, null, 2),
  );

  console.log(`wrote ${outPath}`);
  console.log(`Zombie tokens: ${zombieSlotChecks.tokens}, constraint violations: ${zombieSlotChecks.violations}`);
  console.log(`characters: ${Object.entries(characterCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`palettes: ${Object.entries(paletteCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
}

if (require.main === module) main();
