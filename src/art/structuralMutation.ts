/**
 * Structural phenotype evolution — relocates and grows pixels on the same organism.
 * No overlay compositing; Normie lineage remains traceable via center-anchored warping.
 */

import { clampDrift, lerp } from "./awakening";
import { CHROMIE_GRID, CHROMIE_PIXELS } from "./mirror";
import type { PaletteSemantic } from "./paletteFamilies";
import { PALETTE_SEMANTIC } from "./paletteFamilies";

export type SilhouetteGeom = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  height: number;
  width: number;
  eyeY: number;
  eyeY0: number;
  eyeY1: number;
  eyeLeftX: number;
  eyeRightX: number;
  eyeSpan: number;
  lowerY0: number;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clampDrift((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function idx(x: number, y: number): number {
  return y * CHROMIE_GRID + x;
}

function clampCoord(v: number): number {
  return Math.max(0, Math.min(CHROMIE_GRID - 1, v));
}

function clampIdx(v: number): number {
  return Math.max(0, Math.min(15, v | 0));
}

export function isInk(mask: Uint8Array, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= CHROMIE_GRID || y >= CHROMIE_GRID) return false;
  return mask[idx(x, y)] === 1;
}

export function edgeDist(mask: Uint8Array, x: number, y: number): number {
  if (!isInk(mask, x, y)) return 99;
  let best = 99;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!isInk(mask, x + dx, y + dy)) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (d < best) best = d;
      }
    }
  }
  return best;
}

