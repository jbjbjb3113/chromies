/** Hardcoded token #1 facial rig excerpt for /awaken-demo idle blink. */
import eyePatches from "./mist-eye-patches.json";
import mouthPatches from "./mist-mouth-patches.json";

/** Sprite panel background — matches MIST_BG / --chroma-bg on awaken-demo */
export const MIST_SPRITE_BG = "#e3e5e4";

export const MIST_BASELINE_EYE = eyePatches.baseline;

export const MIST_TOKEN_1_RIG = {
  eyes: eyePatches.maskCoords.filter(([x]) => x !== 29),
  closedEyeFill: [212, 184, 168, 255],
};

export const MIST_EYE_VARIANT_POOL = Object.keys(eyePatches.variants);

/** Locked eye variant while agent is speaking. */
export const MIST_EYE_SPEECH_STRAIGHT = "Chubby_Squint_Straight";

/** 12fps — matches scenes/single-blink.json */
export const MIST_IDLE_FPS = 12;

/** ~6s between blinks; 3-frame close — single-blink.json uses interval 30 @ 12fps */
export const MIST_BLINK = {
  phase: 36,
  intervalFrames: 72,
  durationFrames: 3,
};

/**
 * Sine bob — one full cycle every periodFrames (~2s @ 12fps).
 * amplitudeNative: peak shift in 64px grid units (1 ≈ one compositor row).
 */
export const MIST_BOB = {
  phase: 0,
  periodFrames: 24,
  amplitudeNative: 1,
};

/** Random eye-expression flavor — independent of blink cadence */
export const MIST_EYE_CYCLE = {
  minIntervalMs: 15000,
  maxIntervalMs: 30000,
  holdFrames: 24,
};

/** Mood mouth expressions — independent of talk-sync */
export const MIST_MOUTH_BASELINE = mouthPatches.baseline;
export const MIST_MOUTH_ANCHOR = mouthPatches.mouthAnchor;
export const MIST_MOUTH_VARIANT_POOL = Object.keys(mouthPatches.variants);
export const MIST_MOUTH_TRANSITION = mouthPatches.transition;

export const MIST_MOUTH_CYCLE = {
  minIntervalMs: 20000,
  maxIntervalMs: 40000,
};

export function isBlinkFrame(frameIndex, blink = MIST_BLINK) {
  return (
    frameIndex >= blink.phase &&
    (frameIndex - blink.phase) % blink.intervalFrames < blink.durationFrames
  );
}

/** Continuous sine offset in native grid pixels (negative = up, positive = down). */
export function bobOffsetNative(frameIndex, bob = MIST_BOB) {
  const { phase, periodFrames, amplitudeNative } = bob;
  return amplitudeNative * Math.sin((2 * Math.PI * (frameIndex + phase)) / periodFrames);
}

/** Display-pixel bob offset given native-pixel scale factor. */
export function bobOffsetDisplay(frameIndex, nativePixelSize, bob = MIST_BOB) {
  return bobOffsetNative(frameIndex, bob) * nativePixelSize;
}

export function getMistEyeDebugConfig() {
  if (typeof window === "undefined") {
    return { enabled: false, forceVariant: null, fastCycle: false };
  }
  const params = new URLSearchParams(window.location.search);
  const enabled = params.get("mistEyeDebug") === "1";
  const forceVariant = params.get("mistEyeForce") || null;
  const fastCycle = params.get("mistEyeFast") === "1";
  return { enabled, forceVariant, fastCycle };
}

export function getMistMouthDebugConfig() {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      forceVariant: null,
      talkSim: false,
      forceTalkLevel: null,
      logAudio: false,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const enabled = params.get("mistMouthDebug") === "1";
  const forceVariant = params.get("mistMouthForce") || null;
  const talkSim = params.get("mistTalkSim") === "1";
  const forceTalkLevelRaw = params.get("mistMouthLevel");
  const forceTalkLevel =
    forceTalkLevelRaw != null && forceTalkLevelRaw !== ""
      ? Math.min(1, Math.max(0, Number.parseFloat(forceTalkLevelRaw)))
      : null;
  const logAudio = enabled || params.get("mistAudioLog") === "1";
  return { enabled, forceVariant, talkSim, forceTalkLevel, logAudio };
}

export function scheduleEyeCycleDelay(cycle = MIST_EYE_CYCLE) {
  const span = cycle.maxIntervalMs - cycle.minIntervalMs;
  return cycle.minIntervalMs + Math.random() * span;
}

export function pickRandomEyeVariant() {
  const idx = Math.floor(Math.random() * MIST_EYE_VARIANT_POOL.length);
  return MIST_EYE_VARIANT_POOL[idx];
}

