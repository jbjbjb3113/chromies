#!/usr/bin/env node
/** Extract duplicate-payload groups for testrun_2000 report. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const require = createRequire(path.join(REPO, "art-pipeline/package.json"));

const { SETTINGS } = require(path.join(REPO, "art-pipeline/chromies-config.js"));
const { buildMintRecord } = require(path.join(REPO, "art-pipeline/bridge-mint-data.js"));
const {
  TraitDedupeGuard,
  ComboCapGuard,
  resetGenerationStats,
  buildTraitVectorKey,
} = require(path.join(REPO, "art-pipeline/generate.js"));

const IMG_DIR = path.join(REPO, "chromies-engine/generated/testrun_2000/images");
const OUT_DIR = path.join(REPO, "reports/testrun_2000_dup_analysis");

function decodeSummary(decoded) {
  const skip = new Set(["mutation", "drift"]);
  return Object.entries(decoded)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${k}=${v.value}(${v.byte})`)
    .join("\n");
}

function visibleTraitKey(record, traitsJson) {
  // buildTraitVectorKey needs renderPicks — approximate from decoded visible slots
  const parts = [`char:${record.character}`, `pal:${record.palette}`];
  for (const [k, v] of Object.entries(record.traitsDecoded)) {
    if (["character", "palette", "mutation", "drift"].includes(k)) continue;
    parts.push(`${k}:${v.value}`);
  }
  return parts.sort().join("|");
}

async function thumbForGroup(group, idx) {
  const SCALE = 8;
  const CELL = 64 * SCALE;
  const PAD = 12;
  const LABEL_H = 40;
  const n = group.length;
  const sheetW = n * (CELL + PAD) + PAD;
  const sheetH = CELL + LABEL_H + PAD;
  const composites = [];
  for (let i = 0; i < n; i++) {
    const m = group[i];
    const imgPath = path.join(IMG_DIR, `chromie_${String(m.tokenId).padStart(4, "0")}.png`);
    const up = await sharp(imgPath).resize(CELL, CELL, { kernel: sharp.kernel.nearest }).png().toBuffer();
    const x = PAD + i * (CELL + PAD);
    composites.push({ input: up, left: x, top: LABEL_H });
    const svg = Buffer.from(
      `<svg width="${CELL}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="100%" height="100%" fill="#111"/>` +
        `<text x="4" y="14" fill="#eee" font-family="monospace" font-size="11">#${m.tokenId}  seed=${m.tokenId}</text>` +
        `<text x="4" y="28" fill="#9cf" font-family="monospace" font-size="9">${m.character}</text>` +
        `<text x="4" y="38" fill="#aaa" font-family="monospace" font-size="8">${m.palette}</text></svg>`,
    );
    composites.push({ input: svg, left: x, top: 4 });
  }
  const out = path.join(OUT_DIR, `group_${String(idx).padStart(2, "0")}.png`);
  await sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 24, g: 24, b: 28, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toFile(out);
  return `reports/testrun_2000_dup_analysis/group_${String(idx).padStart(2, "0")}.png`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const traitsJson = JSON.parse(
    fs.readFileSync(path.join(REPO, "art-pipeline", SETTINGS.traitsFile), "utf8"),
  );
  resetGenerationStats();
  const dedupe = new TraitDedupeGuard();
  const combo = new ComboCapGuard();
  const records = [];

  for (let id = 1; id <= 2000; id++) {
    const r = buildMintRecord(id, traitsJson, [], dedupe, combo);
    records.push({
      tokenId: id,
      seed: id,
      pixelsHex: r.pixelsHex,
      traitsHex: r.traitsHex,
      character: r.character,
      palette: r.palette,
      traitsDecoded: JSON.parse(JSON.stringify(r.traitsDecoded)),
      visibleKey: visibleTraitKey(r, traitsJson),
    });
  }

  const fullMap = new Map();
  const pixelMap = new Map();
  for (const r of records) {
    const fk = `${r.pixelsHex}|${r.traitsHex}`.toLowerCase();
    const pk = r.pixelsHex.toLowerCase();
    if (!fullMap.has(fk)) fullMap.set(fk, []);
    fullMap.get(fk).push(r);
    if (!pixelMap.has(pk)) pixelMap.set(pk, []);
    pixelMap.get(pk).push(r);
  }

  const fullGroups = [...fullMap.values()].filter((g) => g.length > 1).sort((a, b) => a[0].tokenId - b[0].tokenId);
  const visualOnly = [...pixelMap.values()].filter((g) => {
    if (g.length < 2) return false;
    const th = new Set(g.map((r) => r.traitsHex.toLowerCase()));
    return th.size > 1;
  });

  const groups = [];
  let gi = 0;
  for (const g of fullGroups) {
    gi += 1;
    const sorted = g.sort((a, b) => a.tokenId - b.tokenId);
    const visibleKeys = new Set(sorted.map((r) => r.visibleKey));
    const palettes = new Set(sorted.map((r) => r.palette));
    const paletteBytes = new Set(sorted.map((r) => r.traitsDecoded.palette.byte));
    const traitsHexSame = true;
    let cause;
    if (visibleKeys.size === 1) {
      cause = "roll_space";
    } else if (paletteBytes.size === 1 && palettes.size > 1) {
      cause = "encoding_collapse";
    } else if (visibleKeys.size > 1 && traitsHexSame) {
      cause = "encoding_collapse";
    } else {
      cause = "visual_space";
    }

    const thumb = await thumbForGroup(sorted, gi);
    groups.push({
      group: gi,
      tokenIds: sorted.map((r) => r.tokenId),
      seeds: sorted.map((r) => r.tokenId),
      traitsHex: sorted[0].traitsHex,
      pixelsHexLen: sorted[0].pixelsHex.length,
      traitVector: decodeSummary(sorted[0].traitsDecoded),
      visibleKeys: [...visibleKeys],
      palettes: [...palettes],
      paletteByte: sorted[0].traitsDecoded.palette.byte,
      classification: cause,
      thumbnail: thumb,
      members: sorted.map((r) => ({
        tokenId: r.tokenId,
        seed: r.tokenId,
        character: r.character,
        palette: r.palette,
        visibleKey: r.visibleKey,
      })),
    });
  }

  // Thin corners: slot values appearing in dup tokens
  const dupIds = new Set(groups.flatMap((g) => g.tokenIds));
  const slotDup = {};
  for (const r of records) {
    if (!dupIds.has(r.tokenId)) continue;
    for (const [k, v] of Object.entries(r.traitsDecoded)) {
      if (["mutation", "drift"].includes(k)) continue;
      const sk = `${k}=${v.value}`;
      slotDup[sk] = (slotDup[sk] || 0) + 1;
    }
  }

  const out = {
    fullGroups: groups.length,
    extraInstances: groups.reduce((n, g) => n + g.tokenIds.length - 1, 0),
    visualOnlyGroups: visualOnly.length,
    visualOnlyExtra: visualOnly.reduce((n, g) => n + g.length - 1, 0),
    projected5150Extra: Math.round((groups.reduce((n, g) => n + g.tokenIds.length - 1, 0) / 2000) * 5150),
    groups,
    thinCorners: Object.entries(slotDup)
      .sort((a, b) => b[1] - a[1])
      .map(([k, c]) => ({ trait: k, dupTokenHits: c })),
  };

  fs.writeFileSync(path.join(OUT_DIR, "duplicate_analysis.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ fullGroups: out.fullGroups, extra: out.extraInstances, visualOnly: out.visualOnlyGroups }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