export function analyzeSilhouette(mask: Uint8Array): SilhouetteGeom | null {
  let minX = CHROMIE_GRID;
  let minY = CHROMIE_GRID;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < CHROMIE_GRID; y++) {
    for (let x = 0; x < CHROMIE_GRID; x++) {
      if (mask[idx(x, y)]) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const height = maxY - minY + 1;
  const width = maxX - minX + 1;
  const cx = Math.floor((minX + maxX) / 2);
  const cy = Math.floor((minY + maxY) / 2);
  const eyeY = minY + Math.floor(height * 0.38);
  const eyeY0 = Math.max(minY, eyeY - 2);
  const eyeY1 = Math.min(maxY, eyeY + 2);
  const lowerY0 = minY + Math.floor(height * 0.62);

  const runs: { mid: number; len: number }[] = [];
  for (let y = eyeY0; y <= eyeY1; y++) {
    let x = minX;
    while (x <= maxX) {
      if (!isInk(mask, x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x <= maxX && isInk(mask, x, y)) x++;
      const end = x - 1;
      const len = end - start + 1;
      if (len >= 2 && len <= 14) runs.push({ mid: Math.floor((start + end) / 2), len });
    }
  }
  runs.sort((a, b) => b.len - a.len);
  const eyeLeftX = Math.min(runs[0]?.mid ?? cx - 6, runs[1]?.mid ?? cx + 6);
  const eyeRightX = Math.max(runs[0]?.mid ?? cx - 6, runs[1]?.mid ?? cx + 6);

  return {
    minX,
    minY,
    maxX,
    maxY,
    cx,
    cy,
    height,
    width,
    eyeY,
    eyeY0,
    eyeY1,
    eyeLeftX,
    eyeRightX,
    eyeSpan: eyeRightX - eyeLeftX,
    lowerY0,
  };
}

/** Structural strength by drift stage (OG 0 → AWAKENED 5–15% → DRIFTED 40–70%). */
export function getStructuralStrength(driftLevel: number, pureChromieMode = false): number {
  if (pureChromieMode) return 1;
  const t = clampDrift(driftLevel);
  if (t <= 0.001) return 0;
  if (t < 0.25) return lerp(0, 0.03, t / 0.25);
  if (t < 0.6) return lerp(0.05, 0.15, smoothstep(0.25, 0.6, t));
  if (t < 0.92) return lerp(0.4, 0.7, smoothstep(0.6, 0.92, t));
  return lerp(0.7, 0.88, smoothstep(0.92, 1, t));
}

function deposit(
  buf: Uint8Array,
  mask: Uint8Array,
  x: number,
  y: number,
  color: number,
): void {
  const ix = clampCoord(x);
  const iy = clampCoord(y);
  const i = idx(ix, iy);
  mask[i] = 1;
  const c = clampIdx(color);
  if (buf[i] === 0 || c > buf[i]!) buf[i] = c;
}

function halfWidthAtRow(
  cx: number,
  hw: number,
  y: number,
  top: number,
  hh: number,
): { left: number; right: number } {
  const t = (y - top) / Math.max(1, hh);
  let w = hw - Math.round(Math.abs(0.45 - t) * 4);
  if (y - top < 6) w += 4 - Math.floor((y - top) * 0.5);
  if (y - top > 29) w += Math.floor((y - top - 29) * 0.85);
  return { left: cx - w, right: cx + w };
}

/** Relocate ink toward angular CHROMIES skull proportions. */
function warpContourTowardSpecies(
  buf: Uint8Array,
  mask: Uint8Array,
  geom: SilhouetteGeom,
  strength: number,
  normieId: number,
): { buf: Uint8Array; mask: Uint8Array } {
  const outBuf = new Uint8Array(CHROMIE_PIXELS);
  const outMask = new Uint8Array(CHROMIE_PIXELS);
  const rng = mulberry32((Math.imul(normieId, 2246822519) + Math.floor(strength * 999983)) >>> 0);

  const cx = geom.cx;
  const targetTop = Math.round(lerp(geom.minY, 11, strength * 0.85));
  const targetHh = Math.round(lerp(geom.height, 38, strength * 0.9));
  const targetHw = lerp(geom.width * 0.5, 17.5, strength);

  for (let y = geom.minY; y <= geom.maxY; y++) {
    for (let x = geom.minX; x <= geom.maxX; x++) {
      if (!isInk(mask, x, y) || buf[idx(x, y)] === 0) continue;

      const ny = (y - geom.minY) / Math.max(1, geom.height);
      const side = x < cx ? -1 : 1;

      let tx = x;
      let ty = y;

      const widen = 1 + strength * (0.08 + 0.1 * (1 - Math.abs(ny - 0.38)));
      tx = cx + Math.round((x - cx) * widen);

      if (ny < 0.28) {
        const push = strength * (3.5 + rng() * 2);
        tx += Math.round(side * push * (1 - ny / 0.28));
        ty -= Math.floor(strength * (1.2 + rng() * 0.8));
      }

      if (ny > 0.62) {
        const jaw = strength * (2.5 + rng() * 1.5);
        tx += Math.round(side * jaw * ((ny - 0.62) / 0.38));
        ty += Math.floor(strength * 0.6);
      }

      if (ny > 0.35 && ny < 0.55) {
        tx += Math.round(side * strength * 0.8);
      }

      deposit(outBuf, outMask, tx, ty, buf[idx(x, y)]!);
    }
  }

  const targetCx = cx;
  for (let row = 0; row < targetHh; row++) {
    const yy = targetTop + row;
    if (yy < 0 || yy >= CHROMIE_GRID) continue;
    const { left, right } = halfWidthAtRow(targetCx, targetHw, yy, targetTop, targetHh);
    const fillStrength = strength * (0.35 + row / targetHh * 0.25);
    for (let x = left; x <= right; x++) {
      if (rng() > fillStrength) continue;
      const edge = x === left || x === right;
      const v = edge ? 2 : 5;
      if (!isInk(outMask, x, yy)) deposit(outBuf, outMask, x, yy, v);
    }
  }

  return { buf: outBuf, mask: outMask };
}

function evolveEyeSystem(
  buf: Uint8Array,
  mask: Uint8Array,
  geom: SilhouetteGeom,
  strength: number,
  normieId: number,
  S: PaletteSemantic,
): void {
  const rng = mulberry32(normieId * 1013904223 + 42);
  const cx = geom.cx;
  const eyeY = Math.round(lerp(geom.eyeY, geom.minY + Math.floor(geom.height * 0.36), strength * 0.7));
  const span = lerp(geom.eyeSpan * 0.5, 7.5, strength);
  const leftX = Math.round(cx - span);
  const rightX = Math.round(cx + span + 1);
  const slant = Math.max(2, Math.floor(4 + strength * 4));

  const drawSlantEye = (ex: number, dir: number) => {
    for (let s = 0; s < slant; s++) {
      const x0 = ex - slant + s;
      const y0 = eyeY + (dir > 0 ? 1 : 0) - Math.floor(s * strength * 0.8);
      deposit(buf, mask, x0, y0, S.deep);
      deposit(buf, mask, x0, y0 - 1, S.glow);
    }
    deposit(buf, mask, ex, eyeY - 1, S.glow);
    deposit(buf, mask, ex + (dir > 0 ? 1 : -1), eyeY - 2, S.highlightB);
  };

  if (strength > 0.08) {
    drawSlantEye(leftX, -1);
    drawSlantEye(rightX, 1);
    for (let x = leftX - 4; x <= rightX + 4; x++) {
      if (Math.abs(x - leftX) <= 2 || Math.abs(x - rightX) <= 2) continue;
      if (rng() < strength * 0.35) deposit(buf, mask, x, eyeY - 3, S.shadowA);
    }
  }

  if (strength > 0.35) {
    fillRectMask(buf, mask, leftX - 1, eyeY, 3, 2, S.glow);
    fillRectMask(buf, mask, rightX - 1, eyeY, 3, 2, S.glow);
  }
}

function fillRectMask(
  buf: Uint8Array,
  mask: Uint8Array,
  x0: number,
  y0: number,
  w: number,
  h: number,
  c: number,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) deposit(buf, mask, x, y, c);
  }
}

