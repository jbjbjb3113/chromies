// ============================================================================
// pixel-mutation.js
// Per-token pixel mutation. Effects:
//   A. paletteSwap — swap drawn pixels with siblings in same role family
//   B. edge multi-pass — silhouette wobbles via N passes of erode+dilate
//   C. stray scatter — edge pixels relocate 1–2px (OffKilter+, capped per layer)
//   D. pixel scatter — wider-radius edge teleport (legacy tier.scatter)
//
// Optional `mutationScale` (per variant, from traits.json) multiplies the
// tier's per-pixel probabilities. 1.0 = baseline. Higher values give larger
// silhouettes (Afro, Dreads) more deviation; lower values protect small
// precision shapes (Mustache, Mohawk) from being shredded.
// Pass count (edgePasses) is also scaled, rounded to nearest integer.
//
// All effects deterministic from token ID + slot. Settings in chromies-config.js.
// ============================================================================

const { PIXEL_MUTATION, SETTINGS } = require("./chromies-config");

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

function pickMutationTier(tokenId) {
  if (!PIXEL_MUTATION || !PIXEL_MUTATION.enabled) {
    return { name: "Pristine", paletteSwap: 0, edgeErode: 0, edgeDilate: 0, edgePasses: 0 };
  }
  const tiers = PIXEL_MUTATION.tiers || [];
  if (tiers.length === 0) {
    return { name: "Pristine", paletteSwap: 0, edgeErode: 0, edgeDilate: 0, edgePasses: 0 };
  }
  const rng = mulberry32(seedFromStr(`${tokenId}:mutation_tier`));
  const total = tiers.reduce((s, t) => s + (t.weight || 1), 0);
  let r = rng() * total;
  for (const t of tiers) {
    r -= (t.weight || 1);
    if (r < 0) return t;
  }
  return tiers[tiers.length - 1];
}

function findFamilyForSlot(slotIndex, paletteFamilies) {
  for (const [familyName, members] of Object.entries(paletteFamilies)) {
    if (members.includes(slotIndex)) return { name: familyName, members };
  }
  return null;
}

function applyPaletteSwap(buf, tokenId, slot, swapProb) {
  if (swapProb <= 0) return buf;
  const families = PIXEL_MUTATION.paletteFamilies || {};
  const out = new Uint8Array(buf);
  const rng = mulberry32(seedFromStr(`${tokenId}:swap:${slot}`));

  for (let i = 0; i < PX; i++) {
    const cur = buf[i];
    if (cur === 0) continue;
    const family = findFamilyForSlot(cur, families);
    if (!family) continue;
    if (rng() < swapProb) {
      out[i] = family.members[Math.floor(rng() * family.members.length)];
    }
  }
  return out;
}

function edgePass(buf, tokenId, slot, passId, erodeProb, dilateProb) {
  const out = new Uint8Array(buf);
  const rng = mulberry32(seedFromStr(`${tokenId}:edge:${slot}:p${passId}`));
  const edgesDrawn = [];
  const edgesBg = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const cur = buf[y * GRID + x];
      let nBg = 0;
      const drawnN = [];
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
        const n = buf[ny * GRID + nx];
        if (n === 0) nBg++;
        else drawnN.push(n);
      }
      if (cur !== 0 && nBg > 0) edgesDrawn.push(y * GRID + x);
      if (cur === 0 && drawnN.length > 0) edgesBg.push({ idx: y * GRID + x, neighbors: drawnN });
    }
  }
  for (const i of edgesDrawn) {
    if (rng() < erodeProb) out[i] = 0;
  }
  for (const e of edgesBg) {
    if (rng() < dilateProb) {
      out[e.idx] = e.neighbors[Math.floor(rng() * e.neighbors.length)];
    }
  }
  return out;
}

// Scatter: edge pixels teleport to a nearby empty cell — dissolve/static effect.
// Edge set is computed on the input snapshot; moves land only on cells that are
// background in both the snapshot and the output (no stomping drawn or already-
// scattered pixels). Up to 4 placement attempts per triggered pixel; if none
// lands, the pixel stays put. Deterministic from tokenId + slot + passId.
function applyPixelScatter(buf, tokenId, slot, passId, scatterProb, scatterRadius) {
  if (scatterProb <= 0 || scatterRadius <= 0) return buf;
  const out = new Uint8Array(buf);
  const rng = mulberry32(seedFromStr(`${tokenId}:scatter:${slot}:p${passId}`));

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const idx = y * GRID + x;
      const cur = buf[idx];
      if (cur === 0) continue;

      let isEdge = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
        if (buf[ny * GRID + nx] === 0) { isEdge = true; break; }
      }
      if (!isEdge) continue;
      if (rng() >= scatterProb) continue;

      for (let attempt = 0; attempt < 4; attempt++) {
        const dx = Math.floor(rng() * (scatterRadius * 2 + 1)) - scatterRadius;
        const dy = Math.floor(rng() * (scatterRadius * 2 + 1)) - scatterRadius;
        if (dx === 0 && dy === 0) continue;
        const tx = x + dx, ty = y + dy;
        if (tx < 0 || tx >= GRID || ty < 0 || ty >= GRID) continue;
        const tIdx = ty * GRID + tx;
        if (buf[tIdx] !== 0 || out[tIdx] !== 0) continue;
        out[tIdx] = cur;
        out[idx] = 0;
        break;
      }
    }
  }
  return out;
}

