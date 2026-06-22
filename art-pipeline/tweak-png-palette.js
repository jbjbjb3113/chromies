// ============================================================================
// tweak-png-palette.js
// Apply coordinate-level palette index patches to a 64×64 component PNG.
//
// Usage:
//   node tweak-png-palette.js components/HEAD_Female_Test.png patches/head-female-v2.json --output components/HEAD_Female_v2.png
//
// Patch JSON format — keys are "x,y", values are palette index 0-15:
//   { "29,34": 4, "30,34": 5, "31,34": 0 }
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { PALETTES, ROLES, SETTINGS } = require("./chromies-config");
const { extractToBuffer } = require("./generate");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;
const DEFAULT_PALETTE = "SIGNAL";

function parseArgs(argv) {
  const args = argv.slice(2);
  let inputPath = null;
  let patchPath = null;
  let outputPath = null;
  let paletteKey = DEFAULT_PALETTE;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--output" || a === "-o") {
      outputPath = args[++i];
      continue;
    }
    if (a === "--palette" || a === "-p") {
      paletteKey = args[++i].toUpperCase();
      continue;
    }
    if (a.startsWith("-")) throw new Error(`Unknown argument: ${a}`);
    if (!inputPath) inputPath = a;
    else if (!patchPath) patchPath = a;
    else throw new Error(`Unexpected positional argument: ${a}`);
  }

  if (!inputPath || !patchPath || !outputPath) return { help: true };
  return { inputPath, patchPath, outputPath, paletteKey };
}

function printUsage() {
  console.log(`Usage:
  node tweak-png-palette.js <input.png> <patch.json> --output <output.png> [--palette SIGNAL]

Patch JSON:
  { "x,y": newIndex, ... }   — newIndex is palette index 0-15 (0 = transparent)

Example:
  node tweak-png-palette.js components/HEAD_Female_Test.png patches/head-female-v2.json --output components/HEAD_Female_v2.png`);
}

function resolvePath(inputPath, { componentsFallback = false } = {}) {
  const candidates = [
    inputPath,
    path.join(process.cwd(), inputPath),
    path.join(__dirname, inputPath),
  ];
  if (componentsFallback) {
    candidates.push(path.join(__dirname, SETTINGS.componentsDir, path.basename(inputPath)));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.resolve(candidate);
  }
  throw new Error(`File not found: ${inputPath}`);
}

function findSlotForFile(traits, basename) {
  for (const [slot, slotDef] of Object.entries(traits.slots)) {
    for (const variant of slotDef.variants || []) {
      if (variant.file === basename || path.basename(variant.file) === basename) {
        return { slot, drawColors: slotDef.drawColors };
      }
    }
  }

  const prefix = basename.split("_")[0];
  const prefixToSlot = {
    HOOD: "hood",
    SHIRT: "shirt",
    BODY: "body",
    BODYTATTOO: "bodytattoo",
    NECKLACE: "necklace",
    NECK: "neck",
    HEAD: "head",
    TATTOO: "tattoo",
    MASK: "mask",
    BEARD: "beard",
    MUSTACHE: "mustache",
    EYES: "eyes",
    EXPRESSION: "expression",
    EARRINGS: "earrings",
    GLASSES: "glasses",
    HAIR: "hair",
    SP: null,
  };

  if (prefix === "SP") {
    const rest = basename.slice(3);
    const spPrefix = rest.split("_")[0];
    const spMap = {
      HOOD: "hood",
      SHIRT: "shirt",
      HEAD: "head",
      HAIR: "hair",
      GLASSES: "glasses",
    };
    const slot = spMap[spPrefix];
    if (slot && traits.slots[slot]) {
      return { slot, drawColors: traits.slots[slot].drawColors };
    }
  }

  const slot = prefixToSlot[prefix];
  if (slot && traits.slots[slot]) {
    return { slot, drawColors: traits.slots[slot].drawColors };
  }

  throw new Error(
    `Could not resolve slot for "${basename}". Add the file to traits.json or use a known component prefix.`,
  );
}

function buildIndexColorMap(drawColors, paletteKey) {
  const palette = PALETTES[paletteKey];
  if (!palette?.colors) {
    throw new Error(`Palette "${paletteKey}" not defined in chromies-config.js`);
  }

  const roleToHex = {};
  for (const [hex, role] of Object.entries(drawColors)) {
    roleToHex[role] = hex.toLowerCase();
  }

  const map = new Array(16);
  for (let i = 0; i < 16; i++) {
    const role = ROLES[i];
    map[i] = (role && roleToHex[role]) || palette.colors[i].toLowerCase();
  }
  return map;
}

function parsePatchFile(patchPath) {
  const raw = JSON.parse(fs.readFileSync(patchPath, "utf8"));
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Patch file must be a JSON object");
  }

  const entries = [];
  for (const [key, value] of Object.entries(raw)) {
    const parts = key.split(",").map((s) => s.trim());
    if (parts.length !== 2) {
      throw new Error(`Invalid patch key "${key}" — expected "x,y"`);
    }
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error(`Invalid coordinates in "${key}"`);
    }
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) {
      throw new Error(`Coordinate out of range in "${key}" (grid is ${GRID}×${GRID})`);
    }
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index > 15) {
      throw new Error(`Invalid index ${value} for "${key}" — must be integer 0-15`);
    }
    entries.push({ x, y, index });
  }
  return entries;
}

function applyPatch(buf, entries) {
  const changed = [];
  for (const { x, y, index } of entries) {
    const flat = y * GRID + x;
    const before = buf[flat];
    buf[flat] = index;
    changed.push({ x, y, before, after: index });
  }
  return changed;
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function writeIndexBufferPng(buf, indexColorMap) {
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
      const [r, g, b] = hexToRgb(indexColorMap[idx]);
      png.data[off] = r;
      png.data[off + 1] = g;
      png.data[off + 2] = b;
      png.data[off + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    printUsage();
    process.exit(process.argv.length <= 3 ? 0 : 1);
  }

  const inputAbs = resolvePath(parsed.inputPath, { componentsFallback: true });
  const patchAbs = resolvePath(parsed.patchPath);
  const outputAbs = path.isAbsolute(parsed.outputPath)
    ? parsed.outputPath
    : path.resolve(process.cwd(), parsed.outputPath);

  const basename = path.basename(inputAbs);
  const traits = JSON.parse(fs.readFileSync(path.join(__dirname, SETTINGS.traitsFile), "utf8"));
  const { slot, drawColors } = findSlotForFile(traits, basename);
  const indexColorMap = buildIndexColorMap(drawColors, parsed.paletteKey);

  const buf = extractToBuffer(inputAbs, drawColors);
  if (!buf) throw new Error(`Failed to read ${inputAbs}`);

  const entries = parsePatchFile(patchAbs);
  const changed = applyPatch(buf, entries);

  const outDir = path.dirname(outputAbs);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputAbs, writeIndexBufferPng(buf, indexColorMap));

  console.log(`Input:   ${basename} (${slot})`);
  console.log(`Patch:   ${path.basename(patchAbs)} (${entries.length} pixel${entries.length === 1 ? "" : "s"})`);
  console.log(`Output:  ${outputAbs}`);
  console.log(`Palette: ${parsed.paletteKey}`);
  console.log();
  for (const { x, y, before, after } of changed) {
    const hex = after === 0 ? "transparent" : indexColorMap[after];
    console.log(`  (${x},${y}): ${before} → ${after}  ${hex}`);
  }
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
