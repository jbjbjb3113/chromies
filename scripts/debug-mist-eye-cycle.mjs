/**
 * Diagnostic: mist eye-cycle patches vs live/canonical pixels at eye coords.
 * Usage: node scripts/debug-mist-eye-cycle.mjs
 */
import fs from "fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { unpackPixelIndicesFromHex } from "../src/lib/pixel-canvas.js";

const patches = JSON.parse(
  fs.readFileSync("src/pages/AwakenDemo/mist-eye-patches.json", "utf8"),
);
const mint = JSON.parse(fs.readFileSync("public/data/mint-data.json", "utf8"));
const record = mint.find((r) => r.tokenId === 1);

function rgbaAt(data, width, x, y) {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function renderCanonicalPng64() {
  // Use exported mockup if present, else decode from mint via simple approach:
  // Read reports PNG
  const mockup = "reports/robinhood/mockup/token1_native.png";
  if (fs.existsSync(mockup)) return mockup;
  return null;
}

function diffPixels(before, after, coords) {
  let changed = 0;
  const samples = [];
  for (const [x, y] of coords) {
    const b = rgbaAt(before, 64, x, y);
    const a = rgbaAt(after, 64, x, y);
    if (b.join() !== a.join()) {
      changed++;
      samples.push({ x, y, before: b, after: a });
    }
  }
  return { changed, samples };
}

async function samplePng(path) {
  const img = await loadImage(path);
  const c = createCanvas(64, 64);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, 64, 64);
  return ctx.getImageData(0, 0, 64, 64).data;
}

function paintVariant(baseData, variantName) {
  const out = new Uint8ClampedArray(baseData);
  const pixels = patches.variants[variantName];
  for (const { x, y, rgba } of pixels) {
    const i = (y * 64 + x) * 4;
    out[i] = rgba[0];
    out[i + 1] = rgba[1];
    out[i + 2] = rgba[2];
    out[i + 3] = rgba[3];
  }
  return out;
}

function simulateTimer(seconds = 90) {
  const events = [];
  const state = {
    activeVariant: null,
    holdUntilFrame: 0,
    nextCycleAtMs: 5000, // start sooner for sim
  };
  const minIntervalMs = 5000;
  const maxIntervalMs = 10000;
  const holdFrames = 24;
  const fps = 12;

  function schedule() {
    return minIntervalMs + Math.random() * (maxIntervalMs - minIntervalMs);
  }
  state.nextCycleAtMs = schedule();

  const pool = Object.keys(patches.variants);
  for (let ms = 0; ms <= seconds * 1000; ms += 1000 / fps) {
    const frame = Math.floor(ms / (1000 / fps));
    const prev = state.activeVariant;
    if (!state.activeVariant && ms >= state.nextCycleAtMs) {
      state.activeVariant = pool[Math.floor(Math.random() * pool.length)];
      state.holdUntilFrame = frame + holdFrames;
      events.push({ type: "start", ms, frame, variant: state.activeVariant });
    } else if (state.activeVariant && frame >= state.holdUntilFrame) {
      events.push({ type: "end", ms, frame, variant: state.activeVariant });
      state.activeVariant = null;
      state.nextCycleAtMs = ms + schedule();
    }
    if (prev !== state.activeVariant && state.activeVariant && prev) {
      /* noop */
    }
  }
  return events;
}

console.log("=== CHECK 2: patch pixel distinctness vs baseline ===");
const baseline = patches.baselinePixels;
for (const [name, px] of Object.entries(patches.variants)) {
  let diffs = 0;
  const examples = [];
  for (const p of px) {
    const b = baseline.find((q) => q.x === p.x && q.y === p.y);
    const baseRgba = b?.rgba ?? null;
    if (!baseRgba || baseRgba.join() !== p.rgba.join()) {
      diffs++;
      if (examples.length < 3) examples.push({ coord: [p.x, p.y], base: baseRgba, variant: p.rgba });
    }
  }
  console.log(`${name}: ${diffs}/${px.length} pixels differ from baseline`, examples);
}

console.log("\n=== CHECK 1: timer simulation (5-10s intervals, 90s) ===");
const events = simulateTimer(90);
console.log(`events: ${events.length}`);
for (const e of events) console.log(e);

console.log("\n=== CHECK 4/5: canonical PNG path ===");
const pngPath = renderCanonicalPng64();
if (!pngPath) {
  console.log("No reports/robinhood/mockup/token1_native.png — checking baselinePixels only");
  console.log("baseline at eye coords:", baseline);
} else {
  const baseData = await samplePng(pngPath);
  const coords = patches.maskCoords;
  console.log("Live/canonical PNG pixels at eye coords:");
  for (const [x, y] of coords) {
    const live = rgbaAt(baseData, 64, x, y);
    const patch = baseline.find((p) => p.x === x && p.y === y)?.rgba;
    console.log(`  (${x},${y}) live=${JSON.stringify(live)} patch-baseline=${JSON.stringify(patch)}`);
  }

  console.log("\n=== CHECK 3/5: forced Chubby_CrossEyed pixel diff on canonical PNG ===");
  const forced = paintVariant(baseData, "Chubby_CrossEyed");
  const { changed, samples } = diffPixels(baseData, forced, coords.filter(([x]) => x !== 29));
  console.log(`changed pixels: ${changed}/8`, samples);

  const forcedStoned = paintVariant(baseData, "Chubby_Stoned");
  const stonedDiff = diffPixels(baseData, forcedStoned, coords.filter(([x]) => x !== 29));
  console.log("Chubby_Stoned changed:", stonedDiff.changed, stonedDiff.samples.slice(0, 4));
}

// mint-data grid at eye coords (role indices)
const grid = unpackPixelIndicesFromHex(record.pixelsHex);
console.log("\n=== mint-data role indices at eye coords ===");
for (const [x, y] of patches.maskCoords) {
  console.log(`  (${x},${y}) role=${grid[y * 64 + x]}`);
}
