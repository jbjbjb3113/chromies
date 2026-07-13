#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const data = JSON.parse(
  fs.readFileSync(path.join(REPO, "reports/testrun_2000_dup_analysis/duplicate_analysis.json"), "utf8"),
);
const IMG = path.join(REPO, "chromies-engine/generated/testrun_2000/images");
const OUT = path.join(REPO, "reports/testrun_2000_dup_analysis");

async function main() {
  for (const g of data.groups) {
    const SCALE = 8;
    const CELL = 64 * SCALE;
    const PAD = 12;
    const LH = 36;
    const n = g.ids.length;
    const composites = [];
    for (let i = 0; i < n; i++) {
      const id = g.ids[i];
      const up = await sharp(path.join(IMG, `chromie_${String(id).padStart(4, "0")}.png`))
        .resize(CELL, CELL, { kernel: sharp.kernel.nearest })
        .png()
        .toBuffer();
      const x = PAD + i * (CELL + PAD);
      composites.push({ input: up, left: x, top: LH });
      const pal = g.pals.length > 1 ? g.pals[i] || g.pals.join(" vs ") : g.pals[0];
      const label = `#${id} seed=${id}\n${pal}`;
      const svg = Buffer.from(
        `<svg width="${CELL}" height="${LH}" xmlns="http://www.w3.org/2000/svg">` +
          `<rect width="100%" height="100%" fill="#111"/>` +
          `<text x="4" y="14" fill="#eee" font-family="monospace" font-size="11">#${id} seed=${id}</text>` +
          `<text x="4" y="28" fill="#aaa" font-family="monospace" font-size="8">${pal.replace(/&/g, "&amp;")}</text></svg>`,
      );
      composites.push({ input: svg, left: x, top: 4 });
    }
    await sharp({
      create: {
        width: n * (CELL + PAD) + PAD,
        height: CELL + LH + PAD,
        channels: 4,
        background: { r: 24, g: 24, b: 28, alpha: 1 },
      },
    })
      .composite(composites)
      .png()
      .toFile(path.join(OUT, `group_${String(g.group).padStart(2, "0")}.png`));
    console.log("group", g.group);
  }
}

main();
