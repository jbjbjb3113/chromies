// ============================================================================
// phase3-variance.js
// Phase 3: Per-token visual variation. Three deterministic effects:
//   1. Drift Tier — every token rolls Pristine/Standard/Drifted/OffKilter
//   2. Component drift — variants shift by 0-3px per slot based on tier
//   3. Stray pixels — 0-5 pixels placed within the silhouette area
//
// All effects deterministic from token ID. Settings live in chromies-config.js
// under the PHASE3 export. Set PHASE3.enabled = false to disable entirely.
// ============================================================================

const { PHASE3, SETTINGS } = require("./chromies-config");

const GRID = SETTINGS.grid;
const PX = GRID * GRID;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromStr(s) {
  let seed = 0;
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) | 0;
  return seed;
}

function pickDriftTier(tokenId) {
  if (!PHASE3 || !PHASE3.enabled) {
    return { name: "Pristine", maxDrift: 0, strayMin: 0, strayMax: 0 };
  }
  const tiers = PHASE3.driftTiers || [];
  if (tiers.length === 0) {
    return { name: "Pristine", maxDrift: 0, strayMin: 0, strayMax: 0 };
  }
  const rng = mulberry32(seedFromStr(`${tokenId}:drift_tier`));
  const total = tiers.reduce((s, t) => s + (t.weight || 1), 0);
  let r = rng() * total;
  for (const t of tiers) {
    r -= (t.weight || 1);
    if (r < 0) return t;
  }
  return tiers[tiers.length - 1];
}

function getSlotDrift(tokenId, slot, tier) {
  if (!PHASE3 || !PHASE3.enabled || tier.maxDrift === 0) {
    return { dx: 0, dy: 0 };
  }
  const driftableSlots = PHASE3.driftableSlots;
  if (Array.isArray(driftableSlots) && driftableSlots.length > 0) {
    if (!driftableSlots.includes(slot)) {
      return { dx: 0, dy: 0 };
    }
  }
  const rng = mulberry32(seedFromStr(`${tokenId}:drift:${slot}`));
  const span = tier.maxDrift * 2 + 1;
  const dx = Math.floor(rng() * span) - tier.maxDrift;
  const dy = Math.floor(rng() * span) - tier.maxDrift;
  return { dx, dy };
}

function getStrayPixels(tokenId, buf, tier) {
  if (!PHASE3 || !PHASE3.enabled || tier.strayMax === 0) {
    return [];
  }
  const rng = mulberry32(seedFromStr(`${tokenId}:strays`));
  const min = tier.strayMin || 0;
  const max = tier.strayMax || 0;
  const count = min + Math.floor(rng() * (max - min + 1));
  const margin = (PHASE3.strayEdgeMargin !== undefined) ? PHASE3.strayEdgeMargin : 4;
  const avoidBg = (PHASE3.strayAvoidBackground !== false);
  const allowedPaletteSlots = PHASE3.strayPaletteSlots || [3, 12, 15];

  const strays = [];
  let attempts = 0;
  const maxAttempts = count * 30;
  while (strays.length < count && attempts < maxAttempts) {
    attempts++;
    const x = margin + Math.floor(rng() * (GRID - margin * 2));
    const y = margin + Math.floor(rng() * (GRID - margin * 2));
    const i = y * GRID + x;
    if (avoidBg && buf[i] === 0) continue;
    if (strays.some(s => s.x === x && s.y === y)) continue;
    const pIdx = allowedPaletteSlots[Math.floor(rng() * allowedPaletteSlots.length)];
    strays.push({ x, y, paletteIndex: pIdx });
  }
  return strays;
}

function applyDriftToBuffer(buf, dx, dy) {
  if (dx === 0 && dy === 0) return buf;
  const out = new Uint8Array(PX);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const srcX = x - dx;
      const srcY = y - dy;
      if (srcX < 0 || srcX >= GRID || srcY < 0 || srcY >= GRID) continue;
      out[y * GRID + x] = buf[srcY * GRID + srcX];
    }
  }
  return out;
}

function overlayStrayPixels(buf, strays) {
  if (!strays || strays.length === 0) return buf;
  const out = new Uint8Array(buf);
  for (const s of strays) {
    out[s.y * GRID + s.x] = s.paletteIndex;
  }
  return out;
}

module.exports = {
  pickDriftTier,
  getSlotDrift,
  getStrayPixels,
  applyDriftToBuffer,
  overlayStrayPixels,
};