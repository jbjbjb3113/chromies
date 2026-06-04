/** True mirror: Normie 40×40 → Chromies 64×64 identity preservation (no reinterpretation). */

import {
  type PaletteFamilyId,
  PALETTE_SEMANTIC,
  paletteFamilyToMirrorPalette,
} from "./paletteFamilies";

export const NORMIE_GRID = 40;
export const NORMIE_PIXELS = NORMIE_GRID * NORMIE_GRID;
export const CHROMIE_GRID = 64;
export const CHROMIE_PIXELS = CHROMIE_GRID * CHROMIE_GRID;

export const NORMIE_API = "https://api.normies.art";

export type MirrorPalette = {
  id: number;
  name: string;
  colors: string[];
};

export type MirrorChromieResult = {
  buf: Uint8Array;
  palette: MirrorPalette;
  paletteId: number;
  traits: Record<string, string | number>;
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

/** Parse Normies API `/normie/{id}/pixels` string (1600 × `0`|`1`). */
export function parseNormiePixels(pixelString: string): Uint8Array {
  const trimmed = pixelString.trim();
  if (trimmed.length !== NORMIE_PIXELS) {
    throw new Error(`Expected ${NORMIE_PIXELS} normie pixels, got ${trimmed.length}`);
  }
  const out = new Uint8Array(NORMIE_PIXELS);
  for (let i = 0; i < NORMIE_PIXELS; i++) {
    const c = trimmed[i];
    if (c !== "0" && c !== "1") {
      throw new Error(`Invalid normie pixel at ${i}: ${c}`);
    }
    out[i] = c === "1" ? 1 : 0;
  }
  return out;
}

/** Nearest-neighbor upscale 40×40 → 64×64 (preserves silhouette & spacing). */
export function upscaleNormieTo64(normie40: Uint8Array): Uint8Array {
  const mask = new Uint8Array(CHROMIE_PIXELS);
  for (let cy = 0; cy < CHROMIE_GRID; cy++) {
    const ny = Math.min(NORMIE_GRID - 1, Math.floor((cy * NORMIE_GRID) / CHROMIE_GRID));
    for (let cx = 0; cx < CHROMIE_GRID; cx++) {
      const nx = Math.min(NORMIE_GRID - 1, Math.floor((cx * NORMIE_GRID) / CHROMIE_GRID));
      mask[cy * CHROMIE_GRID + cx] = normie40[ny * NORMIE_GRID + nx]!;
    }
  }
  return mask;
}

function isForeground(mask: Uint8Array, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= CHROMIE_GRID || y >= CHROMIE_GRID) return false;
  return mask[y * CHROMIE_GRID + x]! === 1;
}

function chebyshevDistToBackground(mask: Uint8Array, x: number, y: number): number {
  let best = 99;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isForeground(mask, nx, ny)) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (d < best) best = d;
      }
    }
  }
  return best;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Map binary mask → 16-index ramp (controlled depth; drift raises palette mutation). */
export function colorizeMirrorMask(
  mask64: Uint8Array,
  normieId: number,
  driftLevel = 0,
  semantic = PALETTE_SEMANTIC,
): { buf: Uint8Array } {
  const buf = new Uint8Array(CHROMIE_PIXELS);
  const mutation = lerp(0.1, 1, driftLevel);
  const rng = mulberry32(normieId * 2654435761 + 100003 + Math.floor(driftLevel * 1_000_000));
  const S = semantic;

  let minX = CHROMIE_GRID;
  let minY = CHROMIE_GRID;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < CHROMIE_GRID; y++) {
    for (let x = 0; x < CHROMIE_GRID; x++) {
      if (mask64[y * CHROMIE_GRID + x]) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const height = Math.max(1, maxY - minY + 1);
  const accentGate = lerp(0.97, 0.86, mutation) + (normieId % 5) * 0.005;

  for (let y = 0; y < CHROMIE_GRID; y++) {
    for (let x = 0; x < CHROMIE_GRID; x++) {
      const i = y * CHROMIE_GRID + x;
      if (!mask64[i]) {
        buf[i] = 0;
        continue;
      }

      const edgeDist = chebyshevDistToBackground(mask64, x, y);
      const ny = (y - minY) / height;

      let index: number;
      if (edgeDist <= 1) {
        index = normieId & 1 ? S.shadowB : S.shadowA;
      } else if (ny < 0.22) {
        index = normieId & 2 ? S.highlightC : S.highlightB;
      } else if (ny < 0.5) {
        index = [S.midB, S.midC, S.midD][(normieId >> 2) % 3]!;
      } else if (ny < 0.72) {
        index = normieId & 8 ? S.midA : S.midB;
      } else {
        index = normieId & 16 ? S.shadowB : S.midA;
      }

      if (edgeDist >= 2 && rng() > accentGate) {
        index = normieId % 2 ? S.accentAlt : S.accent;
      }

      if (mutation > 0.4 && edgeDist >= 2 && rng() < mutation * 0.12) {
        index = rng() < 0.5 ? S.corruption : S.maskAccent;
      }

      buf[i] = Math.max(1, Math.min(15, index));
    }
  }

  return { buf };
}

export function generateMirrorChromieFromPixels(
  normieId: number,
  pixelString: string,
  paletteFamilyId: PaletteFamilyId,
  driftLevel = 0,
): MirrorChromieResult {
  const normie40 = parseNormiePixels(pixelString);
  const mask64 = upscaleNormieTo64(normie40);
  const palette = paletteFamilyToMirrorPalette(paletteFamilyId);
  const { buf } = colorizeMirrorMask(mask64, normieId, driftLevel);

  return {
    buf,
    palette,
    paletteId: palette.id,
    traits: {
      Mode: "Mirror Reconstruction",
      Form: "Chromie Evolution",
      SignalDrift: `${Math.round(driftLevel * 100)}%`,
      NormieId: normieId,
      PaletteFamily: palette.name,
      Grid: "64×64 indexed",
      Source: "Normie 40×40",
    },
  };
}

export async function fetchNormiePixels(normieId: number): Promise<string> {
  const r = await fetch(`${NORMIE_API}/normie/${normieId}/pixels`);
  if (!r.ok) throw new Error(`Normie pixels HTTP ${r.status}`);
  return r.text();
}

export async function generateMirrorChromie(
  normieId: number,
  paletteFamilyId: PaletteFamilyId,
): Promise<MirrorChromieResult> {
  const pixels = await fetchNormiePixels(normieId);
  return generateMirrorChromieFromPixels(normieId, pixels, paletteFamilyId);
}
