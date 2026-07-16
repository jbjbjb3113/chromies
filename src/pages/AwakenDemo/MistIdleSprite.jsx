import React, { useEffect, useRef, useState } from "react";
import { formatTokenId } from "../../lib/chromie-token.js";
import {
  MIST_BLINK,
  MIST_BOB,
  MIST_IDLE_FPS,
  MIST_SPRITE_BG,
  MIST_TOKEN_1_RIG,
  advanceEyeCycleState,
  advanceMouthExpressionState,
  applyBlinkToImageData,
  blinkCoordsForVariant,
  bobOffsetDisplay,
  createEyeCycleState,
  createMouthExpressionState,
  getMistEyeDebugConfig,
  getMistMouthDebugConfig,
  isBlinkFrame,
  lockEyeStraightForSpeech,
  mouthExpressionPixels,
  paintEyePixels,
  resetMouthExpressionState,
  resumeEyeCycleAfterSpeech,
  resumeMouthExpressionCycle,
  variantPixels,
} from "./mist-sprite-animation.js";
import { applyTalkSyncToImageData, MIST_TALK_MOUTH } from "./mist-talk-mouth.js";

const GRID = 64;
const DESKTOP_SPRITE_STYLE = {
  imageRendering: "pixelated",
  width: "min(50vw, 90vh)",
  height: "min(50vw, 90vh)",
  maxWidth: "100%",
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

function BobClipShell({ bobPaddingPx, shellRef, children, className = "" }) {
  return (
    <div
      className={`overflow-hidden ${className}`.trim()}
      style={{
        backgroundColor: MIST_SPRITE_BG,
        paddingTop: bobPaddingPx,
        paddingBottom: bobPaddingPx,
      }}
    >
      <div ref={shellRef} className="h-full w-full will-change-transform">
        {children}
      </div>
    </div>
  );
}

export default function MistIdleSprite({
  imageSrc,
  tokenId,
  variant,
  mouthLevel = 0,
  isSpeaking = false,
  isSpeechSession = false,
}) {
  const canvasRef = useRef(null);
  const shellRef = useRef(null);
  const baseImageDataRef = useRef(null);
  const frameRef = useRef(0);
  const eyeCycleRef = useRef(createEyeCycleState());
  const mouthExpressionRef = useRef(createMouthExpressionState());
  const talkMouthLevelRef = useRef(0);
  const speechActiveRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [bobPx, setBobPx] = useState(1);
  const reducedMotion = useReducedMotion();
  const debugConfig = getMistEyeDebugConfig();
  const mouthDebug = getMistMouthDebugConfig();

  useEffect(() => {
    talkMouthLevelRef.current = reducedMotion ? 0 : mouthLevel;
  }, [mouthLevel, reducedMotion]);

  useEffect(() => {
    if (!imageSrc) return undefined;

    let cancelled = false;
    const img = new Image();
    img.decoding = "async";

    img.onload = () => {
      if (cancelled) return;
      const off = document.createElement("canvas");
      off.width = GRID;
      off.height = GRID;
      const offCtx = off.getContext("2d", { willReadFrequently: true });
      if (!offCtx) return;
      offCtx.imageSmoothingEnabled = false;
      offCtx.clearRect(0, 0, GRID, GRID);
      offCtx.drawImage(img, 0, 0, GRID, GRID);
      baseImageDataRef.current = offCtx.getImageData(0, 0, GRID, GRID);
      eyeCycleRef.current = createEyeCycleState();
      mouthExpressionRef.current = createMouthExpressionState();
      speechActiveRef.current = false;

      if (mouthDebug.enabled) {
        const mouthCoords = [[29, 34], [32, 34], [31, 34]];
        const base = baseImageDataRef.current.data;
        const mouthSamples = mouthCoords.map(([x, y]) => {
          const i = (y * GRID + x) * 4;
          return { x, y, rgba: [base[i], base[i + 1], base[i + 2], base[i + 3]] };
        });
        console.log("[mist-mouth] live base mouth pixels on load", { mouthSamples });
      }

      if (debugConfig.enabled) {
        const sampleCoords = [
          [25, 25],
          [27, 25],
          [35, 25],
          [37, 25],
        ];
        const base = baseImageDataRef.current.data;
        const samples = sampleCoords.map(([x, y]) => {
          const i = (y * GRID + x) * 4;
          return {
            x,
            y,
            rgba: [base[i], base[i + 1], base[i + 2], base[i + 3]],
          };
        });
        console.log("[mist-eye] baseImageData loaded from live PNG", {
          imageSrc: imageSrc?.slice(0, 48),
          samples,
        });
      }

      setReady(true);
    };

    img.onerror = () => setReady(false);
    img.src = imageSrc;

    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return undefined;

    function measure() {
      const rect = canvas.getBoundingClientRect();
      setBobPx(Math.max(1, Math.round(rect.width / GRID)));
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ready, variant]);

  useEffect(() => {
    if (!ready || !baseImageDataRef.current) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const off = document.createElement("canvas");
    off.width = GRID;
    off.height = GRID;
    const offCtx = off.getContext("2d");
    if (!offCtx) return undefined;
    offCtx.imageSmoothingEnabled = false;

    function syncSpeechExpressionState(now, frameIndex) {
      const speechActive =
        !reducedMotion && (isSpeechSession || mouthDebug.talkSim);

      if (speechActive && !speechActiveRef.current) {
        const reason = mouthDebug.talkSim ? "talk-sim-start" : "agent-speaking-start";
        resetMouthExpressionState(mouthExpressionRef.current, now, {
          debug: mouthDebug.enabled,
          reason,
        });
        lockEyeStraightForSpeech(eyeCycleRef.current, frameIndex, now, {
          debug: debugConfig.enabled,
          reason,
        });
      } else if (!speechActive && speechActiveRef.current) {
        const reason = mouthDebug.talkSim ? "talk-sim-end" : "agent-speaking-end";
        resumeMouthExpressionCycle(mouthExpressionRef.current, now, {
          debug: mouthDebug.enabled,
          reason,
        });
        resumeEyeCycleAfterSpeech(eyeCycleRef.current, frameIndex, now, {
          debug: debugConfig.enabled,
          reason,
        });
      }
      speechActiveRef.current = speechActive;
      return speechActive;
    }

    function paint(frameIndex) {
      const base = baseImageDataRef.current;
      if (!base) return;

      const now = performance.now();
      const speechActive = syncSpeechExpressionState(now, frameIndex);
      const talkLevel =
        mouthDebug.forceTalkLevel ?? talkMouthLevelRef.current;

      if (!reducedMotion) {
        advanceEyeCycleState(eyeCycleRef.current, frameIndex, now, {
          debug: debugConfig.enabled,
          forceVariant: debugConfig.forceVariant,
          fastCycle: debugConfig.fastCycle,
          speechActive,
        });

        if (!speechActive) {
          advanceMouthExpressionState(mouthExpressionRef.current, frameIndex, now, {
            forceVariant: mouthDebug.forceVariant,
            debug: mouthDebug.enabled,
          });
        }
      }

      const frame = new ImageData(
        new Uint8ClampedArray(base.data),
        GRID,
        GRID,
      );

      const activeEyeVariant = eyeCycleRef.current.activeVariant;
      if (!reducedMotion && activeEyeVariant) {
        const pixels = variantPixels(activeEyeVariant);
        if (pixels) paintEyePixels(frame, pixels);
      }

      if (!reducedMotion && !speechActive) {
        const mouthPixels = mouthExpressionPixels(mouthExpressionRef.current);
        if (mouthPixels) paintEyePixels(frame, mouthPixels);
      }

      if (!reducedMotion && speechActive && talkLevel > MIST_TALK_MOUTH.gate) {
        applyTalkSyncToImageData(frame, talkLevel, base, {
          mobileLayout: variant === "mobile",
        });
      }

      if (mouthDebug.enabled && frameIndex % 12 === 0) {
        const probe = [32, 34];
        const i = (probe[1] * GRID + probe[0]) * 4;
        console.log("[mist-mouth] painted frame", {
          frameIndex,
          isSpeaking,
          isSpeechSession,
          speechActive,
          talkLevel,
          mouth: [frame.data[i], frame.data[i + 1], frame.data[i + 2], frame.data[i + 3]],
        });
      }

      if (debugConfig.enabled && activeEyeVariant && frameIndex % 12 === 0) {
        const probe = [27, 25];
        const i = (probe[1] * GRID + probe[0]) * 4;
        console.log("[mist-eye] painted frame sample", {
          activeEyeVariant,
          frameIndex,
          isSpeaking,
          speechActive,
          talkLevel,
          probe,
          rgba: [frame.data[i], frame.data[i + 1], frame.data[i + 2], frame.data[i + 3]],
        });
      }

      if (!reducedMotion && isBlinkFrame(frameIndex, MIST_BLINK)) {
        applyBlinkToImageData(
          frame,
          MIST_TOKEN_1_RIG,
          blinkCoordsForVariant(activeEyeVariant),
        );
      }

      offCtx.putImageData(frame, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = MIST_SPRITE_BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);

      const shell = shellRef.current;
      if (shell) {
        shell.style.transform = reducedMotion
          ? "translateY(0)"
          : `translateY(${bobOffsetDisplay(frameIndex, bobPx, MIST_BOB)}px)`;
      }
    }

    paint(frameRef.current);
    if (reducedMotion) return undefined;

    let raf = 0;
    let lastTick = 0;
    const frameMs = 1000 / MIST_IDLE_FPS;

    function tick(now) {
      if (!lastTick) lastTick = now;
      if (now - lastTick >= frameMs) {
        lastTick = now;
        frameRef.current += 1;
        paint(frameRef.current);
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    ready,
    reducedMotion,
    bobPx,
    variant,
    isSpeaking,
    isSpeechSession,
    mouthDebug.enabled,
    mouthDebug.forceVariant,
    mouthDebug.talkSim,
    mouthDebug.forceTalkLevel,
    debugConfig.enabled,
    debugConfig.forceVariant,
    debugConfig.fastCycle,
  ]);

  if (!imageSrc) return null;

  const alt = `Chromie #${formatTokenId(tokenId)} sprite`;
  const bobPaddingPx = bobPx * MIST_BOB.amplitudeNative;

  const canvas = (
    <canvas
      ref={canvasRef}
      width={GRID}
      height={GRID}
      aria-label={alt}
      role="img"
      className="pixelated block h-full w-full max-w-none"
      style={
        variant === "mobile"
          ? { imageRendering: "pixelated" }
          : { ...DESKTOP_SPRITE_STYLE, display: "block" }
      }
    />
  );

  if (variant === "mobile") {
    return (
      <div
        className="h-full w-full"
        style={{ backgroundColor: MIST_SPRITE_BG }}
      >
        <BobClipShell bobPaddingPx={bobPaddingPx} shellRef={shellRef} className="h-full w-full">
          {canvas}
        </BobClipShell>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-[min(100vw,70vh)] w-full items-center justify-center lg:min-h-0 lg:h-screen"
      style={{ backgroundColor: MIST_SPRITE_BG }}
    >
      <BobClipShell bobPaddingPx={bobPaddingPx} shellRef={shellRef}>
        {canvas}
      </BobClipShell>
    </div>
  );
}
