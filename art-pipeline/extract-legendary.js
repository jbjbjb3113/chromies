// ============================================================================
// extract-legendary.js
// Convert any source image to a 64×64 palette-indexed component PNG for
// components/legendary/ (Normie Legendary head assets and similar 1/1 art).
//
// Usage:
//   node extract-legendary.js --input path/to/source.png --output components/legendary/NORMIE_0045_Snowfro.png --palette SIGNAL
//   node extract-legendary.js --input path/to/source.png --output components/legendary/NORMIE_0603_ACK.png --palette NORMIE_ACK --fit contain
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, ROLES, SETTINGS } = require("./chromies-config");
const { guardedWriteFileSync } = require("./lib/art-safety");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;
const DEFAULT_PALETTE = "SIGNAL";
const DEFAULT_FIT = "cover";
const FIT_MODES = new Set(["cover", "contain", "stretch"]);
const BG_THRESHOLD = SETTINGS.bgKnockoutThreshold;

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    input: null,
    output: null,
    palette: DEFAULT_PALETTE,
    fit: DEFAULT_FIT,
    help: false,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      result.help = true;
      continue;
    }
    if (a === "--input" || a === "-i") {
      result.input = args[++i];
      continue;
    }
    if (a === "--output" || a === "-o") {
      result.output = args[++i];
      continue;
    }
    if (a === "--palette" || a === "-p") {
      result.palette = args[++i].toUpperCase();
      continue;
    }
    if (a === "--fit") {
      result.fit = args[++i].toLowerCase();
      continue;
    }
    if (a === "--force") {
      result.force = true;
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }

  if (!result.help && (!result.input || !result.output)) result.help = true;
  return result;
}

function printUsage() {
  console.log(`Usage:
  node extract-legendary.js --input <source.png> --output <dest.png> [options]

Options:
  --palette, -p   Palette key (default: SIGNAL). e.g. SIGNAL, NORMIE_ACK, NORMIE_SNOWFRO
  --fit           Resize mode: cover | contain | stretch (default: cover)
  --force         Allow writes under components/ (required; legendary heads also need manifest update)

Examples:
  node extract-legendary.js --input art/snowfro.png --output components/legendary/NORMIE_0045_Snowfro.png --palette SIGNAL
  node extract-legendary.js --input art/ack.png --output components/legendary/NORMIE_0603_ACK.png --palette NORMIE_ACK --fit contain`);
}

function resolvePath(inputPath) {
  const candidates = [
    inputPath,
    path.join(process.cwd(), inputPath),
    path.join(__dirname, inputPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.resolve(candidate);
  }
  throw new Error(`File not found: ${inputPath}`);
}

function resolveOutputPath(outputPath) {
  return path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(process.cwd(), outputPath);
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function loadSourcePng(filePath) {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  return png;
}

function sampleRgba(png, x, y) {
  const sx = Math.max(0, Math.min(png.width - 1, Math.floor(x)));
  const sy = Math.max(0, Math.min(png.height - 1, Math.floor(y)));
  const i = (sy * png.width + sx) * 4;
  return {
    r: png.data[i],
    g: png.data[i + 1],
    b: png.data[i + 2],
    a: png.data[i + 3],
  };
}

function isTransparentPixel(r, g, b, a) {
  if (a === 0) return true;
  return a <= BG_THRESHOLD && r <= BG_THRESHOLD && g <= BG_THRESHOLD && b <= BG_THRESHOLD;
}

function buildSampleMapping(fit, srcW, srcH) {
  if (fit === "stretch") {
    return (x, y) => ({
      sx: (x + 0.5) * srcW / GRID - 0.5,
      sy: (y + 0.5) * srcH / GRID - 0.5,
      visible: true,
    });
  }

  const scale = fit === "cover"
    ? Math.max(GRID / srcW, GRID / srcH)
    : Math.min(GRID / srcW, GRID / srcH);

  const scaledW = srcW * scale;
  const scaledH = srcH * scale;
  const offsetX = (GRID - scaledW) / 2;
  const offsetY = (GRID - scaledH) / 2;

  return (x, y) => {
    const sx = (x - offsetX + 0.5) / scale - 0.5;
    const sy = (y - offsetY + 0.5) / scale - 0.5;
    const visible = sx >= 0 && sy >= 0 && sx < srcW && sy < srcH;
    return { sx, sy, visible };
  };
}

function resizeToGrid(png, fit) {
  const map = buildSampleMapping(fit, png.width, png.height);
  const rgba = new Uint8Array(PX * 4);

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const flat = y * GRID + x;
      const off = flat * 4;
      const { sx, sy, visible } = map(x, y);

      if (!visible) {
        rgba[off] = 0;
        rgba[off + 1] = 0;
        rgba[off + 2] = 0;
        rgba[off + 3] = 0;
        continue;
      }

      const px = sampleRgba(png, sx, sy);
      rgba[off] = px.r;
      rgba[off + 1] = px.g;
      rgba[off + 2] = px.b;
      rgba[off + 3] = px.a;
    }
  }

  return rgba;
}