export function paintEyePixels(imageData, pixels) {
  const { data, width } = imageData;
  for (const { x, y, rgba } of pixels) {
    const i = (y * width + x) * 4;
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
}

export function blinkCoordsForVariant(variantName) {
  if (!variantName) {
    return MIST_TOKEN_1_RIG.eyes;
  }
  return eyePatches.variants[variantName].map(({ x, y }) => [x, y]);
}

export function variantPixels(variantName) {
  return eyePatches.variants[variantName] ?? null;
}

export function applyBlinkToImageData(
  imageData,
  rig = MIST_TOKEN_1_RIG,
  eyesOverride = null,
) {
  const { data, width } = imageData;
  const [r, g, b, a] = rig.closedEyeFill;
  const eyes = eyesOverride ?? rig.eyes;
  for (const [x, y] of eyes) {
    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
}

export function createEyeCycleState(now = performance.now()) {
  return {
    activeVariant: null,
    holdUntilFrame: 0,
    nextCycleAtMs: now + scheduleEyeCycleDelay(),
  };
}

/** Immediately lock eyes on Straight for the duration of speech. */
export function lockEyeStraightForSpeech(
  state,
  frameIndex,
  now = performance.now(),
  options = {},
) {
  const debug = options.debug ?? false;
  const reason = options.reason ?? "unknown";
  state.activeVariant = MIST_EYE_SPEECH_STRAIGHT;
  state.holdUntilFrame = frameIndex + 10_000_000;
  if (debug) {
    console.log("[mist-eye] lockStraightForSpeech", {
      reason,
      variant: MIST_EYE_SPEECH_STRAIGHT,
      frameIndex,
      ts: now,
    });
  }
}

/** After speech ends, resume idle eye cycling without flashing base Squint_Right. */
export function resumeEyeCycleAfterSpeech(
  state,
  frameIndex,
  now = performance.now(),
  options = {},
) {
  const debug = options.debug ?? false;
  const reason = options.reason ?? "unknown";
  // Keep Straight visible through a normal hold; idle swap END picks up later.
  state.holdUntilFrame = frameIndex + MIST_EYE_CYCLE.holdFrames;
  state.nextCycleAtMs = now + scheduleEyeCycleDelay();
  if (debug) {
    console.log("[mist-eye] resumeEyeCycleAfterSpeech", {
      reason,
      ts: now,
      holdUntilFrame: state.holdUntilFrame,
      nextCycleAtMs: state.nextCycleAtMs,
      activeVariant: state.activeVariant,
    });
  }
}

export function advanceEyeCycleState(state, frameIndex, now = performance.now(), options = {}) {
  const debug = options.debug ?? null;
  const forceVariant = options.forceVariant ?? null;
  const speechActive = options.speechActive ?? false;
  const cycle = options.fastCycle
    ? { minIntervalMs: 3000, maxIntervalMs: 5000, holdFrames: 36 }
    : MIST_EYE_CYCLE;

  if (speechActive) {
    if (state.activeVariant !== MIST_EYE_SPEECH_STRAIGHT) {
      state.activeVariant = MIST_EYE_SPEECH_STRAIGHT;
      state.holdUntilFrame = frameIndex + 10_000_000;
      if (debug) {
        console.log("[mist-eye] reassertStraightForSpeech", {
          frameIndex,
          ts: now,
        });
      }
    }
    return;
  }

  if (forceVariant) {
    if (state.activeVariant !== forceVariant) {
      state.activeVariant = forceVariant;
      state.holdUntilFrame = frameIndex + cycle.holdFrames;
      if (debug) {
        console.log("[mist-eye] FORCED variant", forceVariant, { frameIndex, ts: now });
      }
    }
    return;
  }

  if (!state.activeVariant && now >= state.nextCycleAtMs) {
    state.activeVariant = pickRandomEyeVariant();
    state.holdUntilFrame = frameIndex + cycle.holdFrames;
    if (debug) {
      const pixels = variantPixels(state.activeVariant);
      console.log("[mist-eye] swap START", state.activeVariant, {
        frameIndex,
        ts: now,
        holdUntilFrame: state.holdUntilFrame,
        pixels: pixels?.map((p) => ({ x: p.x, y: p.y, rgba: p.rgba })),
      });
    }
    return;
  }

  if (state.activeVariant && frameIndex >= state.holdUntilFrame) {
    if (debug) {
      console.log("[mist-eye] swap END", state.activeVariant, { frameIndex, ts: now });
    }
    state.activeVariant = null;
    state.nextCycleAtMs = now + (options.fastCycle ? 3000 + Math.random() * 2000 : scheduleEyeCycleDelay());
  }
}

export function scheduleMouthCycleDelay(cycle = MIST_MOUTH_CYCLE) {
  const span = cycle.maxIntervalMs - cycle.minIntervalMs;
  return cycle.minIntervalMs + Math.random() * span;
}

export function pickRandomMouthVariant() {
  const idx = Math.floor(Math.random() * MIST_MOUTH_VARIANT_POOL.length);
  return MIST_MOUTH_VARIANT_POOL[idx];
}

export function mouthVariantData(variantName) {
  return mouthPatches.variants[variantName] ?? null;
}

export function mouthPixelsForStep(variantName, stepIndex) {
  const data = mouthVariantData(variantName);
  if (!data) return null;
  if (!data.steps?.length) return data.pixels;
  const clamped = Math.min(stepIndex, data.steps.length - 1);
  return data.steps[clamped];
}

export function createMouthExpressionState(now = performance.now()) {
  return {
    phase: "idle",
    activeVariant: null,
    stepIndex: 0,
    releaseStepIndex: 0,
    phaseUntilFrame: 0,
    nextCycleAtMs: now + scheduleMouthCycleDelay(),
  };
}

/** Clear any in-flight expression; mouth shows live base only (no overlay). */
export function resetMouthExpressionState(state, now = performance.now(), options = {}) {
  const debug = options.debug ?? false;
  const reason = options.reason ?? "unknown";
  if (debug) {
    console.log("[mist-mouth] resetMouthExpressionState", {
      reason,
      ts: now,
      priorVariant: state.activeVariant,
      priorPhase: state.phase,
    });
  }
  state.phase = "idle";
  state.activeVariant = null;
  state.stepIndex = 0;
  state.releaseStepIndex = 0;
  state.phaseUntilFrame = 0;
  state.nextCycleAtMs = now + scheduleMouthCycleDelay();
}

/** After speech ends, defer the next idle expression so cycling does not fire immediately. */
export function resumeMouthExpressionCycle(state, now = performance.now(), options = {}) {
  const debug = options.debug ?? false;
  const reason = options.reason ?? "unknown";
  if (debug) {
    console.log("[mist-mouth] resumeMouthExpressionCycle", {
      reason,
      ts: now,
      nextCycleAtMs: now + scheduleMouthCycleDelay(),
    });
  }
  resetMouthExpressionState(state, now, { debug: false });
}

/**
 * Stepped forward lead-up, hold at full expression, fast reverse release.
 * Not called while speech is active — see resetMouthExpressionState.
 */
export function advanceMouthExpressionState(
  state,
  frameIndex,
  now = performance.now(),
  options = {},
) {
  const forceVariant = options.forceVariant ?? null;
  const transition = MIST_MOUTH_TRANSITION;
  const stepFrames = transition.stepFrames;
  const holdFrames = transition.holdFrames;

  if (forceVariant) {
    if (state.activeVariant !== forceVariant || state.phase !== "hold") {
      state.activeVariant = forceVariant;
      state.phase = "hold";
      state.stepIndex = (mouthVariantData(forceVariant)?.steps?.length ?? 1) - 1;
      state.phaseUntilFrame = frameIndex + 10_000;
      if (options.debug) {
        console.log("[mist-mouth] FORCED expression", forceVariant, { frameIndex, ts: now });
      }
    }
    return;
  }

  if (state.phase === "idle") {
    if (now < state.nextCycleAtMs) return;
    state.activeVariant = pickRandomMouthVariant();
    state.stepIndex = 0;
    state.phase = "forward";
    state.phaseUntilFrame = frameIndex + stepFrames;
    return;
  }

  if (state.phase === "forward") {
    if (frameIndex < state.phaseUntilFrame) return;
    const data = mouthVariantData(state.activeVariant);
    const maxStep = Math.max(0, (data?.steps?.length ?? 1) - 1);
    if (state.stepIndex < maxStep) {
      state.stepIndex += 1;
      state.phaseUntilFrame = frameIndex + stepFrames;
      return;
    }
    state.phase = "hold";
    state.phaseUntilFrame = frameIndex + holdFrames;
    return;
  }

  if (state.phase === "hold") {
    if (frameIndex < state.phaseUntilFrame) return;
    if (transition.reverseMode === "snap") {
      state.phase = "idle";
      state.activeVariant = null;
      state.stepIndex = 0;
      state.nextCycleAtMs = now + scheduleMouthCycleDelay();
      return;
    }
    const data = mouthVariantData(state.activeVariant);
    const maxStep = Math.max(0, (data?.steps?.length ?? 1) - 1);
    if (maxStep === 0) {
      state.phase = "idle";
      state.activeVariant = null;
      state.stepIndex = 0;
      state.nextCycleAtMs = now + scheduleMouthCycleDelay();
      return;
    }
    state.phase = "release";
    state.releaseStepIndex = maxStep - 1;
    state.phaseUntilFrame = frameIndex + 1;
    return;
  }

  if (state.phase === "release") {
    if (frameIndex < state.phaseUntilFrame) return;
    if (state.releaseStepIndex > 0) {
      state.releaseStepIndex -= 1;
      state.phaseUntilFrame = frameIndex + 1;
      return;
    }
    state.phase = "idle";
    state.activeVariant = null;
    state.stepIndex = 0;
    state.releaseStepIndex = 0;
    state.nextCycleAtMs = now + scheduleMouthCycleDelay();
  }
}

export function mouthExpressionPixels(state) {
  if (!state.activeVariant || state.phase === "idle") return null;
  if (state.phase === "hold") {
    return mouthVariantData(state.activeVariant)?.pixels ?? null;
  }
  if (state.phase === "release") {
    return mouthPixelsForStep(state.activeVariant, state.releaseStepIndex);
  }
  return mouthPixelsForStep(state.activeVariant, state.stepIndex);
}
