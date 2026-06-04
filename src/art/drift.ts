import { clampDrift, driftPercent, getDriftAnchorLabel, getDriftDescriptor, lerp } from "./awakening";
import {
  type PaletteFamilyId,
  PALETTE_SEMANTIC,
  type PaletteSemantic,
  paletteFamilyToMirrorPalette,
} from "./paletteFamilies";
import {
  CHROMIE_GRID,
  CHROMIE_PIXELS,
  type MirrorChromieResult,
  type MirrorPalette,
  parseNormiePixels,
  upscaleNormieTo64,
} from "./mirror";
import {
  analyzeSilhouette,
  applyStructuralEvolution,
  edgeDist,
  getStructuralStrength,
  isInk,
} from "./structuralMutation";

export { getDriftDescriptor, getDriftAnchorLabel, driftPercent };
export { getStructuralStrength, applyStructuralEvolution } from "./structuralMutation";
export type { SilhouetteGeom } from "./structuralMutation";

export type DriftChromieResult = MirrorChromieResult & {
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

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clampDrift((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function idx(x: number, y: number): number {
  return y * CHROMIE_GRID + x;
}

function clampIdx(v: number): number {
  return Math.max(0, Math.min(15, v | 0));
}

/**
 * Progressive pixel-state mutation from mirror base — never composites a second image.
 */
export function mutateMirrorBuffer(
  mirrorBuf: Uint8Array,
  mask64: Uint8Array,
  normieId: number,
  driftLevel: number,
  semantic: PaletteSemantic = PALETTE_SEMANTIC,
): Uint8Array {
  const t = clampDrift(driftLevel);
  if (t <= 0.001) return new Uint8Array(mirrorBuf);

  const structural = applyStructuralEvolution(mirrorBuf, mask64, normieId, t, semantic, false);
  const buf = new Uint8Array(structural.buf);
  const evolvedMask = structural.mask;

  const geom = analyzeSilhouette(evolvedMask);
  if (!geom) return buf;

  const rng = mulberry32((Math.imul(normieId, 1597334677) + Math.floor(t * 1_000_000)) >>> 0);
  const stageLow = Math.min(1, t / 0.25);
  const stageMid = smoothstep(0.25, 0.6, t);
  const stageHigh = smoothstep(0.6, 1, t);

  const S = semantic;
  const hot = S.accent;
  const shadow = S.shadowA;
  const deep = S.deep;
  const glow = S.glow;
  const corrupt = S.corruption;
  const maskTone = S.maskAccent;

  // 0–25: mirror colorization + tiny edge expansion only
  if (stageLow > 0) {
    for (let y = 0; y < CHROMIE_GRID; y++) {
      for (let x = 0; x < CHROMIE_GRID; x++) {
        if (isInk(evolvedMask, x, y)) continue;
        let neighbor = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const i = idx(x + dx, y + dy);
            if (mirrorBuf[i]! > 0) {
              neighbor = Math.max(neighbor, mirrorBuf[i]!);
              count++;
            }
          }
        }
        if (count > 0 && rng() < stageLow * 0.22) {
          buf[idx(x, y)] = clampIdx(neighbor - 1);
        }
      }
    }
  }

  // 25–60: awaken existing features in-place
  if (stageMid > 0) {
    for (let y = geom.eyeY0; y <= geom.eyeY1; y++) {
      for (let x = geom.minX; x <= geom.maxX; x++) {
        const i = idx(x, y);
        if (!isInk(evolvedMask, x, y) || buf[i] === 0) continue;
        const nearEye =
          Math.abs(x - geom.eyeLeftX) <= 4 || Math.abs(x - geom.eyeRightX) <= 4;
        if (nearEye) {
          buf[i] = clampIdx(buf[i]! + 1 + Math.floor(stageMid * 2));
          if (stageMid > 0.4 && rng() < stageMid * 0.35) {
            buf[i] = clampIdx(glow);
          }
        }
      }
    }

    // Brows: row above eye band
    const browY = Math.max(geom.minY, geom.eyeY0 - 2);
    for (let x = geom.eyeLeftX - 5; x <= geom.eyeRightX + 5; x++) {
      if (x < 0 || x >= CHROMIE_GRID) continue;
      if (isInk(evolvedMask, x, browY) && buf[idx(x, browY)]! > 0) {
        buf[idx(x, browY)] = clampIdx(shadow);
      }
      if (isInk(evolvedMask, x, browY - 1) && buf[idx(x, browY - 1)]! > 0 && rng() < stageMid * 0.5) {
        buf[idx(x, browY - 1)] = clampIdx(shadow);
      }
    }

    // Slant eye band by shifting indices on outer edges of each eye
    const slant = Math.floor(stageMid * 2);
    for (let y = geom.eyeY0; y <= geom.eyeY1; y++) {
      for (let dx = -3; dx <= 3; dx++) {
        const xl = geom.eyeLeftX + dx;
        const xr = geom.eyeRightX - dx;
        if (isInk(evolvedMask, xl, y) && buf[idx(xl, y)]! > 0) {
          buf[idx(xl, y)] = clampIdx(buf[idx(xl, y)]! + (dx < 0 ? slant : 0));
        }
        if (isInk(evolvedMask, xr, y) && buf[idx(xr, y)]! > 0) {
          buf[idx(xr, y)] = clampIdx(buf[idx(xr, y)]! + (dx > 0 ? slant : 0));
        }
      }
    }

    // Maskline from lower-face negative space (darken interior lower region)
    for (let y = geom.lowerY0; y <= geom.maxY; y++) {
      const ny = (y - geom.lowerY0) / Math.max(1, geom.maxY - geom.lowerY0);
      for (let x = geom.minX; x <= geom.maxX; x++) {
        const i = idx(x, y);
        if (!isInk(evolvedMask, x, y) || buf[i] === 0) continue;
        if (ny > 0.25 && rng() < stageMid * (0.35 + ny * 0.45)) {
          buf[i] = clampIdx(ny > 0.55 ? maskTone : deep);
        }
      }
    }

    // Subtle asymmetry from contour
    for (let y = geom.minY; y <= geom.maxY; y++) {
      for (let x = geom.minX; x <= geom.maxX; x++) {
        const i = idx(x, y);
        if (buf[i] === 0 || !isInk(evolvedMask, x, y)) continue;
        const side = x < geom.cx ? -1 : 1;
        if (rng() < stageMid * 0.12 * side) {
          buf[i] = clampIdx(buf[i]! + side);
        }
      }
    }

    // Hair growth from top/side silhouette edges
    for (let y = geom.minY; y <= geom.minY + Math.floor(geom.height * 0.35); y++) {
      for (let x = geom.minX; x <= geom.maxX; x++) {
        if (!isInk(evolvedMask, x, y)) continue;
        const ed = edgeDist(evolvedMask, x, y);
        if (ed === 1 && y <= geom.minY + 4 && rng() < stageMid * 0.28) {
          const hy = y - 1;
          if (hy >= 0 && buf[idx(x, hy)] === 0) {
            buf[idx(x, hy)] = clampIdx(hot - 1);
          }
        }
      }
    }
  }

  // 60–100: drift corruption while keeping core mass traceable
  if (stageHigh > 0) {
    for (let y = 0; y < CHROMIE_GRID; y++) {
      for (let x = 0; x < CHROMIE_GRID; x++) {
        const i = idx(x, y);
        const onSil = isInk(evolvedMask, x, y);
        if (!onSil && buf[i] === 0) continue;

        const ed = onSil ? edgeDist(evolvedMask, x, y) : 99;
        const inCore =
          onSil &&
          y >= geom.eyeY0 - 2 &&
          y <= geom.eyeY1 + 2 &&
          x >= geom.eyeLeftX - 6 &&
          x <= geom.eyeRightX + 6;
        const inHeadCore =
          onSil &&
          y >= geom.minY &&
          y <= geom.maxY &&
          x >= geom.cx - Math.floor(geom.width * 0.35) &&
          x <= geom.cx + Math.floor(geom.width * 0.35);

        // Edge glitch / fragmentation (not core eyes)
        if (onSil && ed <= 1 && !inCore && rng() < stageHigh * 0.42) {
          if (rng() < stageHigh * 0.18) {
            buf[i] = 0;
          } else {
            buf[i] = clampIdx(rng() < 0.5 ? corrupt : hot);
          }
          continue;
        }

        // Lower-face mask overtakes
        if (onSil && y >= geom.lowerY0 && !inCore && rng() < stageHigh * 0.55) {
          buf[i] = clampIdx(maskTone);
          continue;
        }

        // Palette corruption on mid interior
        if (onSil && ed >= 2 && !inHeadCore && rng() < stageHigh * 0.25) {
          buf[i] = clampIdx(corrupt);
          continue;
        }

        if (onSil && ed >= 2 && rng() < stageHigh * 0.15) {
          buf[i] = clampIdx(glow);
        }

        // Expand hair chaos from side edges at high drift
        if (onSil && ed === 1 && y < geom.cy && rng() < stageHigh * 0.2) {
          const ox = x + (x < geom.cx ? -1 : 1);
          if (ox >= 0 && ox < CHROMIE_GRID && buf[idx(ox, y)] === 0) {
            buf[idx(ox, y)] = clampIdx(hot);
          }
        }
      }
    }
  }

  return buf;
}

export type PureChromieGenerateFn = (
  lineageId: number,
  driftLevel: number,
) => {
  buf: Uint8Array;
  palette: MirrorPalette;
  paletteId: number;
  traits: Record<string, string | number>;
};

export function buildPureChromie(
  normieId: number,
  generateSpecies: PureChromieGenerateFn,
): DriftChromieResult {
  const token = generateSpecies(normieId, 1);
  return {
    buf: token.buf,
    palette: token.palette,
    paletteId: token.paletteId,
    traits: {
      Mode: "Chromie Species",
      Form: "Canonical Emergence",
      SignalDrift: "100%",
      Anchor: "Chromie",
      Descriptor: "Species emerged.",
      NormieId: normieId,
      Lineage: `Normie #${normieId}`,
      Palette: token.palette.name,
      Grid: "64×64 indexed",
      Mutation: "pure-species",
      StructuralEvolution: "100%",
      ...token.traits,
    },
  };
}

export function buildDriftChromie(
  normieId: number,
  pixelString: string,
  driftLevel: number,
  paletteFamilyId: PaletteFamilyId,
  mirror: MirrorChromieResult | null,
): DriftChromieResult {
  if (!mirror) {
    throw new Error("Mirror buffer required for Normie-memory drift.");
  }
  const t = clampDrift(driftLevel);
  const mask64 = upscaleNormieTo64(parseNormiePixels(pixelString));
  const structuralPct = Math.round(getStructuralStrength(t, false) * 100);
  const buf =
    t <= 0.001 ? mirror.buf : mutateMirrorBuffer(mirror.buf, mask64, normieId, t, PALETTE_SEMANTIC);
  const palette = paletteFamilyToMirrorPalette(paletteFamilyId);
  const pct = driftPercent(t);

  return {
    buf,
    palette,
    paletteId: palette.id,
    traits: {
      Mode: t < 0.25 ? "Mirror Reconstruction" : t < 0.6 ? "Signal Evolution" : "Drift Mutation",
      Form: "Chromie Evolution",
      SignalDrift: `${pct}%`,
      StructuralEvolution: `${structuralPct}%`,
      Anchor: getDriftAnchorLabel(t),
      Descriptor: getDriftDescriptor(t),
      NormieId: normieId,
      PaletteFamily: palette.name,
      Grid: "64×64 indexed",
      Mutation: "structural-pixel-state",
    },
  };
}
