// ============================================================================
// gallery.js
// Generate N Chromies with per-token palette + drift + mutation + coverage rules.
// Writes per-token files AND a grid PNG. Updates master ledger.
// ============================================================================
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS } = require("./chromies-config");
const {
  pickCharacter,
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

const GRID = SETTINGS.grid;
const TILE_SCALE = 4;
const PADDING = 8;
const GALLERY_BG = [0xf5, 0xf5, 0xf5];

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { count: 24, start: 1, palette: null, tier: null, mtier: null, character: null, json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--count") result.count = parseInt(args[++i], 10);
    else if (a === "--start") result.start = parseInt(args[++i], 10);
    else if (a === "--palette") result.palette = args[++i].toUpperCase();
    else if (a === "--tier")   result.tier   = args[++i];
    else if (a === "--mtier")  result.mtier  = args[++i];
    else if (a === "--character") result.character = args[++i];
    else if (a === "--json") result.json = true;
  }
  return result;
}

function buildGalleryTraitRow(tokenId, character, paletteKey, picks, mTier, slotOrder) {
  const row = {
    tokenId,
    character: character ? character.name : null,
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
  const { count, start, palette: paletteOverride, tier: tierOverride, mtier: mtierOverride, character: characterOverride, json: writeJson } = parseArgs();
  const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
  const slotOrder = Object.keys(traits.slots);
  const { cols, rows } = gridDims(count);
  const tileSize = GRID * TILE_SCALE;
  const W = cols * (tileSize + PADDING) + PADDING;
  const H = rows * (tileSize + PADDING) + PADDING;

  const palLabel = paletteOverride ? `palette FORCED to ${paletteOverride}` : "palettes per-token";
  const tierLabel = tierOverride ? `, drift FORCED to ${tierOverride}` : "";
  const mtierLabel = mtierOverride ? `, mutation FORCED to ${mtierOverride}` : "";
  const charLabel = characterOverride ? `, character FORCED to ${characterOverride}` : "";
  console.log(`Gallery: ${count} tokens, ${cols}x${rows} grid, ${palLabel}${tierLabel}${mtierLabel}${charLabel}`);

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
  const traitRows = [];

  for (let n = 0; n < count; n++) {
    const tokenId = start + n;
    const col = n % cols;
    const row = Math.floor(n / cols);
    const ox = PADDING + col * (tileSize + PADDING);
    const oy = PADDING + row * (tileSize + PADDING);

    // Pick character first — gates palette pool and slot picks
    let character = pickCharacter(tokenId);
    if (characterOverride) {
      const { CHARACTERS } = require("./chromies-config");
      const found = (CHARACTERS || []).find(c => c.name.toLowerCase() === characterOverride.toLowerCase());
      if (found) character = found;
    }
    const charKey = character ? `${character.name}${character.gender ? `_${character.gender}` : ""}` : "unknown";
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

    if (writeJson) {
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

  const paletteSlug = paletteOverride ? paletteOverride.toLowerCase() : "mixed";
  const outName = `gallery_${count}_${paletteSlug}_${start}.png`;
  fs.writeFileSync(path.join(SETTINGS.outputDir, outName), PNG.sync.write(gallery));
  console.log(`wrote ${outName}`);
  if (writeJson) {
    const jsonName = `gallery_${count}_${start}_traits.json`;
    fs.writeFileSync(
      path.join(SETTINGS.outputDir, jsonName),
      JSON.stringify(traitRows, null, 2)
    );
    console.log(`wrote ${jsonName}`);
  }
  console.log(`wrote ${count} per-token file sets to tokens/`);
  console.log(`updated master.json + master.csv`);
  if (!paletteOverride) {
    console.log(`palette distribution:    ${Object.entries(paletteCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  console.log(`character distribution:  ${Object.entries(characterCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`drift distribution:      ${Object.entries(tierCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`mutation distribution:   ${Object.entries(mTierCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
}

if (require.main === module) main();
