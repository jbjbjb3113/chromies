// Renders PNGs for the staged candidate dataset (chromies-engine/generated/
// regen_5150_current/mint-data-excl-legendary.json) using the same
// renderPNG() the live pipeline uses, decoding palette straight from each
// record's traitsHex byte[1] (no re-roll — pure re-render of the committed
// pixel/trait bytes). Also builds 10x10 contact sheets, same grid format as
// scripts/testrun-1k-current.mjs.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { renderPNG } = require("./generate");
const { SETTINGS } = require("./chromies-config");
const { ON_CHAIN_PALETTE_BYTES } = require("./generated/on-chain-palette-bytes");
const paletteColorsExpanded = require(path.resolve(__dirname, "..", "chromies-engine", "engine_data", "palette_colors_expanded.json"));

const GRID = SETTINGS.grid;
const PX = GRID * GRID;

const STAGE_DIR = path.resolve(__dirname, "..", "chromies-engine", "generated", "regen_5150_current");
const MINT_DATA_PATH = path.join(STAGE_DIR, "mint-data-excl-legendary.json");
const IMAGES_DIR = path.join(STAGE_DIR, "images");
const SHEETS_DIR = path.join(STAGE_DIR, "contact_sheets");

const PALETTE_ID_TO_NAME = {};
for (const [name, id] of Object.entries(ON_CHAIN_PALETTE_BYTES)) PALETTE_ID_TO_NAME[id] = name;

function pad4(id) {
  return String(id).padStart(4, "0");
}

function unpackPixels(hex) {
  const packed = Buffer.from(hex.replace(/^0x/i, ""), "hex");
  const out = new Uint8Array(PX);
  for (let i = 0; i < PX; i++) {
    const byteIndex = i >> 1;
    out[i] = (i & 1) === 0 ? (packed[byteIndex] >> 4) & 0x0f : packed[byteIndex] & 0x0f;
  }
  return out;
}

function paletteFromTraitsHex(hex) {
  const bytes = Buffer.from(hex.replace(/^0x/i, ""), "hex");
  const paletteId = bytes[1];
  const name = PALETTE_ID_TO_NAME[paletteId];
  if (!name) throw new Error(`Unknown palette id ${paletteId}`);
  const colors = paletteColorsExpanded.palettes[String(paletteId)].colors;
  return { name, colors };
}

async function buildContactSheet(tokenIds, srcDir, outPath) {
  const COLS = 10;
  const ROWS = Math.ceil(tokenIds.length / COLS);
  const SCALE = 6;
  const CELL = GRID * SCALE;
  const LABEL_H = 20;
  const PAD = 6;
  const sheetW = COLS * (CELL + PAD) + PAD;
  const sheetH = ROWS * (CELL + LABEL_H + PAD) + PAD;
  const composites = [];
  for (let i = 0; i < tokenIds.length; i++) {
    const tokenId = tokenIds[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD + col * (CELL + PAD);
    const y = PAD + row * (CELL + LABEL_H + PAD);
    const imgPath = path.join(srcDir, `chromie_${pad4(tokenId)}.png`);
    const upscaled = await sharp(imgPath).resize(CELL, CELL, { kernel: sharp.kernel.nearest }).png().toBuffer();
    composites.push({ input: upscaled, left: x, top: y });
    const svg = Buffer.from(
      `<svg width="${CELL}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">` +
        `<text x="4" y="15" fill="#ddd" font-family="monospace" font-size="12">#${tokenId}</text></svg>`,
    );
    composites.push({ input: svg, left: x, top: y + CELL + 2 });
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: { r: 24, g: 24, b: 28, alpha: 1 } } })
    .composite(composites)
    .png()
    .toFile(outPath);
  return outPath;
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.mkdirSync(SHEETS_DIR, { recursive: true });
  const records = JSON.parse(fs.readFileSync(MINT_DATA_PATH, "utf8"));
  console.log(`Rendering ${records.length} candidate PNGs...`);

  const t0 = Date.now();
  const pixelHexSeen = new Map();
  const duplicatePixels = [];
  const vectorSeen = new Map();
  const duplicateVectors = [];

  const sheetTokenIds = [];
  let sheetIndex = 1;
  const sheets = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const buf = unpackPixels(r.pixelsHex);
    const palette = paletteFromTraitsHex(r.traitsHex);
    const pngBuf = renderPNG(buf, palette);
    fs.writeFileSync(path.join(IMAGES_DIR, `chromie_${pad4(r.tokenId)}.png`), pngBuf);

    const pKey = r.pixelsHex.toLowerCase();
    if (pixelHexSeen.has(pKey)) duplicatePixels.push({ a: pixelHexSeen.get(pKey), b: r.tokenId });
    else pixelHexSeen.set(pKey, r.tokenId);

    const vKey = `${r.pixelsHex}|${r.traitsHex}`.toLowerCase();
    if (vectorSeen.has(vKey)) duplicateVectors.push({ a: vectorSeen.get(vKey), b: r.tokenId });
    else vectorSeen.set(vKey, r.tokenId);

    sheetTokenIds.push(r.tokenId);
    if (sheetTokenIds.length === 100) {
      sheets.push(await buildContactSheet([...sheetTokenIds], IMAGES_DIR, path.join(SHEETS_DIR, `sheet_${String(sheetIndex).padStart(3, "0")}.png`)));
      sheetTokenIds.length = 0;
      sheetIndex += 1;
    }
    if ((i + 1) % 1000 === 0) console.log(`  ${i + 1}/${records.length}`);
  }
  if (sheetTokenIds.length > 0) {
    sheets.push(await buildContactSheet([...sheetTokenIds], IMAGES_DIR, path.join(SHEETS_DIR, `sheet_${String(sheetIndex).padStart(3, "0")}.png`)));
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nRendered ${records.length} PNGs + ${sheets.length} contact sheets in ${elapsed}s`);
  console.log(`Images: ${IMAGES_DIR}`);
  console.log(`Sheets: ${SHEETS_DIR}`);
  console.log(`Duplicate pixelsHex: ${duplicatePixels.length}`);
  for (const d of duplicatePixels) console.log(`  #${d.a} == #${d.b}`);
  console.log(`Duplicate full vectors (pixelsHex|traitsHex): ${duplicateVectors.length}`);
  for (const d of duplicateVectors) console.log(`  #${d.a} == #${d.b}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
