/** Lip-sync smoothing (ElevenLabs RMS + browser speech envelopes). */

export const MOUTH_RMS_GATE = 0.016;
export const MOUTH_RMS_SPAN = 0.1;
const MOUTH_ATTACK = 0.42;
const MOUTH_RELEASE = 0.16;

export function rmsToMouthTarget(rms) {
  const normalized = Math.max(0, Math.min(1, (rms - MOUTH_RMS_GATE) / MOUTH_RMS_SPAN));
  const curved = Math.pow(normalized, 1.5);
  return Math.min(1, curved * 1.12);
}

export function smoothMouthLevel(current, target) {
  const k = target > current ? MOUTH_ATTACK : MOUTH_RELEASE;
  return current + (target - current) * k;
}

export function wordEnergyToMouthTarget(charLength) {
  const len = Math.max(1, charLength);
  const pseudoRms = Math.min(0.22, 0.06 + len * 0.012);
  return rmsToMouthTarget(pseudoRms);
}

export function createMouthDriver() {
  let smoothed = 0;
  let energyTarget = 0;
  return {
    pushTarget(target) {
      energyTarget = Math.max(energyTarget, Math.min(1, target));
    },
    tick() {
      if (energyTarget > 0.02) energyTarget *= 0.88;
      else energyTarget = 0;
      smoothed = smoothMouthLevel(smoothed, energyTarget);
      return smoothed;
    },
    reset() {
      smoothed = 0;
      energyTarget = 0;
    },
  };
}
