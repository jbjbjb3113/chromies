/**
 * Amplitude-driven talk mouth for token #1 — nORMIES-style vertical slit
 * at the live mouth anchor coords.
 */
import { rmsToMouthTarget, smoothMouthLevel } from "../../lib/chromie-agent-mouth.js";

const MIST_TALK_MOUTH_BASE = {
  anchor: [32, 34],
  lineXMin: 29,
  lineXMax: 34,
  centerY: 34,
  yMax: 35,
  gate: 0.04,
  // Warm skin row above lip on token #1 base sprite (y=32 ≈ SIGNAL skin_light #d18b4d).
  interiorSkinRefY: 32,
  // Rosy lip-cavity tone — sprite has no native pink pixels; blend into local skin sample.
  interiorRoseRgba: [188, 102, 98],
  interiorRoseBlend: 0.5,
};

/** Desktop / TokenListingCard — full 4-row talk slit (y 32–35). */
export const MIST_TALK_MOUTH = {
  ...MIST_TALK_MOUTH_BASE,
  yMin: 32,
  maxOpenRows: 4,
};

/** Mobile full-bleed layout — one row less amplitude (y 33–35). */
export const MIST_TALK_MOUTH_MOBILE = {
  ...MIST_TALK_MOUTH_BASE,
  yMin: 33,
  maxOpenRows: 3,
};

export function getTalkMouthConfig(mobileLayout = false) {
  return mobileLayout ? MIST_TALK_MOUTH_MOBILE : MIST_TALK_MOUTH;
}

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
export function applyTalkSyncToImageData(
  imageData,
  mouthLevel,
  baseImageData,
  { mobileLayout = false } = {},
) {
  const talkMouth = getTalkMouthConfig(mobileLayout);
  if (mouthLevel <= talkMouth.gate) return;

  const { data, width } = imageData;
  const base = baseImageData.data;
  const openRows = Math.max(1, Math.round(mouthLevel * talkMouth.maxOpenRows));
  const slitStart = talkMouth.centerY - Math.floor(openRows / 2);

  for (let x = talkMouth.lineXMin; x <= talkMouth.lineXMax; x++) {
    const closedI = (talkMouth.centerY * width + x) * 4;
    const lipR = base[closedI];
    const lipG = base[closedI + 1];
    const lipB = base[closedI + 2];

    for (let r = 0; r < openRows; r++) {
      const y = slitStart + r;
      if (y < talkMouth.yMin || y > talkMouth.yMax) continue;
      const i = (y * width + x) * 4;
      const isEdge = r === 0 || r === openRows - 1;
      if (isEdge && openRows > 1) {
        data[i] = lipR;
        data[i + 1] = lipG;
        data[i + 2] = lipB;
        data[i + 3] = 255;
      } else {
        const skinI = (talkMouth.interiorSkinRefY * width + x) * 4;
        const [pr, pg, pb] = blendInteriorPink(
          base[skinI],
          base[skinI + 1],
          base[skinI + 2],
          talkMouth.interiorRoseRgba,
          talkMouth.interiorRoseBlend,
        );
        data[i] = pr;
        data[i + 1] = pg;
        data[i + 2] = pb;
        data[i + 3] = 255;
      }
    }
  }
}
