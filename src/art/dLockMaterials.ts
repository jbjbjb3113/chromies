import type { PaletteFamilyId } from "./paletteFamilies";
import { PALETTE_SEMANTIC as I } from "./paletteFamilies";
import {
  materialIndicesForProfile,
  resolveMaterialProfile,
  type MaterialProfile,
} from "./dLockMaterialProfiles";
import type { CanonicalHeroChromie } from "./dLockHeroes";

/** Per-surface index roles — palette family tints the ramp, not the structure. */
export type DLockMaterials = {
  skullDeep: number;
  skullShadow: number;
  skullMid: number;
  skullLight: number;
  browMass: number;
  browDeep: number;
  socketRecess: number;
  socketDeep: number;
  nosePlane: number;
  cheekPlane: number;
  cheekLight: number;
  maskMatte: number;
  maskHighlight: number;
  maskShadow: number;
  maskSeam: number;
  eyeSocket: number;
  eyeCore: number;
  eyeCatch: number;
  hoodDeep: number;
  hoodCloth: number;
  hoodRim: number;
  hoodInterior: number;
  chainMetal: number;
  chainBright: number;
  chainShadow: number;
  signalSeam: number;
  shoulderMass: number;
};

export function getDLockMaterials(
  familyId: PaletteFamilyId,
  profile?: MaterialProfile,
): DLockMaterials {
  const p = profile ? materialIndicesForProfile(profile) : null;
  const base: DLockMaterials = {
    skullDeep: I.deep,
    skullShadow: I.shadowA,
    skullMid: I.midB,
    skullLight: I.highlightA,
    browMass: I.shadowB,
    browDeep: I.deep,
    socketRecess: p?.eyeSocket ?? I.shadowA,
    socketDeep: I.deep,
    nosePlane: I.midC,
    cheekPlane: I.shadowB,
    cheekLight: I.midD,
    maskMatte: p?.maskBase ?? I.maskAccent,
    maskHighlight: p?.maskHighlight ?? I.midC,
    maskShadow: I.deep,
    maskSeam: p?.maskSeam ?? I.shadowB,
    eyeSocket: p?.eyeSocket ?? I.shadowB,
    eyeCore: p?.eyeCore ?? I.glow,
    eyeCatch: p?.eyeCatch ?? I.highlightB,
    hoodDeep: p?.hoodBase ?? I.deep,
    hoodCloth: p?.hoodFold ?? I.shadowA,
    hoodRim: I.shadowB,
    hoodInterior: p?.hoodInterior ?? I.shadowA,
    chainMetal: p?.chainBright ?? I.midC,
    chainBright: p?.chainBright ?? I.highlightB,
    chainShadow: p?.chainDull ?? I.shadowA,
    signalSeam: I.corruption,
    shoulderMass: I.shadowB,
  };

  switch (familyId) {
    case "signal":
      return { ...base, signalSeam: I.accent };
    case "graffiti":
      return { ...base, chainBright: I.accent, eyeCore: p?.eyeCore ?? I.accent };
    case "acid":
      return { ...base, signalSeam: I.glow, eyeCore: p?.eyeCore ?? I.corruption };
    case "blood":
      return { ...base, maskMatte: p?.maskBase ?? I.shadowB };
    case "ghost":
      return { ...base, hoodInterior: p?.hoodInterior ?? I.midA, eyeCatch: p?.eyeCatch ?? I.glow };
    case "overgrown":
      return { ...base, maskMatte: p?.maskBase ?? I.midC, hoodCloth: p?.hoodFold ?? I.shadowB };
    default:
      return base;
  }
}

export function buildMaterialsForLineage(
  familyId: PaletteFamilyId,
  lineageId: number,
  hero?: CanonicalHeroChromie | null,
): { materials: DLockMaterials; profile: MaterialProfile } {
  const profile = resolveMaterialProfile(lineageId, familyId, hero);
  return { materials: getDLockMaterials(familyId, profile), profile };
}

export function semanticFromMaterials(M: DLockMaterials) {
  return {
    deep: M.skullDeep,
    shadowA: M.skullShadow,
    midB: M.skullMid,
    highlightA: M.skullLight,
    accent: M.eyeCore,
    glow: M.eyeCatch,
    maskAccent: M.maskMatte,
    highlightC: M.chainMetal,
  };
}
