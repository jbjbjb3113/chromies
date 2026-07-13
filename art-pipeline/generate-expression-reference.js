// ============================================================================
// generate-expression-reference.js
// HeroA Male head-only reference for expression slot (z=31) painting in Aseprite.
//
//   node generate-expression-reference.js
//
// Writes:
//   output/expression-reference/base_head.png       — head on SIGNAL bg, 512×512
//   output/expression-reference/expression_zone.png — same + eye/mouth zone overlay + grid
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const {
  loadPickBuffers,
  applyCoverageRules,
  compositeChromie,
  renderPNG,
  upscalePNG,
  extractToBuffer,
  resolveExtractionDrawColors,
} = require("./generate");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;
const OUT_DIR = path.join(SETTINGS.outputDir, "expression-reference");
const SCALE = 8; // 64 → 512
const OVERLAY = { r: 255, g: 0, b: 180, a: 128 }; // ~50% magenta

function noneVariant(slotDef) {
  return slotDef.variants.find((v) => v.name === "None") || slotDef.variants[0];
}

function buildHeadOnlyPicks(traits, character) {
  const picks = {};
  for (const [slot, slotDef] of Object.entries(traits.slots)) {
    if (slot === "head") {
      const variant = slotDef.variants.find((v) => v.name === "HeroA");
      if (!variant) throw new Error("HeroA head variant not found");
      picks.head = { variant, file: variant.file, buffer: null };
      continue;
    }
    const none = noneVariant(slotDef);
    picks[slot] = { variant: none, file: none.file, buffer: null };
  }
  return picks;
}

function loadOpaqueMask(filePath) {
  if (!fs.existsSync(filePath)) return new Uint8Array(PX);
  const png = PNG.sync.read(fs.readFileSync(filePath));
  const mask = new Uint8Array(PX);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = (y * GRID + x) * 4;
      const a = png.data[i + 3];
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const t = SETTINGS.bgKnockoutThreshold;
      if (a > 0 && !(r <= t && g <= t && b <= t)) mask[y * GRID + x] = 1;
    }
  }
  return mask;
}

function dilateMask(mask, radius) {
  if (radius <= 0) return mask;
  const out = new Uint8Array(mask);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!mask[y * GRID + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
          out[ny * GRID + nx] = 1;
        }
      }
    }
  }
  return out;
}

function expandDown(mask, rows) {
  const out = new Uint8Array(mask);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!mask[y * GRID + x]) continue;
      for (let dy = 0; dy <= rows; dy++) {
        const ny = y + dy;
        if (ny >= GRID) break;
        out[ny * GRID + x] = 1;
      }
    }
  }
  return out;
}

function unionMasks(...masks) {
  const out = new Uint8Array(PX);
  for (const mask of masks) {
    for (let i = 0; i < PX; i++) if (mask[i]) out[i] = 1;
  }
  return out;
}

function buildExpressionZoneMask(componentsDir, headMask) {
  const eyesPath = path.join(componentsDir, "EYES_Signal.png");
  const mustachePath = path.join(componentsDir, "MUSTACHE_Thick.png");

  let eyeZone = dilateMask(loadOpaqueMask(eyesPath), 2);
  // Mouth: mustache anchor + downward band for lips/chin expression pixels.
  let mouthZone = loadOpaqueMask(mustachePath);
  mouthZone = expandDown(mouthZone, 3);
  mouthZone = dilateMask(mouthZone, 1);

  // Keep zones on the painted head silhouette only.
  eyeZone = intersectMasks(eyeZone, headMask);
  mouthZone = intersectMasks(mouthZone, headMask);

  return unionMasks(eyeZone, mouthZone);
}

function intersectMasks(a, b) {
  const out = new Uint8Array(PX);
  for (let i = 0; i < PX; i++) out[i] = a[i] && b[i] ? 1 : 0;
  return out;
}

function blendPixel(dst, r, g, b, a) {
  const inv = 255 - a;
  dst[0] = Math.round((r * a + dst[0] * inv) / 255);
  dst[1] = Math.round((g * a + dst[1] * inv) / 255);
  dst[2] = Math.round((b * a + dst[2] * inv) / 255);
}

function upscaleWithOverlay(basePngBuf, zoneMask, drawGrid) {
  const src = PNG.sync.read(basePngBuf);
  const W = GRID * SCALE;
  const H = GRID * SCALE;
  const out = new PNG({ width: W, height: H });

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / SCALE);
      const sy = Math.floor(y / SCALE);
      const so = (sy * GRID + sx) * 4;
      const oo = (y * W + x) * 4;
      out.data[oo] = src.data[so];
      out.data[oo + 1] = src.data[so + 1];
      out.data[oo + 2] = src.data[so + 2];
      out.data[oo + 3] = 255;

      if (zoneMask[sy * GRID + sx]) {
        blendPixel(out.data.subarray(oo, oo + 3), OVERLAY.r, OVERLAY.g, OVERLAY.b, OVERLAY.a);
      }

      if (drawGrid && (x % SCALE === 0 || y % SCALE === 0)) {
        blendPixel(out.data.subarray(oo, oo + 3), 80, 80, 80, 90);
      }
    }
  }

  return PNG.sync.write(out);
}

function main() {
  const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
  const character = (CHARACTERS || []).find(
    (c) => c.name === "HeroA" && c.gender === "Male",
  );
  if (!character) throw new Error("HeroA Male character entry not found in CHARACTERS");

  const palette = PALETTES.SIGNAL;
  if (!palette?.colors) throw new Error("SIGNAL palette not defined");

  const picks = buildHeadOnlyPicks(traits, character);
  loadPickBuffers(picks, traits, character);
  const renderPicks = applyCoverageRules(picks, traits, character);

  const buf = compositeChromie(renderPicks, traits, 0, null, null);
  const basePng = renderPNG(buf, palette);

  const headPick = { variant: picks.head.variant };
  const headMask = extractToBuffer(
    path.join(SETTINGS.componentsDir, picks.head.file),
    resolveExtractionDrawColors("head", headPick, character, traits.slots.head),
  );
  const headOpaque = new Uint8Array(PX);
  for (let i = 0; i < PX; i++) headOpaque[i] = headMask && headMask[i] !== 0 ? 1 : 0;

  const zoneMask = buildExpressionZoneMask(SETTINGS.componentsDir, headOpaque);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const base512 = upscalePNG(basePng, SCALE);
  const zone512 = upscaleWithOverlay(basePng, zoneMask, true);

  const basePath = path.join(OUT_DIR, "base_head.png");
  const zonePath = path.join(OUT_DIR, "expression_zone.png");
  fs.writeFileSync(basePath, base512);
  fs.writeFileSync(zonePath, zone512);

  let zonePixels = 0;
  for (let i = 0; i < PX; i++) if (zoneMask[i]) zonePixels++;

  console.log("Expression slot reference (HeroA Male, SIGNAL, head only)");
  console.log(`  zOrder: ${traits.slots.expression.zOrder}`);
  console.log(`  zone pixels highlighted: ${zonePixels} / ${PX}`);
  console.log(`  wrote: ${path.relative(process.cwd(), basePath)} (512×512)`);
  console.log(`  wrote: ${path.relative(process.cwd(), zonePath)} (512×512, magenta overlay + grid)`);
}

if (require.main === module) main();