function buildPaletteTargets(paletteKey) {
  const palette = PALETTES[paletteKey];
  if (!palette?.colors || palette.colors.length !== 16) {
    throw new Error(`Palette "${paletteKey}" not defined or does not have 16 colors`);
  }
  return palette.colors.map((hex, index) => ({
    index,
    hex,
    rgb: hexToRgb(hex),
    role: ROLES[index] || "?",
  }));
}

function quantizeRgbaGrid(rgba, targets) {
  const buf = new Uint8Array(PX);
  const counts = new Array(16).fill(0);

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const flat = y * GRID + x;
      const off = flat * 4;
      const r = rgba[off];
      const g = rgba[off + 1];
      const b = rgba[off + 2];
      const a = rgba[off + 3];

      if (isTransparentPixel(r, g, b, a)) {
        buf[flat] = 0;
        counts[0]++;
        continue;
      }

      let best = 0;
      let bestDist = Infinity;
      for (const tgt of targets) {
        const d = colorDistance([r, g, b], tgt.rgb);
        if (d < bestDist) {
          bestDist = d;
          best = tgt.index;
        }
      }
      buf[flat] = best;
      counts[best]++;
    }
  }

  return { buf, counts };
}

function writeIndexBufferPng(buf, paletteColors) {
  const png = new PNG({ width: GRID, height: GRID });
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const idx = buf[y * GRID + x];
      const off = (y * GRID + x) * 4;
      if (idx === 0) {
        png.data[off] = 0;
        png.data[off + 1] = 0;
        png.data[off + 2] = 0;
        png.data[off + 3] = 0;
        continue;
      }
      const [r, g, b] = hexToRgb(paletteColors[idx]);
      png.data[off] = r;
      png.data[off + 1] = g;
      png.data[off + 2] = b;
      png.data[off + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function printSummary({ inputAbs, outputAbs, paletteKey, fit, srcW, srcH, counts, targets }) {
  const nonBg = counts.slice(1).reduce((s, n) => s + n, 0);
  console.log(`Input:    ${path.basename(inputAbs)} (${srcW}×${srcH})`);
  console.log(`Output:   ${outputAbs}`);
  console.log(`Palette:  ${paletteKey}`);
  console.log(`Fit:      ${fit}`);
  console.log(`Pixels:   ${nonBg} drawn, ${counts[0]} background`);
  console.log();
  console.log("Index distribution:");
  for (let i = 0; i < 16; i++) {
    if (counts[i] === 0) continue;
    const tgt = targets[i];
    console.log(`  ${String(i).padStart(2, " ")}  ${tgt.hex}  ${tgt.role.padEnd(18)} ${counts[i]}`);
  }
}

function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    printUsage();
    process.exit(process.argv.length <= 3 ? 0 : 1);
  }

  if (!FIT_MODES.has(parsed.fit)) {
    throw new Error(`Invalid --fit "${parsed.fit}" — expected cover, contain, or stretch`);
  }

  const inputAbs = resolvePath(parsed.input);
  const outputAbs = resolveOutputPath(parsed.output);
  const targets = buildPaletteTargets(parsed.palette);
  const paletteColors = targets.map((t) => t.hex);

  const source = loadSourcePng(inputAbs);
  const rgba = resizeToGrid(source, parsed.fit);
  const { buf, counts } = quantizeRgbaGrid(rgba, targets);

  const outDir = path.dirname(outputAbs);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  guardedWriteFileSync(outputAbs, writeIndexBufferPng(buf, paletteColors), { force: parsed.force });

  printSummary({
    inputAbs,
    outputAbs,
    paletteKey: parsed.palette,
    fit: parsed.fit,
    srcW: source.width,
    srcH: source.height,
    counts,
    targets,
  });
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

module.exports = {
  buildSampleMapping,
  quantizeRgbaGrid,
  resizeToGrid,
  writeIndexBufferPng,
};
