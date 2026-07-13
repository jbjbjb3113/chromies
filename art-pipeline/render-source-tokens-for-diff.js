// ============================================================================
// render-source-tokens-for-diff.js
// One-off: render the already-resolved on-chain pixel buffer for specific
// source ETH tokens (straight from art-pipeline/output/mint-data.json)
// through the SAME renderPNG/upscalePNG functions generate.js/gallery.js use,
// to produce ground-truth reference PNGs for a live-vs-source parity check.
//
// USAGE: node render-source-tokens-for-diff.js <tokenId>:<paletteKey> [...]
// ============================================================================
const fs = require("fs");
const path = require("path");
const { PALETTES, SETTINGS } = require("./chromies-config");
const { renderPNG, upscalePNG } = require("./generate");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;

function fromHex(hexStr) {
  const cleaned = hexStr.toLowerCase().replace(/^0x/, "");
  return Buffer.from(cleaned, "hex");
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
  if (args.length === 0) {
    console.error("usage: node render-source-tokens-for-diff.js <tokenId>:<paletteKey> [...]");
    process.exit(1);
  }

  // NOTE: art-pipeline/output/mint-data.json is a stale 2000-token dev run and
  // does NOT match the shipped reveal dataset. The actual source of truth
  // (per verify-public-reveal-data.ts / commemorative-100.json.sourceDataset)
  // is public/data/mint-data.json (5150 tokens). Read from there explicitly.
  const mintPath = path.resolve(__dirname, "..", "public", "data", "mint-data.json");
  const records = JSON.parse(fs.readFileSync(mintPath, "utf8"));
  const byId = new Map(records.map((r) => [r.tokenId, r]));

  const outDir = path.resolve(__dirname, "..", "reports", "robinhood", "live-tokens");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const spec of args) {
    const [tokenIdStr, paletteKeyArg] = spec.split(":");
    const tokenId = parseInt(tokenIdStr, 10);
    const record = byId.get(tokenId);
    if (!record) {
      console.error(`token ${tokenId} not found in ${mintPath}`);
      process.exit(1);
    }
    const paletteKey = (paletteKeyArg || "").toUpperCase();
    const palette = PALETTES[paletteKey];
    if (!palette || !palette.colors) {
      console.error(`palette ${paletteKey} not defined`);
      process.exit(1);
    }

    const packed = fromHex(record.pixelsHex);
    const buf = unpackPixels(packed);

    const pngBuf = renderPNG(buf, palette);
    const outName64 = `source-token-${tokenId}-${paletteKey.toLowerCase()}.png`;
    fs.writeFileSync(path.join(outDir, outName64), pngBuf);

    const upscaled = upscalePNG(pngBuf, 4);
    const outName4x = `source-token-${tokenId}-${paletteKey.toLowerCase()}_4x.png`;
    fs.writeFileSync(path.join(outDir, outName4x), upscaled);

    console.log(`token ${tokenId} (${paletteKey}) -> ${outName64}, ${outName4x}`);
    console.log(`  traitsHex: ${record.traitsHex}`);
  }
}

main();
