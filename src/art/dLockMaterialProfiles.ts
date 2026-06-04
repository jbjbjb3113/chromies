import type { PaletteFamilyId } from "./paletteFamilies";
import { PALETTE_SEMANTIC as I } from "./paletteFamilies";
import type { CanonicalHeroChromie } from "./dLockHeroes";

export const MASK_MATERIALS = [
  "matte-ceramic",
  "cloth-wrap",
  "signal-plate",
  "stitched-synthetic",
  "vented-shell",
] as const;

export const HOODIE_MATERIALS = [
  "heavy-cloth",
  "washed-fabric",
  "signal-lined",
  "shadow-matte",
  "faded-techwear",
] as const;

export const CHAIN_MATERIALS = [
  "brushed-metal",
  "polished-chrome",
  "oxidized-signal",
  "relic-chain",
  "dark-steel",
] as const;

export const EYE_MATERIALS = [
  "signal-glow",
  "ghost-haze",
  "static-flicker",
  "dead-null",
  "riot-ember",
] as const;

export type MaskMaterial = (typeof MASK_MATERIALS)[number];
export type HoodieMaterial = (typeof HOODIE_MATERIALS)[number];
export type ChainMaterial = (typeof CHAIN_MATERIALS)[number];
export type EyeMaterial = (typeof EYE_MATERIALS)[number];

export type MaterialProfile = {
  mask: MaskMaterial;
  hoodie: HoodieMaterial;
  chain: ChainMaterial;
  eye: EyeMaterial;
  label: string;
};

function pick<T>(seed: number, arr: readonly T[]): T {
  return arr[Math.abs(seed) % arr.length]!;
}

/** Deterministic material assignment from lineage (heroes override). */
export function resolveMaterialProfile(
  lineageId: number,
  familyId: PaletteFamilyId,
  hero?: CanonicalHeroChromie | null,
): MaterialProfile {
  if (hero?.materials) {
    return {
      ...hero.materials,
      label: `${hero.materials.mask} · ${hero.materials.hoodie} · ${hero.materials.chain} · ${hero.materials.eye}`,
    };
  }

  const s = lineageId * 2246822519 + familyId.length * 131;
  const familyBias: Partial<Record<PaletteFamilyId, { mask: number; eye: number }>> = {
    signal: { mask: 2, eye: 0 },
    graffiti: { mask: 3, eye: 4 },
    acid: { mask: 4, eye: 2 },
    blood: { mask: 0, eye: 3 },
    ghost: { mask: 1, eye: 1 },
    overgrown: { mask: 4, eye: 2 },
  };
  const bias = familyBias[familyId] ?? { mask: 0, eye: 0 };

  const mask = MASK_MATERIALS[(s + bias.mask) % MASK_MATERIALS.length]!;
  const hoodie = pick(s >>> 3, HOODIE_MATERIALS);
  const chain = pick(s >>> 7, CHAIN_MATERIALS);
  const eye = EYE_MATERIALS[((s >>> 11) + bias.eye) % EYE_MATERIALS.length]!;

  return { mask, hoodie, chain, eye, label: `${mask} · ${hoodie} · ${chain} · ${eye}` };
}

/** Map material profile → index roles on the family ramp (structure unchanged). */
export function materialIndicesForProfile(
  profile: MaterialProfile,
): {
  maskBase: number;
  maskHighlight: number;
  maskSeam: number;
  hoodBase: number;
  hoodFold: number;
  hoodInterior: number;
  chainBase: number;
  chainBright: number;
  chainDull: number;
  eyeSocket: number;
  eyeCore: number;
  eyeCatch: number;
} {
  const maskMap: Record<MaskMaterial, { base: number; hi: number; seam: number }> = {
    "matte-ceramic": { base: I.maskAccent, hi: I.midC, seam: I.shadowB },
    "cloth-wrap": { base: I.midD, hi: I.midC, seam: I.shadowA },
    "signal-plate": { base: I.maskAccent, hi: I.highlightA, seam: I.accent },
    "stitched-synthetic": { base: I.midB, hi: I.midD, seam: I.shadowB },
    "vented-shell": { base: I.shadowB, hi: I.maskAccent, seam: I.deep },
  };

  const hoodMap: Record<HoodieMaterial, { base: number; fold: number; interior: number }> = {
    "heavy-cloth": { base: I.deep, fold: I.shadowA, interior: I.shadowB },
    "washed-fabric": { base: I.shadowA, fold: I.midA, interior: I.shadowB },
    "signal-lined": { base: I.deep, fold: I.shadowA, interior: I.accent },
    "shadow-matte": { base: I.deep, fold: I.deep, interior: I.shadowA },
    "faded-techwear": { base: I.shadowB, fold: I.midA, interior: I.midB },
  };

  const chainMap: Record<ChainMaterial, { base: number; bright: number; dull: number }> = {
    "brushed-metal": { base: I.highlightC, bright: I.highlightB, dull: I.shadowA },
    "polished-chrome": { base: I.highlightB, bright: I.highlightA, dull: I.midC },
    "oxidized-signal": { base: I.midC, bright: I.accent, dull: I.shadowB },
    "relic-chain": { base: I.midD, bright: I.highlightC, dull: I.deep },
    "dark-steel": { base: I.shadowB, bright: I.midC, dull: I.deep },
  };

  const eyeMap: Record<EyeMaterial, { socket: number; core: number; catch: number }> = {
    "signal-glow": { socket: I.shadowB, core: I.glow, catch: I.highlightB },
    "ghost-haze": { socket: I.midA, core: I.highlightB, catch: I.glow },
    "static-flicker": { socket: I.shadowA, core: I.corruption, catch: I.glow },
    "dead-null": { socket: I.deep, core: I.midB, catch: I.shadowB },
    "riot-ember": { socket: I.shadowB, core: I.accent, catch: I.corruption },
  };

  const m = maskMap[profile.mask];
  const h = hoodMap[profile.hoodie];
  const c = chainMap[profile.chain];
  const e = eyeMap[profile.eye];

  return {
    maskBase: m.base,
    maskHighlight: m.hi,
    maskSeam: m.seam,
    hoodBase: h.base,
    hoodFold: h.fold,
    hoodInterior: h.interior,
    chainBase: c.base,
    chainBright: c.bright,
    chainDull: c.dull,
    eyeSocket: e.socket,
    eyeCore: e.core,
    eyeCatch: e.catch,
  };
}
