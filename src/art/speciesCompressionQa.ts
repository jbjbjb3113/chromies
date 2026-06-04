import { D_LOCK_GEOMETRY } from "./dLockDoctrine";

const GRID = 64;

export type QaFailureCode =
  | "eye_band_collapse"
  | "hoodie_swallows_skull"
  | "chains_noise"
  | "side_mass_lost"
  | "silhouette_asymmetry_lost";

export type QaScale = 512 | 128 | 64 | 32;

export type SpeciesQaResult = {
  pass: boolean;
  failures: QaFailureCode[];
  scale: QaScale;
  scores: {
    eyeInk: number;
    faceHoodRatio: number;
    chainIsolated: number;
    sideMassRatio: number;
    silhouetteAsymmetry: number;
  };
};

function downsample(buf: Uint8Array, target: number): Uint8Array {
  if (target >= GRID) return new Uint8Array(buf);
  const out = new Uint8Array(target * target);
  const step = GRID / target;
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      const sx = Math.min(GRID - 1, Math.floor(x * step + step * 0.5));
      const sy = Math.min(GRID - 1, Math.floor(y * step + step * 0.5));
      out[y * target + x] = buf[sy * GRID + sx]!;
    }
  }
  return out;
}

function countInk(buf: Uint8Array, size: number, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (buf[y * size + x]! > 0) n++;
    }
  }
  return n;
}

function countIsolatedChainPixels(buf: Uint8Array, size: number, chainIndices: Set<number>): number {
  const cy = Math.floor((52 / GRID) * size);
  let isolated = 0;
  for (let y = cy - 1; y <= cy + 3; y++) {
    for (let x = 0; x < size; x++) {
      const i = buf[y * size + x]!;
      if (!chainIndices.has(i)) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (chainIndices.has(buf[ny * size + nx]!)) neighbors++;
        }
      }
      if (neighbors < 2) isolated++;
    }
  }
  return isolated;
}

export function validateSpeciesAtScale(
  buf: Uint8Array,
  massSide: number,
  scale: QaScale,
  { pureSkull = false }: { pureSkull?: boolean } = {},
): SpeciesQaResult {
  const sample = scale === 64 ? buf : downsample(buf, scale);
  const size = scale === 64 ? GRID : scale;
  const G = D_LOCK_GEOMETRY;
  const cx = Math.floor((G.cx / GRID) * size);
  const eyeY = Math.floor((G.eyeY / GRID) * size);
  const top = Math.floor((G.top / GRID) * size);
  const faceHalf = Math.max(2, Math.floor((G.faceHalfW / GRID) * size));

  const failures: QaFailureCode[] = [];

  const eyeInk = countInk(sample, size, cx - faceHalf, eyeY - 2, cx + faceHalf, eyeY + 2);
  const eyeMin = scale <= 32 ? 4 : scale <= 128 ? 8 : 12;
  if (eyeInk < eyeMin) failures.push("eye_band_collapse");

  let faceHood = 0;
  let faceTotal = 0;
  if (!pureSkull) {
    for (let y = top; y < top + Math.floor((G.skullRows / GRID) * size); y++) {
      for (let x = cx - faceHalf; x <= cx + faceHalf; x++) {
        faceTotal++;
        const v = sample[y * size + x]!;
        if (v > 0 && v <= 3) faceHood++;
      }
    }
  }
  const faceHoodRatio = faceTotal > 0 ? faceHood / faceTotal : 0;
  if (!pureSkull && faceHoodRatio > 0.72) failures.push("hoodie_swallows_skull");

  const chainIndices = new Set([8, 9, 10, 11, 12, 13]);
  const chainIsolated = pureSkull ? 0 : countIsolatedChainPixels(sample, size, chainIndices);
  const chainMax = scale <= 32 ? 2 : scale <= 128 ? 4 : 8;
  if (chainIsolated > chainMax) failures.push("chains_noise");

  const hairY1 = top + Math.floor((18 / GRID) * size);
  const leftMass = countInk(sample, size, 0, top, cx - 2, hairY1);
  const rightMass = countInk(sample, size, cx + 2, top, size - 1, hairY1);
  const dominant = Math.max(leftMass, rightMass);
  const recessive = Math.min(leftMass, rightMass) || 1;
  const sideMassRatio = dominant / recessive;
  const sideMin = pureSkull ? 1.05 : scale <= 32 ? 1.15 : 1.25;
  if (sideMassRatio < sideMin) failures.push("side_mass_lost");

  const expectedHeavy = massSide < 0 ? leftMass : rightMass;
  const silhouetteAsymmetry = expectedHeavy / (recessive || 1);
  if (silhouetteAsymmetry < sideMin) failures.push("silhouette_asymmetry_lost");

  return {
    pass: failures.length === 0,
    failures,
    scale,
    scores: {
      eyeInk,
      faceHoodRatio,
      chainIsolated,
      sideMassRatio,
      silhouetteAsymmetry,
    },
  };
}

export function validateSpeciesCompression(
  buf: Uint8Array,
  massSide: number,
  options: { pureSkull?: boolean } = {},
): { pass: boolean; failures: QaFailureCode[]; byScale: SpeciesQaResult[] } {
  const scales: QaScale[] = [64, 32, 128, 512];
  const byScale = scales.map((s) => {
    const effective = s >= 64 ? 64 : s;
    return validateSpeciesAtScale(buf, massSide, effective, { ...options });
  }).map((r, i) => ({ ...r, scale: scales[i]! }));
  const failures = [...new Set(byScale.flatMap((r) => r.failures))];
  return { pass: failures.length === 0, failures, byScale };
}
