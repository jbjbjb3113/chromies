/**
 * Amplitude-driven talk mouth for token #1 — nORMIES-style vertical slit
 * at the live mouth anchor coords.
 */
import { rmsToMouthTarget, smoothMouthLevel } from "../../lib/chromie-agent-mouth.js";

export const MIST_TALK_MOUTH = {
  anchor: [32, 34],
  lineXMin: 29,
  lineXMax: 34,
  centerY: 34,
  yMin: 32,
  yMax: 35,
  gate: 0.04,
  maxOpenRows: 4,
  // Warm skin row above lip on token #1 base sprite (y=32 ≈ SIGNAL skin_light #d18b4d).
  interiorSkinRefY: 32,
  // Rosy lip-cavity tone — sprite has no native pink pixels; blend into local skin sample.
  interiorRoseRgba: [188, 102, 98],
  interiorRoseBlend: 0.5,
};

function blendInteriorPink(skinR, skinG, skinB, rose, blend) {
  const keep = 1 - blend;
  return [
    Math.round(rose[0] * blend + skinR * keep),
    Math.round(rose[1] * blend + skinG * keep),
    Math.round(rose[2] * blend + skinB * keep),
  ];
}

/** Map ElevenLabs output volume scalar (0–1) to mouth-open target. */
export function volumeToMouthTarget(volume) {
  return rmsToMouthTarget(Math.max(0, volume) * 0.35);
}

export function smoothTalkMouthLevel(current, target) {
  return smoothMouthLevel(current, target);
}

/**
 * Paint a vertically expanding mouth opening on the mouth line pixels.
 * Only touches the talk line columns; corner pixels stay from base/expression.
 */
export function applyTalkSyncToImageData(imageData, mouthLevel, baseImageData) {
  if (mouthLevel <= MIST_TALK_MOUTH.gate) return;

  const { data, width } = imageData;
  const base = baseImageData.data;
  const openRows = Math.max(1, Math.round(mouthLevel * MIST_TALK_MOUTH.maxOpenRows));
  const slitStart = MIST_TALK_MOUTH.centerY - Math.floor(openRows / 2);

  for (let x = MIST_TALK_MOUTH.lineXMin; x <= MIST_TALK_MOUTH.lineXMax; x++) {
    const closedI = (MIST_TALK_MOUTH.centerY * width + x) * 4;
    const lipR = base[closedI];
    const lipG = base[closedI + 1];
    const lipB = base[closedI + 2];

    for (let r = 0; r < openRows; r++) {
      const y = slitStart + r;
      if (y < MIST_TALK_MOUTH.yMin || y > MIST_TALK_MOUTH.yMax) continue;
      const i = (y * width + x) * 4;
      const isEdge = r === 0 || r === openRows - 1;
      if (isEdge && openRows > 1) {
        data[i] = lipR;
        data[i + 1] = lipG;
        data[i + 2] = lipB;
        data[i + 3] = 255;
      } else {
        const skinI = (MIST_TALK_MOUTH.interiorSkinRefY * width + x) * 4;
        const [pr, pg, pb] = blendInteriorPink(
          base[skinI],
          base[skinI + 1],
          base[skinI + 2],
          MIST_TALK_MOUTH.interiorRoseRgba,
          MIST_TALK_MOUTH.interiorRoseBlend,
        );
        data[i] = pr;
        data[i + 1] = pg;
        data[i + 2] = pb;
        data[i + 3] = 255;
      }
    }
  }
}
