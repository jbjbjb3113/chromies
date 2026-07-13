// ============================================================================
// regen-current-vs-seeded.js
// One-off provenance audit: regenerate a token from the CURRENT art-pipeline
// state (current components/, current traits.json, current compositor) and
// diff against its seeded (frozen, on-chain) pixel buffer. Read-only —
// does NOT touch output/master.json|csv or output/tokens/.
//
// USAGE: node regen-current-vs-seeded.js <tokenId>:<paletteKey> [...]
// ============================================================================
const fs = require("fs");
const path = require("path");
const { PALETTES, SETTINGS } = require("./chromies-config");
const {
  pickCharacter,
  pickTokenVariants,
  loadPickBuffers,
  finalizeTokenTraits,
  buildPhase3Effects,
  resolveTokenPixelBuffer,
  renderPNG,
  upscalePNG,
} = require("./generate");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;

function fromHex(hexStr) {
  return Buffer.from(hexStr.toLowerCase().replace(/^0x/, ""), "hex");
}

function unpackPixels(packed) {
  const out = new Uint8Array(PX);
  for (let i = 0; i < PX; i++) {
    const byteIndex = i >> 1;
    out[i] = (i & 1) === 0 ? (packed[byteIndex] >> 4) & 0x0f : packed[byteIndex] & 0x0f;
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));

  const mintPath = path.resolve(__dirname, "..", "public", "data", "mint-data.json");
  const seededRecords = JSON.parse(fs.readFileSync(mintPath, "utf8"));
  const seededById = new Map(seededRecords.map((r) => [r.tokenId, r]));

  const outDir = path.resolve(__dirname, "..", "reports", "robinhood", "live-tokens");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const spec of args) {
    const [tokenIdStr, paletteKeyArg] = spec.split(":");
    const tokenId = parseInt(tokenIdStr, 10);
    const seeded = seededById.get(tokenId);
    if (!seeded) {
      console.error(`token ${tokenId} not in seeded dataset`);
      process.exit(1);
    }

    console.log(`\n=== regenerating token ${tokenId} from CURRENT pipeline state ===`);

    const character = pickCharacter(tokenId);
    const paletteKey = (paletteKeyArg || "").toUpperCase();
    const palette = PALETTES[paletteKey];
    if (!palette || !palette.colors) {
      console.error(`palette ${paletteKey} not defined`);
      process.exit(1);
    }

    const picks = pickTokenVariants(tokenId, traits, new Set(), character, true);
    loadPickBuffers(picks, traits, character);
    const { renderPicks, antiStackFires } = finalizeTokenTraits(tokenId, picks, traits, character);
    const { driftMap } = buildPhase3Effects(tokenId, picks, null, character);
    const { buf } = resolveTokenPixelBuffer(tokenId, traits, renderPicks, driftMap, paletteKey);

    console.log(`  character (current pickCharacter): ${character ? character.name + (character.gender ? ` (${character.gender})` : "") : "null"}`);
    console.log(`  current picks:`);
    for (const [slot, pick] of Object.entries(picks)) {
      console.log(`    ${slot.padEnd(11)} -> ${pick.variant.name} (${pick.file})`);
    }
    if (antiStackFires > 0) console.log(`  [anti-none-stack] fired ${antiStackFires}x`);

    const pngBuf = renderPNG(buf, palette);
    const outName = `regen-current-token-${tokenId}-${paletteKey.toLowerCase()}.png`;
    fs.writeFileSync(path.join(outDir, outName), pngBuf);
    fs.writeFileSync(path.join(outDir, outName.replace(".png", "_4x.png")), upscalePNG(pngBuf, 4));
    console.log(`  wrote ${outName} (+ 4x)`);

    // Diff current-regen buf against seeded (frozen) pixel buffer.
    const seededBuf = unpackPixels(fromHex(seeded.pixelsHex));
    let diffCount = 0;
    for (let i = 0; i < PX; i++) {
      if (buf[i] !== seededBuf[i]) diffCount++;
    }
    console.log(`  pixel diff vs seeded (on-chain) buffer: ${diffCount} / ${PX} different`);
  }
}

main();
