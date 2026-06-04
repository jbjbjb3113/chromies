export type AwakeningModifiers = {
  asymmetryStrength: number;
  maskAggression: number;
  paletteMutation: number;
  hairChaos: number;
  grimeLevel: number;
  eyeSlant: number;
  silhouetteVariance: number;
};

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp drift to 0.0–1.0. */
export function clampDrift(driftLevel: number): number {
  return Math.max(0, Math.min(1, driftLevel));
}

/** UI percent (0–100) → normalized drift. */
export function driftFromPercent(percent: number): number {
  return clampDrift(percent / 100);
}

/** Normalized drift → UI percent. */
export function driftPercent(driftLevel: number): number {
  return Math.round(clampDrift(driftLevel) * 100);
}

/** Deterministic seed component from continuous drift. */
export function awakeningSeed(driftLevel: number): number {
  const q = Math.floor(clampDrift(driftLevel) * 1_000_000);
  return 100_003 + q;
}

/** CHROMIES D-Lock — stable canonical species (reference/canon/D LOCK Doctrine.png). */
export function getPureChromieModifiers(): AwakeningModifiers {
  return {
    asymmetryStrength: 0.88,
    maskAggression: 1,
    paletteMutation: 0.72,
    hairChaos: 0.8,
    grimeLevel: 0.18,
    eyeSlant: 1,
    silhouetteVariance: 0.12,
  };
}

/** Continuous signal drift drives all mutation systems. */
export function getAwakeningModifiers(driftLevel: number): AwakeningModifiers {
  const t = clampDrift(driftLevel);
  return {
    asymmetryStrength: lerp(0.05, 0.9, t),
    maskAggression: lerp(0, 1, t),
    paletteMutation: lerp(0.1, 1, t),
    hairChaos: lerp(0, 1, t),
    grimeLevel: lerp(0, 1, t),
    eyeSlant: lerp(0.05, 1, t),
    silhouetteVariance: lerp(0, 0.8, t),
  };
}

/** Live descriptor under the slider. */
export function getDriftDescriptor(driftLevel: number): string {
  const t = clampDrift(driftLevel);
  if (t < 0.2) return "Memory preserved.";
  if (t < 0.65) return "Signal evolving.";
  return "Identity drifting.";
}

/** Anchor label nearest classic Mirror / Awakened / Drift points. */
export function getDriftAnchorLabel(driftLevel: number, pureChromieMode = false): string {
  if (pureChromieMode) return "Chromie";
  const pct = driftPercent(driftLevel);
  if (pct <= 25) return "Mirror";
  if (pct <= 75) return "Awakened";
  return "Drift";
}

/** Legacy build env: MIRROR=0, AWAKENED=50, DRIFT=100. */
export function driftFromLegacyMode(mode: string): number {
  if (mode === "MIRROR") return 0;
  if (mode === "DRIFT") return 1;
  return 0.5;
}
