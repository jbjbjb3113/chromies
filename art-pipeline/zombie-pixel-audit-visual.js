// Side-by-side: source PNG RGB vs pipeline index render
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS } = require("./chromies-config");
const { extractToBuffer, renderPNG, resolveExtractionDrawColors } = require("./generate");
const { CHARACTERS } = require("./chromies-config");

const ZOMBIE_CHAR = CHARACTERS.find((c) => c.name === "Zombie");

const traits = JSON.parse(fs.readFileSync(path.join(__dirname, "traits.json"), "utf8"));
const GRID = SETTINGS.grid;
const SCALE = 8;
const OUT = path.join(SETTINGS.outputDir, "review", "zombie-pixel-audit.png");

function rawRgbPng(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const out = new PNG({ width: png.width, height: png.height });
  const t = SETTINGS.bgKnockoutThreshold;
  for (let i = 0; i < png.width * png.height; i++) {
    const si = i * 4, r = png.data[si], g = png.data[si + 1], b = png.data[si + 2], a = png.data[si + 3];
    if (a === 0 || (r <= t && g <= t && b <= t)) {
      out.data[si] = 0; out.data[si + 1] = 0; out.data[si + 2] = 0; out.data[si + 3] = 255;
    } else {
      out.data[si] = r; out.data[si + 1] = g; out.data[si + 2] = b; out.data[si + 3] = 255;
    }
  }
  return PNG.sync.write(out);
}

function upscale(buf, scale) {
  const src = PNG.sync.read(buf);
  const W = src.width * scale, H = src.height * scale;
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / scale), sy = Math.floor(y / scale);
      const so = (sy * src.width + sx) * 4, oo = (y * W + x) * 4;
      out.data[oo] = src.data[so]; out.data[oo + 1] = src.data[so + 1];
      out.data[oo + 2] = src.data[so + 2]; out.data[oo + 3] = 255;
    }
  }
  return PNG.sync.write(out);
}

const headFile = path.join(SETTINGS.componentsDir, "zombie/HEAD_Zombie.png");
const bodyFile = path.join(SETTINGS.componentsDir, "zombie/BODY_Zombie.png");
const headPick = { variant: { name: "Zombie" } };
const bodyPick = { variant: { name: "Zombie" } };
const headDraw = resolveExtractionDrawColors("head", headPick, ZOMBIE_CHAR, traits.slots.head);
const bodyDraw = resolveExtractionDrawColors("body", bodyPick, ZOMBIE_CHAR, traits.slots.body);
const zombieExtractOpts = { skipRgbKnockout: true };
const headBuf = extractToBuffer(headFile, headDraw, zombieExtractOpts);
const bodyBuf = extractToBuffer(bodyFile, bodyDraw, zombieExtractOpts);

// composite head+body only
const comp = new Uint8Array(GRID * GRID);
for (let i = 0; i < comp.length; i++) {
  if (bodyBuf[i] !== 0) comp[i] = bodyBuf[i];
  if (headBuf[i] !== 0) comp[i] = headBuf[i];
}

const zombieRenderOpts = { transparentIndex0: true };
const pipelinePng = renderPNG(comp, PALETTES.ZOMBIE, zombieRenderOpts);
const rawHead = rawRgbPng(headFile);
const rawBody = rawRgbPng(bodyFile);

// stitch 2x2: raw head | pipeline head, raw body | pipeline body
const rawHeadP = PNG.sync.read(rawHead);
const rawBodyP = PNG.sync.read(rawBody);
const pipeHeadP = PNG.sync.read(renderPNG(headBuf, PALETTES.ZOMBIE, zombieRenderOpts));
const pipeBodyP = PNG.sync.read(renderPNG(bodyBuf, PALETTES.ZOMBIE, zombieRenderOpts));

const pad = 4;
const W = rawHeadP.width * 2 + pad * 3;
const H = rawHeadP.height * 2 + pad * 3;
const sheet = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) {
  const o = i * 4;
  sheet.data[o] = 40; sheet.data[o + 1] = 40; sheet.data[o + 2] = 40; sheet.data[o + 3] = 255;
}
function blit(src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const so = (y * src.width + x) * 4;
      const oo = ((dy + y) * W + (dx + x)) * 4;
      sheet.data[oo] = src.data[so]; sheet.data[oo + 1] = src.data[so + 1];
      sheet.data[oo + 2] = src.data[so + 2]; sheet.data[oo + 3] = 255;
    }
  }
}
blit(rawHeadP, pad, pad);
blit(pipeHeadP, pad * 2 + rawHeadP.width, pad);
blit(rawBodyP, pad, pad * 2 + rawHeadP.height);
blit(pipeBodyP, pad * 2 + rawHeadP.width, pad * 2 + rawHeadP.height);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(sheet));
console.log("Wrote", OUT);
