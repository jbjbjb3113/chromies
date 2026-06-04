// ============================================================================
// render-chromie.js
// Composites component layers in z-order, applies a palette family,
// outputs the final Chromie as PNG and SVG (matches on-chain renderer logic).
//
// USAGE:
//   node render-chromie.js                          # SIGNAL palette, all components
//   node render-chromie.js ACID                     # ACID palette
//   node render-chromie.js SIGNAL hero              # adds "_hero" suffix to outputs
//   node render-chromie.js SIGNAL --skip glasses    # skip the glasses layer
//   node render-chromie.js SIGNAL --skip=glasses,hair no_shades   # skip multiple, with suffix
//
// OUTPUTS to ./output:
//   chromie_<palette>[_name].png   (64x64, true on-chain resolution)
//   chromie_<palette>[_name]_1024.png  (upscaled with nearest-neighbor for viewing)
//   chromie_<palette>[_name].svg   (the exact format the on-chain renderer emits)
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { ROLES, PALETTES, COMPONENTS, SETTINGS } = require("./chromies-config");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;

function loadComponentsData() {
  const p = path.join(SETTINGS.outputDir, "components-data.json");
  if (!fs.existsSync(p)) {
    console.error(`components-data.json not found. Run 'node extract-components.js' first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Composite components onto a single 64x64 buffer in z-order.
function compositeChromie(componentsData) {
  const layers = Object.values(componentsData).sort((a, b) => a.zOrder - b.zOrder);
  const buf = new Uint8Array(PX);
  for (const layer of layers) {
    for (let i = 0; i < PX; i++) {
      const v = layer.pixels[i];
      if (v !== 0) buf[i] = v;
    }
  }
  return buf;
}

// RLE-optimized SVG renderer — same logic as the on-chain ChromaRenderer.
function renderSVG(buf, palette) {
  const cell = 1000 / GRID;
  let body = "";
  let rectCount = 0;
  for (let y = 0; y < GRID; y++) {
    let x = 0;
    while (x < GRID) {
      const idx = buf[y * GRID + x];
      let run = 1;
      while (x + run < GRID && buf[y * GRID + x + run] === idx) run++;
      if (idx !== 0) {
        body += `<rect x="${x * cell}" y="${y * cell}" width="${run * cell}" height="${cell}" fill="${palette.colors[idx]}"/>`;
        rectCount++;
      }
      x += run;
    }
  }
  const bg = palette.colors[0];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" shape-rendering="crispEdges"><rect width="1000" height="1000" fill="${bg}"/>${body}</svg>`;
  return { svg, rectCount };
}

function renderPNG(buf, palette) {
  const png = new PNG({ width: GRID, height: GRID });
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const idx = buf[y * GRID + x];
      const hex = palette.colors[idx];
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const off = (y * GRID + x) * 4;
      png.data[off] = r;
      png.data[off + 1] = g;
      png.data[off + 2] = b;
      png.data[off + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function upscalePNG(srcBuf, scale) {
  const src = PNG.sync.read(srcBuf);
  const W = src.width * scale, H = src.height * scale;
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / scale), sy = Math.floor(y / scale);
      const so = (sy * src.width + sx) * 4;
      const oo = (y * W + x) * 4;
      out.data[oo] = src.data[so];
      out.data[oo + 1] = src.data[so + 1];
      out.data[oo + 2] = src.data[so + 2];
      out.data[oo + 3] = src.data[so + 3];
    }
  }
  return PNG.sync.write(out);
}

function main() {
  const rawArgs = process.argv.slice(2);

  // Parse out --skip flags (--skip glasses, --skip=glasses,hair)
  const skipComponents = new Set();
  const positional = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === "--skip" && rawArgs[i + 1]) {
      rawArgs[i + 1].split(",").forEach(c => skipComponents.add(c.trim().toLowerCase()));
      i++;
    } else if (a.startsWith("--skip=")) {
      a.slice(7).split(",").forEach(c => skipComponents.add(c.trim().toLowerCase()));
    } else {
      positional.push(a);
    }
  }

  const paletteKey = (positional[0] || "SIGNAL").toUpperCase();
  const nameSuffix = positional[1] ? `_${positional[1]}` : "";

  if (skipComponents.size > 0) {
    console.log(`skipping components: ${[...skipComponents].join(", ")}`);
  }

  if (!PALETTES[paletteKey]) {
    console.error(`unknown palette: ${paletteKey}. available: ${Object.keys(PALETTES).join(", ")}`);
    process.exit(1);
  }
  const palette = PALETTES[paletteKey];
  if (!palette.colors) {
    console.error(`${paletteKey} palette colors not yet defined in chromies-config.js`);
    process.exit(1);
  }

  console.log(`rendering with palette: ${paletteKey} (${palette.description})`);

  const allComponentsData = loadComponentsData();
  const componentsData = Object.fromEntries(
    Object.entries(allComponentsData).filter(([name]) => !skipComponents.has(name.toLowerCase()))
  );
  const skippedCount = Object.keys(allComponentsData).length - Object.keys(componentsData).length;
  console.log(`loaded ${Object.keys(componentsData).length} components${skippedCount ? ` (${skippedCount} skipped)` : ""}`);

  const buf = compositeChromie(componentsData);

  const slotsUsed = new Set();
  for (let i = 0; i < PX; i++) slotsUsed.add(buf[i]);
  console.log(`composite uses slots: ${[...slotsUsed].sort((a,b)=>a-b).join(", ")}`);

  const baseName = `chromie_${paletteKey.toLowerCase()}${nameSuffix}`;

  const pngBuf = renderPNG(buf, palette);
  fs.writeFileSync(path.join(SETTINGS.outputDir, `${baseName}.png`), pngBuf);

  const upscaledBuf = upscalePNG(pngBuf, 16);
  fs.writeFileSync(path.join(SETTINGS.outputDir, `${baseName}_1024.png`), upscaledBuf);

  const { svg, rectCount } = renderSVG(buf, palette);
  fs.writeFileSync(path.join(SETTINGS.outputDir, `${baseName}.svg`), svg);

  console.log(`\nwrote:`);
  console.log(`  ${baseName}.png       (64x64, on-chain resolution)`);
  console.log(`  ${baseName}_1024.png  (upscaled for viewing)`);
  console.log(`  ${baseName}.svg       (${rectCount} rects, on-chain format)`);
}

main();