function evolveMaskTopology(
  buf: Uint8Array,
  mask: Uint8Array,
  geom: SilhouetteGeom,
  strength: number,
  S: PaletteSemantic,
): void {
  const rng = mulberry32(geom.cx * 493827 + 7);
  const maskY = Math.round(lerp(geom.lowerY0, geom.minY + Math.floor(geom.height * 0.58), strength * 0.5));
  const cx = geom.cx;
  const halfW = Math.round(lerp(geom.width * 0.45, 15, strength));

  if (strength < 0.2) return;

  for (let y = maskY; y <= geom.maxY + Math.floor(strength * 3); y++) {
    const t = (y - maskY) / Math.max(1, geom.maxY - maskY + 1);
    const rowW = halfW + Math.floor(t * strength * 2);
    for (let x = cx - rowW; x <= cx + rowW; x++) {
      if (x < 0 || x >= CHROMIE_GRID) continue;
      const cheek = Math.abs(x - cx) > rowW * 0.55;
      const c = cheek ? S.shadowB : S.maskAccent;
      if (rng() < 0.45 + strength * 0.45) deposit(buf, mask, x, y, c);
    }
  }

  if (strength > 0.45) {
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      deposit(buf, mask, x, maskY - 1, S.deep);
      if (strength > 0.55 && rng() < strength) {
        deposit(buf, mask, x - (x < cx ? 1 : 0), maskY + 2, S.maskAccent);
        deposit(buf, mask, x + (x > cx ? 1 : 0), maskY + 2, S.maskAccent);
      }
    }
  }
}

function evolveHairSilhouette(
  buf: Uint8Array,
  mask: Uint8Array,
  geom: SilhouetteGeom,
  strength: number,
  normieId: number,
  S: PaletteSemantic,
): void {
  const rng = mulberry32(normieId * 314159 + 99);
  const hairSide = normieId % 3 === 0 ? 0 : normieId % 2 === 0 ? 1 : -1;
  const cx = geom.cx;
  const capRows = Math.floor(3 + strength * 9);

  for (let row = 0; row < capRows; row++) {
    const y = geom.minY - 1 - row;
    if (y < 0) continue;
    const skew = hairSide * Math.floor(row * (0.8 + strength));
    const w = Math.floor(geom.width * 0.45 + strength * 6);
    for (let x = cx - w + skew; x <= cx + w + skew; x++) {
      deposit(buf, mask, x, y, row < 3 ? S.accent : S.accentAlt);
    }
  }

  const spikes = Math.floor(3 + strength * 6);
  for (let i = 0; i < spikes; i++) {
    const rootX = cx - Math.floor(geom.width * 0.4) + Math.floor((i / Math.max(1, spikes - 1)) * geom.width * 0.8);
    const tipX = rootX + hairSide * Math.floor((3 + rng() * 8) * strength);
    const tipY = geom.minY - 2 - Math.floor(rng() * (4 + strength * 8));
    const rootY = geom.minY + Math.floor(rng() * 4);
    lineMask(buf, mask, rootX, rootY, tipX, tipY, rng() > 0.3 ? S.accent : S.accentAlt);
  }

  if (strength > 0.35) {
    const side = hairSide || (rng() > 0.5 ? 1 : -1);
    for (let i = 0; i < 3 + Math.floor(strength * 3); i++) {
      const x = cx + side * (Math.floor(geom.width * 0.42) + i * 2);
      const y0 = geom.minY + 4 + i;
      lineMask(buf, mask, x, y0, x + side * 3, y0 + 14 + Math.floor(rng() * 6), S.accentAlt);
    }
  }
}

