// ============================================================================
// extract-components.js
// Reads each component PNG, maps drawing colors -> role slots,
// saves a Uint8Array of slot indices (0..15) per component as JSON.
//
// USAGE:
//   node extract-components.js
//
// REQUIRES:
//   npm install pngjs
// ============================================================================

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { ROLES, COMPONENTS, SETTINGS } = require("./chromies-config");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;

// Hex string "#rrggbb" -> [r, g, b]
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Euclidean RGB distance — used to snap noisy pixels to the nearest declared draw color
function colorDistance(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

// Build the role-name -> slot-index lookup
const ROLE_INDEX = Object.fromEntries(ROLES.map((r, i) => [r, i]));

function extractComponent(componentName, componentDef) {
  const filePath = path.join(SETTINGS.componentsDir, componentDef.file);
  if (!fs.existsSync(filePath)) {
    console.log(`  [skip] ${componentName}: file not found (${componentDef.file})`);
    return null;
  }

  const png = PNG.sync.read(fs.readFileSync(filePath));
  if (png.width !== GRID || png.height !== GRID) {
    console.log(`  [WARN] ${componentName}: expected ${GRID}x${GRID}, got ${png.width}x${png.height} — skipping`);
    return null;
  }

  // Pre-compute the draw-color targets for fuzzy matching
  const targets = Object.entries(componentDef.drawColors).map(([hex, role]) => ({
    rgb: hexToRgb(hex),
    role,
    slotIndex: ROLE_INDEX[role],
  }));

  const buf = new Uint8Array(PX);   // all 0 = background by default
  let nonBg = 0;
  const unmatchedColors = new Map();

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = (y * GRID + x) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3];

      // background: alpha 0, or all channels at/below threshold (knocks out near-black if user used solid-bg export)
      const t = SETTINGS.bgKnockoutThreshold;
      if (a === 0 || (r <= t && g <= t && b <= t)) continue;

      // find closest declared draw color
      let best = null, bestDist = Infinity;
      for (const tgt of targets) {
        const d = colorDistance([r, g, b], tgt.rgb);
        if (d < bestDist) { bestDist = d; best = tgt; }
      }

      // if closest match is more than ~30 units away per channel (squared ~2700),
      // log it as unmatched (likely Aseprite anti-aliasing or unexpected color)
      if (bestDist > 2700) {
        const key = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
        unmatchedColors.set(key, (unmatchedColors.get(key) || 0) + 1);
      }

      buf[y * GRID + x] = best.slotIndex;
      nonBg++;
    }
  }

  if (unmatchedColors.size > 0) {
    console.log(`  [warn] ${componentName}: ${unmatchedColors.size} color(s) had to be approximated:`);
    for (const [hex, n] of unmatchedColors) {
      console.log(`         ${hex} appeared ${n}px — snapped to closest declared role`);
    }
  }

  console.log(`  [ok]   ${componentName}: ${nonBg} non-bg pixels mapped (${componentDef.file})`);
  return {
    name: componentName,
    zOrder: componentDef.zOrder,
    file: componentDef.file,
    pixels: Array.from(buf),     // JSON-safe
  };
}

function main() {
  if (!fs.existsSync(SETTINGS.componentsDir)) {
    console.error(`components dir not found: ${SETTINGS.componentsDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(SETTINGS.outputDir)) fs.mkdirSync(SETTINGS.outputDir, { recursive: true });

  console.log(`extracting components from ${SETTINGS.componentsDir}\n`);
  const out = {};
  for (const [name, def] of Object.entries(COMPONENTS)) {
    const data = extractComponent(name, def);
    if (data) out[name] = data;
  }

  const outPath = path.join(SETTINGS.outputDir, "components-data.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${Object.keys(out).length} components -> ${outPath}`);
}

main();
