// ============================================================================
// inspect-png-palette.js
// Inspect a 64×64 component PNG: palette reference, index grid, per-index counts.
//
// Usage:
//   node inspect-png-palette.js components/male/HEAD_HeroA.png
//   node inspect-png-palette.js components/EXPRESSION_Smile.png
//   node inspect-png-palette.js path/to/file.png --palette ACID
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PALETTES, ROLES, SETTINGS } = require("./chromies-config");
const { extractToBuffer } = require("./generate");

const GRID = SETTINGS.grid;
const DEFAULT_PALETTE = "SIGNAL";

function parseArgs(argv) {
  const args = argv.slice(2);
  let filePath = null;
  let paletteKey = DEFAULT_PALETTE;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--palette" || a === "-p") {
      paletteKey = args[++i].toUpperCase();
      continue;
    }
    if (!a.startsWith("-") && !filePath) filePath = a;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!filePath) return { help: true };
  return { filePath, paletteKey };
}

function printUsage() {
  console.log(`Usage:
  node inspect-png-palette.js <png-path> [--palette SIGNAL]

Examples:
  node inspect-png-palette.js components/male/HEAD_HeroA.png
  node inspect-png-palette.js components/EXPRESSION_Smile.png --palette ACID`);
}

const COMPONENT_SUBDIRS = ["", "female", "male", "sideprofile", "chubby"];

function resolveInComponentsDir(basename) {
  for (const sub of COMPONENT_SUBDIRS) {
    const candidate = path.join(__dirname, SETTINGS.componentsDir, sub, basename);
    if (fs.existsSync(candidate)) return path.resolve(candidate);
  }
  return null;
}

function resolveInputPath(inputPath) {
  const candidates = [
    inputPath,
    path.join(process.cwd(), inputPath),
    path.join(__dirname, inputPath),
  ];
  const basename = path.basename(inputPath);
  const inComponents = resolveInComponentsDir(basename);
  if (inComponents) candidates.push(inComponents);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.resolve(candidate);
  }
  throw new Error(`PNG not found: ${inputPath}`);
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
    `Could not resolve slot for "${basename}". Add the file to traits.json or pass a known component name.`,
  );
}

function indexToHexChar(index) {
  return index.toString(16);
}

function printPaletteTable(paletteKey) {
  const palette = PALETTES[paletteKey];
  if (!palette?.colors) {
    throw new Error(`Palette "${paletteKey}" not defined in chromies-config.js`);
  }
  console.log(`Palette (${paletteKey}) — index → hex → role`);
  console.log("─".repeat(52));
  for (let i = 0; i < 16; i++) {
    const hex = palette.colors[i];
    const role = ROLES[i] || "?";
    console.log(`  ${String(i).padStart(2, " ")}  ${hex}  ${role}`);
  }
  console.log();
}

function printGrid(buf) {
  console.log(`Grid (${GRID}×${GRID}) — palette index per pixel (hex digit 0-f)`);
  console.log("─".repeat(52));
  for (let y = 0; y < GRID; y++) {
    let row = "";
    for (let x = 0; x < GRID; x++) {
      row += indexToHexChar(buf[y * GRID + x]);
    }
    console.log(row);
  }
  console.log();
}

function printCounts(buf) {
  const counts = new Array(16).fill(0);
  for (let i = 0; i < buf.length; i++) counts[buf[i]]++;

  console.log("Pixel counts by index");
  console.log("─".repeat(52));
  for (let i = 0; i < 16; i++) {
    if (counts[i] === 0) continue;
    const role = ROLES[i] || "?";
    console.log(`  ${String(i).padStart(2, " ")} (${indexToHexChar(i)}): ${counts[i]}  ${role}`);
  }
  console.log(`  total non-background: ${counts.slice(1).reduce((s, n) => s + n, 0)}`);
  console.log(`  background (0):       ${counts[0]}`);
}

function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    printUsage();
    process.exit(parsed.help && process.argv.length <= 3 ? 0 : 1);
  }

  const absPath = resolveInputPath(parsed.filePath);
  const basename = path.basename(absPath);
  const traits = JSON.parse(fs.readFileSync(path.join(__dirname, SETTINGS.traitsFile), "utf8"));
  const { slot, drawColors } = findSlotForFile(traits, basename);

  const buf = extractToBuffer(absPath, drawColors);
  if (!buf) {
    throw new Error(`Failed to read or extract pixels from ${absPath}`);
  }

  console.log(`File:  ${basename}`);
  console.log(`Path:  ${absPath}`);
  console.log(`Slot:  ${slot}`);
  console.log();

  printPaletteTable(parsed.paletteKey);
  printGrid(buf);
  printCounts(buf);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