function lineMask(
  buf: Uint8Array,
  mask: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: number,
): void {
  let dx = Math.abs(x1 - x0);
  let sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    deposit(buf, mask, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function restructureEdges(
  buf: Uint8Array,
  mask: Uint8Array,
  geom: SilhouetteGeom,
  strength: number,
  normieId: number,
): void {
  const rng = mulberry32(normieId * 271828 + 11);
  const cx = geom.cx;
  const cy = geom.cy;

  for (let y = 0; y < CHROMIE_GRID; y++) {
    for (let x = 0; x < CHROMIE_GRID; x++) {
      if (!isInk(mask, x, y) || edgeDist(mask, x, y) > 1) continue;
      const c = buf[idx(x, y)]!;
      if (c === 0) continue;

      const outwardX = x < cx ? -1 : x > cx ? 1 : 0;
      const outwardY = y < cy ? -1 : y > cy ? 1 : 0;

      if (rng() < strength * 0.28) {
        deposit(buf, mask, x + outwardX, y + outwardY, c);
      }
      if (strength > 0.5 && rng() < strength * 0.12) {
        deposit(buf, mask, x + outwardX * 2, y, buf[idx(x, y)]!);
        if (rng() < 0.4) mask[idx(clampCoord(x + outwardX * 2), y)] = 0;
      }
      if (strength > 0.55 && rng() < strength * 0.08) {
        const ix = clampCoord(x - outwardX);
        const iy = clampCoord(y - outwardY);
        if (edgeDist(mask, ix, iy) > 2) mask[idx(x, y)] = 0;
      }
    }
  }
}

/**
 * Morph the mirror organism toward CHROMIES structural phenotype.
 */
export function applyStructuralEvolution(
  buf: Uint8Array,
  mask64: Uint8Array,
  normieId: number,
  driftLevel: number,
  semantic: PaletteSemantic = PALETTE_SEMANTIC,
  pureChromieMode = false,
): { buf: Uint8Array; mask: Uint8Array; structuralStrength: number } {
  const strength = getStructuralStrength(driftLevel, pureChromieMode);
  if (strength <= 0.001) {
    return { buf: new Uint8Array(buf), mask: new Uint8Array(mask64), structuralStrength: 0 };
  }

  const geom = analyzeSilhouette(mask64);
  if (!geom) {
    return { buf: new Uint8Array(buf), mask: new Uint8Array(mask64), structuralStrength: strength };
  }

  let workBuf = new Uint8Array(buf);
  let workMask = new Uint8Array(mask64);

  const warped = warpContourTowardSpecies(workBuf, workMask, geom, strength, normieId);
  workBuf = new Uint8Array(warped.buf);
  workMask = new Uint8Array(warped.mask);

  evolveEyeSystem(workBuf, workMask, geom, strength, normieId, semantic);
  evolveMaskTopology(workBuf, workMask, geom, strength, semantic);
  evolveHairSilhouette(workBuf, workMask, geom, strength, normieId, semantic);
  restructureEdges(workBuf, workMask, geom, strength, normieId);

  return { buf: workBuf, mask: workMask, structuralStrength: strength };
}
