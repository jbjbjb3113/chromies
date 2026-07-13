// Bare Zombie head+body preview with Fix 1+2 applied.
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const { extractToBuffer, renderPNG, resolveExtractionDrawColors } = require("./generate");

const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
const ZOMBIE = CHARACTERS.find((c) => c.name === "Zombie");
const GRID = SETTINGS.grid;
const SCALE = 12;
const OUT = path.join(SETTINGS.outputDir, "review", "zombie-bare-preview.png");

const zombieOpts = { skipRgbKnockout: true };
const renderOpts = { transparentIndex0: true };

const headFile = path.join(SETTINGS.componentsDir, "zombie/HEAD_Zombie.png");
const bodyFile = path.join(SETTINGS.componentsDir, "zombie/BODY_Zombie.png");
const headPick = { variant: { name: "Zombie" } };
const bodyPick = { variant: { name: "Zombie" } };
const headDraw = resolveExtractionDrawColors("head", headPick, ZOMBIE, traits.slots.head);
const bodyDraw = resolveExtractionDrawColors("body", bodyPick, ZOMBIE, traits.slots.body);
const headBuf = extractToBuffer(headFile, headDraw, zombieOpts);
const bodyBuf = extractToBuffer(bodyFile, bodyDraw, zombieOpts);

const comp = new Uint8Array(GRID * GRID);
for (let i = 0; i < comp.length; i++) {
  if (bodyBuf[i] !== 0) comp[i] = bodyBuf[i];
  if (headBuf[i] !== 0) comp[i] = headBuf[i];
}

const pngBuf = renderPNG(comp, PALETTES.ZOMBIE, renderOpts);
const src = PNG.sync.read(pngBuf);
const W = src.width * SCALE, H = src.height * SCALE;
const out = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const sx = Math.floor(x / SCALE), sy = Math.floor(y / SCALE);
    const so = (sy * src.width + sx) * 4, oo = (y * W + x) * 4;
    out.data[oo] = src.data[so];
    out.data[oo + 1] = src.data[so + 1];
    out.data[oo + 2] = src.data[so + 2];
    out.data[oo + 3] = src.data[so + 3];
  }
}

// checkerboard behind transparent pixels for visibility
const checker = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const c = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) ? 180 : 120;
    const o = (y * W + x) * 4;
    checker.data[o] = c; checker.data[o + 1] = c; checker.data[o + 2] = c; checker.data[o + 3] = 255;
  }
}
for (let i = 0; i < W * H; i++) {
  const o = i * 4;
  if (out.data[o + 3] > 0) {
    checker.data[o] = out.data[o];
    checker.data[o + 1] = out.data[o + 1];
    checker.data[o + 2] = out.data[o + 2];
    checker.data[o + 3] = 255;
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(checker));

// Count void pixels in socket/mouth regions
const regions = {
  "left-eye": (x, y) => x >= 20 && x <= 27 && y >= 24 && y <= 29,
  "right-eye": (x, y) => x >= 36 && x <= 43 && y >= 24 && y <= 29,
  mouth: (x, y) => x >= 26 && x <= 38 && y >= 32 && y <= 36,
};
for (const [name, pred] of Object.entries(regions)) {
  let voidPx = 0, maskDark = 0, paleBone = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!pred(x, y)) continue;
      const flat = y * GRID + x;
      const idx = comp[flat];
      const o = flat * 4;
      const a = src.data[o + 3];
      if (a === 0 || idx === 0) voidPx++;
      else if (idx === 1) maskDark++;
      else if ([11, 12, 13].includes(idx)) paleBone++;
    }
  }
  console.log(`${name}: void/transparent=${voidPx}, mask_dark=${maskDark}, pale-bone(11-13)=${paleBone}`);
}
console.log(`Wrote ${OUT}`);
