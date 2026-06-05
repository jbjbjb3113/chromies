import React, { useEffect, useRef } from "react";
import { DEFAULT_MOUTH, GRID } from "../lib/chromie-token.js";

const SCALE = 4;
const DISPLAY = GRID * SCALE;

/**
 * Draw token at 4× with pixelated rendering, mouth region highlight, and lip-sync slit.
 */
export default function ChromieViewer({ image, mouthLevel, mouth = DEFAULT_MOUTH }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, DISPLAY, DISPLAY);
    ctx.drawImage(image, 0, 0, DISPLAY, DISPLAY);

    const mx = mouth.x * SCALE;
    const my = mouth.y * SCALE;
    const mw = mouth.w * SCALE;
    const mh = mouth.h * SCALE;

    ctx.strokeStyle = "rgba(255, 45, 138, 0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);

    if (mouthLevel > 0.04) {
      const openH = Math.max(1, Math.round(mouthLevel * (mh - 2)));
      const slitY = my + Math.floor((mh - openH) / 2);
      ctx.fillStyle = "rgba(10, 10, 10, 0.85)";
      for (let py = 0; py < openH; py += SCALE) {
        const rowY = slitY + py;
        for (let px = 0; px < mw; px += SCALE) {
          ctx.fillRect(mx + px, rowY, SCALE, SCALE);
        }
      }
    }
  }, [image, mouth, mouthLevel]);

  return (
    <canvas
      ref={canvasRef}
      width={DISPLAY}
      height={DISPLAY}
      className="pixelated border border-ink-line bg-ink-soft"
      aria-label="Chromie viewer"
    />
  );
}
