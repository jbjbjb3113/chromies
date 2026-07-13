// Spot-check: non-Zombie characters unchanged after Zombie-only fixes.
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, SETTINGS, CHARACTERS } = require("./chromies-config");
const {
  pickTokenVariants,
  loadPickBuffers,
  applyCoverageRules,
  compositeChromie,
  renderPNG,
  extractToBuffer,
  pickPalette,
} = require("./generate");

const traits = JSON.parse(fs.readFileSync(SETTINGS.traitsFile, "utf8"));
const GRID = SETTINGS.grid;
const PX = GRID * GRID;
const OUT = path.join(SETTINGS.outputDir, "review", "zombie-fix-spotcheck.png");
const TOKEN_ID = 42;

function bufFingerprint(buf) {
  let h = 0;
  for (let i = 0; i < buf.length; i++) h = (h * 31 + buf[i]) >>> 0;
  return h.toString(16);
}

function countIndex0Alpha(pngBuf) {
  const png = PNG.sync.read(pngBuf);
  let idx0 = 0, transparent = 0, opaqueBg = 0;
  for (let i = 0; i < PX; i++) {
    const off = i * 4;
    const a = png.data[off + 3];
    if (a === 0) transparent++;
    else if (png.data[off] === 0xe3 && png.data[off + 1] === 0xe5 && png.data[off + 2] === 0xe4) opaqueBg++;
  }
  return { transparent, opaqueBg, total: PX };
}

function findCharacter(name, gender = null) {
  if (gender) return CHARACTERS.find((c) => c.name === name && c.gender === gender);
  return CHARACTERS.find((c) => c.name === name);
}

function renderCharacter(name, gender = null) {
  const character = findCharacter(name, gender);
  if (!character) throw new Error(`Character not found: ${name}`);
  const picks = pickTokenVariants(TOKEN_ID, traits, new Set(), character, false);
  loadPickBuffers(picks, traits, character);
  const renderPicks = applyCoverageRules(picks, traits, character);
  const paletteKey = pickPalette(TOKEN_ID, character);
  const palette = PALETTES[paletteKey];
  const buf = compositeChromie(renderPicks, traits, TOKEN_ID, null, null);
  const defaultPng = renderPNG(buf, palette, character.name === "Zombie" ? { transparentIndex0: true } : undefined);
  const zombieStylePng = renderPNG(buf, palette, { transparentIndex0: true });
  return { character, buf, paletteKey, defaultPng, zombieStylePng };
}

function upscale(buf, scale) {
  const src = PNG.sync.read(buf);
  const W = src.width * scale, H = src.height * scale;
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / scale), sy = Math.floor(y / scale);
      const so = (sy * src.width + sx) * 4, oo = (y * W + x) * 4;
      out.data[oo] = src.data[so];
      out.data[oo + 1] = src.data[so + 1];
      out.data[oo + 2] = src.data[so + 2];
      out.data[oo + 3] = src.data[so + 3];
    }
  }
  return PNG.sync.write(out);
}

const names = [
  { name: "HeroA", gender: "Male" },
  { name: "Cat" },
  { name: "Alien" },
  { name: "Zombie" },
];
const results = [];

for (const spec of names) {
  const r = renderCharacter(spec.name, spec.gender ?? null);
  const label = spec.gender ? `${spec.name}_${spec.gender}` : spec.name;
  const fp = bufFingerprint(r.buf);
  const defAlpha = countIndex0Alpha(r.defaultPng);
  const zomAlpha = countIndex0Alpha(r.zombieStylePng);
  const identical = Buffer.compare(r.defaultPng, r.zombieStylePng) === 0;
  results.push({ name: label, fp, palette: r.paletteKey, defAlpha, zomAlpha, identical, defaultPng: r.defaultPng });
  console.log(`${label}: buf=${fp} palette=${r.paletteKey}`);
  console.log(`  default render: transparent=${defAlpha.transparent} opaque-bg=#e3e5e4-ish=${defAlpha.opaqueBg}`);
  console.log(`  zombie-style render: transparent=${zomAlpha.transparent} opaque-bg=${zomAlpha.opaqueBg}`);
  console.log(`  default === zombie-style PNG: ${identical}${spec.name !== "Zombie" ? (identical ? " OK" : " UNEXPECTED") : ""}`);
}

// HeroA head extraction still uses RGB knockout
const heroHead = path.join(SETTINGS.componentsDir, "HEAD_HeroA.png");
const heroBuf = extractToBuffer(heroHead, traits.slots.head.drawColors);
const heroIdx0 = [...heroBuf].filter((v) => v === 0).length;
console.log(`\nHeroA HEAD extractToBuffer index-0 count (RGB knockout active): ${heroIdx0}`);

// Stitch comparison sheet: HeroA / Cat / Alien / Zombie (default render only)
const SCALE = 6;
const tiles = results.map((r) => PNG.sync.read(upscale(r.defaultPng, SCALE)));
const pad = 8;
const W = tiles[0].width * 2 + pad * 3;
const H = tiles[0].height * 2 + pad * 3;
const sheet = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) {
  const o = i * 4;
  sheet.data[o] = 32; sheet.data[o + 1] = 32; sheet.data[o + 2] = 32; sheet.data[o + 3] = 255;
}
function blit(src, col, row) {
  const dx = pad + col * (tiles[0].width + pad);
  const dy = pad + row * (tiles[0].height + pad);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const so = (y * src.width + x) * 4;
      const oo = ((dy + y) * W + (dx + x)) * 4;
      sheet.data[oo] = src.data[so];
      sheet.data[oo + 1] = src.data[so + 1];
      sheet.data[oo + 2] = src.data[so + 2];
      sheet.data[oo + 3] = 255;
    }
  }
}
blit(tiles[0], 0, 0); // HeroA
blit(tiles[1], 1, 0); // Cat
blit(tiles[2], 0, 1); // Alien
blit(tiles[3], 1, 1); // Zombie (default path uses transparentIndex0 only in generate main — spotcheck uses default here)

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(sheet));
console.log(`\nWrote ${OUT}`);
