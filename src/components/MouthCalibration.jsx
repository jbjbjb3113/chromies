import React from "react";
import { clampMouth, DEFAULT_MOUTH, GRID } from "../lib/chromie-token.js";

function MouthSlider({ label, value, min, max, onChange }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-neutral-500">{label}</span>
        <span className="font-mono tabular-nums text-signal">{value}px</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#ff2d8a]"
      />
    </label>
  );
}

export default function MouthCalibration({ mouth, onChange, onReset, disabled }) {
  const set = (patch) => onChange(clampMouth({ ...mouth, ...patch }));

  return (
    <div className="w-full max-w-xs space-y-3 border border-ink-line bg-ink px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          Mouth region
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onReset}
          className="border border-ink-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 hover:border-signal hover:text-signal disabled:opacity-40"
        >
          Reset
        </button>
      </div>

      <MouthSlider
        label="X offset"
        value={mouth.x}
        min={0}
        max={GRID - 1}
        onChange={(x) => set({ x })}
      />
      <MouthSlider
        label="Y offset"
        value={mouth.y}
        min={0}
        max={GRID - 1}
        onChange={(y) => set({ y })}
      />
      <MouthSlider
        label="Width"
        value={mouth.w}
        min={1}
        max={GRID - mouth.x}
        onChange={(w) => set({ w })}
      />
      <MouthSlider
        label="Height"
        value={mouth.h}
        min={1}
        max={GRID - mouth.y}
        onChange={(h) => set({ h })}
      />

      <p className="text-[10px] text-neutral-600">
        Default: {DEFAULT_MOUTH.x}, {DEFAULT_MOUTH.y} · {DEFAULT_MOUTH.w}×{DEFAULT_MOUTH.h}px
      </p>
    </div>
  );
}
