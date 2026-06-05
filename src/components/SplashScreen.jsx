import React, { useEffect, useMemo, useState } from "react";
import { buildTokenGridTiles, TOKEN_CELL_PX } from "../data/tokens.js";

const CELL = TOKEN_CELL_PX;

export default function SplashScreen({ visible, onDismiss }) {
  const [dims, setDims] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 720,
  }));

  useEffect(() => {
    const onResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const tiles = useMemo(
    () => buildTokenGridTiles(dims.w, dims.h, CELL),
    [dims.w, dims.h],
  );

  const handleDismiss = (e) => {
    e?.stopPropagation?.();
    onDismiss();
  };

  return (
    <div
      role="dialog"
      aria-label="CHROMIES splash"
      className={`fixed inset-0 z-50 transition-opacity duration-[250ms] ease-out ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{ backgroundColor: visible ? "#0d0d0d" : "#000000" }}
    >
      {/* Click-anywhere dismiss layer — sits above grid, below content */}
      <button
        type="button"
        aria-label="Dismiss splash"
        className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0"
        onClick={handleDismiss}
      />

      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          className="splash-drift absolute -top-16 -left-16 grid gap-0"
          style={{
            gridTemplateColumns: `repeat(auto-fill, ${CELL}px)`,
            width: dims.w + CELL * 6,
          }}
        >
          {tiles.map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt=""
              draggable={false}
              width={CELL}
              height={CELL}
              className="pixelated block h-16 w-16 select-none"
              style={{ width: CELL, height: CELL }}
            />
          ))}
        </div>
      </div>

      <div className="pointer-events-none relative z-10 flex min-h-full flex-col items-center justify-center px-6 text-center">
        <h1 className="text-6xl font-black tracking-tighter text-white drop-shadow-[0_0_40px_rgba(255,45,138,0.35)] sm:text-8xl">
          CHROMIES
        </h1>
        <p className="mt-4 font-mono text-[10px] tracking-[0.2em] text-neutral-400 sm:text-xs">
          ON-CHAIN GENERATIVE IDENTITIES IN COLOR
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="pointer-events-auto mt-8 cursor-pointer border border-signal bg-signal px-8 py-3 text-sm font-bold uppercase tracking-wide text-ink transition-colors hover:bg-transparent hover:text-signal"
        >
          Enter
        </button>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        className="pointer-events-auto absolute right-6 bottom-6 z-20 cursor-pointer border-0 bg-transparent text-xs font-semibold tracking-wide text-neutral-500 underline-offset-2 transition-colors hover:text-signal hover:underline"
      >
        skip
      </button>
    </div>
  );
}
