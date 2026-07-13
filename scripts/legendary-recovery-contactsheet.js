#!/usr/bin/env node
// Contact sheet of restored legendary head components for JB visual confirmation.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const COMPONENTS = path.join(REPO, "art-pipeline", "components");
const MANIFEST_PATH = path.join(COMPONENTS, "legendary", "HEAD_MANIFEST.json");
const OUT_DIR = path.join(REPO, "derived_assets", "legendary-recovery");

const SCALE = 8;
const CELL = 64 * SCALE;
const PAD = 24;
const LABEL_H = 48;

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const cols = 3;
  const rows = Math.ceil(manifest.files.length / cols);
  const sheetW = cols * (CELL + PAD) + PAD;
  const sheetH = rows * (CELL + LABEL_H + PAD) + PAD;

  const composites = [];

  for (let i = 0; i < manifest.files.length; i++) {
    const entry = manifest.files[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (CELL + PAD);
    const y = PAD + row * (CELL + LABEL_H + PAD);

    const src = path.join(COMPONENTS, entry.path);
    const upscaled = await sharp(src)
      .resize(CELL, CELL, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();

    composites.push({ input: upscaled, left: x, top: y });

    const label = `#${entry.tokenId} ${entry.artist}\n${path.basename(entry.path)}`;
    const svg = Buffer.from(
      `<svg width="${CELL}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="100%" height="100%" fill="#111"/>` +
      `<text x="4" y="16" fill="#eee" font-family="monospace" font-size="12">${escapeXml(`#${entry.tokenId} ${entry.artist}`)}</text>` +
      `<text x="4" y="34" fill="#aaa" font-family="monospace" font-size="10">${escapeXml(path.basename(entry.path))}</text>` +
      `</svg>`,
    );
    composites.push({ input: svg, left: x, top: y + CELL + 4 });
  }

  const sheetPath = path.join(OUT_DIR, "legendary_heads_contact.png");
  await sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: { r: 32, g: 32, b: 32, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(sheetPath);

  // Copy individual upscaled heads for side-by-side review.
  const headsDir = path.join(OUT_DIR, "heads");
  fs.mkdirSync(headsDir, { recursive: true });
  for (const entry of manifest.files) {
    const src = path.join(COMPONENTS, entry.path);
    const out = path.join(headsDir, `${String(entry.tokenId).padStart(4, "0")}_${path.basename(entry.path)}`);
    await sharp(src)
      .resize(CELL, CELL, { kernel: sharp.kernel.nearest })
      .png()
      .toFile(out);
  }

  console.log(`Contact sheet: ${sheetPath}`);
  console.log(`Individual heads: ${headsDir}/`);
  console.log(`Source commit: ${manifest.restored_from}`);
  console.log(`\nAwaiting JB visual confirmation before re-extraction or base re-render.`);
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