function applyEdgeMutation(buf, tokenId, slot, erodeProb, dilateProb, passes) {
  if (passes <= 0 || (erodeProb <= 0 && dilateProb <= 0)) return buf;
  let cur = buf;
  for (let p = 0; p < passes; p++) {
    cur = edgePass(cur, tokenId, slot, p, erodeProb, dilateProb);
  }
  return cur;
}

// Stray scatter: after heavy edge passes, peel edge pixels into nearby gaps.
// Relocations stay inside the layer bounding box; total strays capped at 8%
// of opaque pixels so silhouettes stay recognizable.
function applyStrayPixelScatter(buf, tokenId, slot, strayChance, maxStrayRatio = 0.08) {
  if (strayChance <= 0) return buf;

  let opaqueCount = 0;
  let minX = GRID;
  let minY = GRID;
  let maxX = 0;
  let maxY = 0;
  const edges = [];

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const idx = y * GRID + x;
      const cur = buf[idx];
      if (cur === 0) continue;

      opaqueCount++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      let isEdge = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
        if (buf[ny * GRID + nx] === 0) {
          isEdge = true;
          break;
        }
      }
      if (isEdge) edges.push(idx);
    }
  }

  if (opaqueCount === 0 || edges.length === 0) return buf;

  const maxStrays = Math.floor(opaqueCount * maxStrayRatio);
  if (maxStrays <= 0) return buf;

  const offsets = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist >= 1 && dist <= 2) offsets.push([dx, dy]);
    }
  }

  const out = new Uint8Array(buf);
  const rng = mulberry32(seedFromStr(`${tokenId}:stray:${slot}`));

  for (let i = edges.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = edges[i];
    edges[i] = edges[j];
    edges[j] = tmp;
  }

  let applied = 0;
  for (const idx of edges) {
    if (applied >= maxStrays) break;
    if (rng() >= strayChance) continue;

    const color = out[idx];
    if (color === 0) continue;

    const x = idx % GRID;
    const y = Math.floor(idx / GRID);

    for (let attempt = 0; attempt < 6; attempt++) {
      const [dx, dy] = offsets[Math.floor(rng() * offsets.length)];
      const tx = x + dx;
      const ty = y + dy;
      if (tx < minX || tx > maxX || ty < minY || ty > maxY) continue;
      if (tx < 0 || tx >= GRID || ty < 0 || ty >= GRID) continue;
      const tIdx = ty * GRID + tx;
      if (out[tIdx] !== 0) continue;
      out[tIdx] = color;
      out[idx] = 0;
      applied++;
      break;
    }
  }

  return out;
}

// Variant-aware mutation: scale probabilities and pass count by the variant's
// mutationScale (defaults to 1.0). Bigger floppy shapes can take more deviation.
function mutateLayer(buf, tokenId, slot, tier, mutationScale = 1.0) {
  if (!PIXEL_MUTATION || !PIXEL_MUTATION.enabled) return buf;
  const mutableSlots = PIXEL_MUTATION.mutableSlots || [];
  if (!mutableSlots.includes(slot)) return buf;

  const scale = (typeof mutationScale === "number" && mutationScale > 0) ? mutationScale : 1.0;

  // Clamp probabilities to safe range so high-scale variants don't go past 100%
  const swap   = Math.min(1.0, (tier.paletteSwap || 0) * scale);
  const erode  = Math.min(1.0, (tier.edgeErode   || 0) * scale);
  const dilate = Math.min(1.0, (tier.edgeDilate  || 0) * scale);
  // Scale pass count proportionally; minimum 1 if any edge mutation requested
  let passes = Math.round((tier.edgePasses || 0) * scale);
  if (passes < 1 && (erode > 0 || dilate > 0) && tier.edgePasses > 0) passes = 1;

  let out = buf;
  out = applyPaletteSwap(out, tokenId, slot, swap);
  out = applyEdgeMutation(out, tokenId, slot, erode, dilate, passes);
  const strayChance = Math.min(1.0, (tier.strayChance || 0) * scale);
  if (passes >= 2 && strayChance > 0) {
    out = applyStrayPixelScatter(out, tokenId, slot, strayChance);
  }
  out = applyPixelScatter(out, tokenId, slot, 0, tier.scatter || 0, tier.scatterRadius || 0);
  return out;
}

module.exports = {
  pickMutationTier,
  mutateLayer,
};