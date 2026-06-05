import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import { ROLES, getPaletteFromMetadata } from "../data/chromies-palettes.js";
import { useUndoRedo } from "../hooks/useUndoRedo.js";
import {
  CANVAS_SCALE,
  DISPLAY_SIZE,
  canvasCoordsFromEvent,
  cloneIndices,
  countDiff,
  drawIndicesToCanvas,
  downloadIndicesSvg,
  exportIndicesPng,
  floodFill,
  loadTokenPixelIndices,
  paintPixel,
} from "../lib/pixel-canvas.js";
import {
  fetchChromieMetadata,
  formatTokenId,
  loadTokenImage,
  parseTokenId,
  tokenPngUrl,
} from "../lib/chromie-token.js";

const THUMB_SCALE = 4;
const THUMB_SIZE = 64 * THUMB_SCALE;
const TOOLS = ["paint", "erase", "fill"];

function drawThumb(canvas, indices, paletteColors) {
  if (!canvas || !indices) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const idx = indices[y * 64 + x];
      ctx.fillStyle = paletteColors[idx] ?? paletteColors[0];
      ctx.fillRect(x * THUMB_SCALE, y * THUMB_SCALE, THUMB_SCALE, THUMB_SCALE);
    }
  }
}

export default function Canvas() {
  const [tokenInput, setTokenInput] = useState("42");
  const [loadedId, setLoadedId] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [palette, setPalette] = useState(null);
  const [original, setOriginal] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [tool, setTool] = useState("paint");
  const [colorIndex, setColorIndex] = useState(1);
  const [showDiff, setShowDiff] = useState(false);
  const [painting, setPainting] = useState(false);

  const empty = useMemo(() => new Uint8Array(64 * 64), []);
  const { indices, setIndices, resetHistory, undo, redo, canUndo, canRedo, historyTick } =
    useUndoRedo(empty);

  const mainCanvasRef = useRef(null);
  const thumbCanvasRef = useRef(null);
  const lastPaintRef = useRef(null);

  const paletteColors = palette?.colors ?? [];

  const traits = useMemo(() => metadata?.attributes ?? [], [metadata]);

  const diffCount = useMemo(() => {
    if (!original || !indices) return 0;
    return countDiff(indices, original);
  }, [indices, original]);

  const loadToken = useCallback(async () => {
    const id = parseTokenId(tokenInput);
    if (!id) {
      setLoadError("Enter a valid token ID (1–9999).");
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [meta, img] = await Promise.all([
        fetchChromieMetadata(id),
        loadTokenImage(id),
      ]);
      const pal = getPaletteFromMetadata(meta);
      const pix = loadTokenPixelIndices(img, pal.colors);
      setLoadedId(id);
      setMetadata(meta);
      setPalette(pal);
      setOriginal(cloneIndices(pix));
      resetHistory(pix);
      setColorIndex(1);
      setShowDiff(false);
    } catch (err) {
      setLoadError(err?.message ?? "Failed to load token.");
      setLoadedId(null);
      setMetadata(null);
      setPalette(null);
      setOriginal(null);
      resetHistory(empty);
    } finally {
      setLoading(false);
    }
  }, [tokenInput, resetHistory, empty]);

  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !paletteColors.length || !indices) return;
    drawIndicesToCanvas(canvas, indices, paletteColors, {
      original,
      showDiff,
    });
  }, [indices, paletteColors, original, showDiff, historyTick]);

  useEffect(() => {
    drawThumb(thumbCanvasRef.current, indices, paletteColors);
  }, [indices, paletteColors, historyTick]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const applyAt = useCallback(
    (x, y) => {
      if (!loadedId || !paletteColors.length) return;
      const eraseIndex = 0;
      const paintIndex = tool === "erase" ? eraseIndex : colorIndex;

      if (tool === "fill") {
        setIndices((prev) => floodFill(prev, x, y, paintIndex));
        return;
      }

      const key = `${x},${y}`;
      if (lastPaintRef.current === key) return;
      lastPaintRef.current = key;

      setIndices((prev) => {
        if (prev[y * 64 + x] === paintIndex) return prev;
        return paintPixel(prev, x, y, paintIndex);
      });
    },
    [loadedId, paletteColors.length, tool, colorIndex, setIndices],
  );

  const onPointerDown = (e) => {
    if (!loadedId) return;
    const coords = canvasCoordsFromEvent(mainCanvasRef.current, e.clientX, e.clientY);
    if (!coords) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPainting(true);
    lastPaintRef.current = null;
    if (tool === "fill") {
      applyAt(coords.x, coords.y);
      setPainting(false);
      return;
    }
    applyAt(coords.x, coords.y);
  };

  const onPointerMove = (e) => {
    if (!painting || tool === "fill") return;
    const coords = canvasCoordsFromEvent(mainCanvasRef.current, e.clientX, e.clientY);
    if (!coords) return;
    applyAt(coords.x, coords.y);
  };

  const onPointerUp = () => {
    setPainting(false);
    lastPaintRef.current = null;
  };

  const handleReset = () => {
    if (!original) return;
    resetHistory(original);
  };

  const handleExportPng = async () => {
    if (!loadedId || !paletteColors.length) return;
    const blob = await exportIndicesPng(indices, paletteColors);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formatTokenId(loadedId)}-edited.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSvg = () => {
    if (!loadedId || !paletteColors.length) return;
    downloadIndicesSvg(indices, paletteColors, `chromie-${formatTokenId(loadedId)}.svg`);
  };

  const selectedRole = ROLES[colorIndex] ?? `index_${colorIndex}`;
  const selectedHex = paletteColors[colorIndex] ?? "#000000";

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />

      <main className="flex min-h-screen flex-col pt-20">
        <div className="border-b border-ink px-6 py-4">
          <h1 className="text-2xl font-black tracking-tight">CANVAS</h1>
          <p className="mt-1 text-sm text-ink/60">
            Pixel editor preview — paint locally, no on-chain writes yet.
          </p>
        </div>

        <div className="flex flex-1 flex-col lg:flex-row">
          {/* Left — 30% */}
          <aside className="flex w-full flex-col gap-5 border-b border-ink p-5 lg:w-[30%] lg:border-r lg:border-b-0">
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadToken()}
                placeholder="Token ID"
                className="min-w-0 flex-1 border border-ink bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal"
              />
              <button
                type="button"
                onClick={loadToken}
                disabled={loading}
                className="border border-signal px-4 py-2 text-sm font-bold text-signal transition-colors hover:bg-signal hover:text-ink disabled:opacity-50"
              >
                {loading ? "…" : "Load"}
              </button>
            </div>

            {loadError && (
              <p className="text-sm text-signal">{loadError}</p>
            )}

            <div className="flex items-start gap-4">
              <canvas
                ref={thumbCanvasRef}
                width={THUMB_SIZE}
                height={THUMB_SIZE}
                className="border border-ink bg-white"
                style={{ imageRendering: "pixelated", width: THUMB_SIZE, height: THUMB_SIZE }}
              />
              <div className="min-w-0 flex-1">
                {loadedId ? (
                  <>
                    <p className="font-bold text-ink">#{formatTokenId(loadedId)}</p>
                    <p className="text-xs text-ink/50">{metadata?.name}</p>
                    {palette && (
                      <p className="mt-1 text-xs text-ink/60">
                        Palette: <span className="text-signal">{palette.name}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink/50">Load a token to begin.</p>
                )}
              </div>
            </div>

            {traits.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-ink bg-white">
                <ul className="divide-y divide-ink-line text-xs">
                  {traits.map((t) => (
                    <li key={t.trait_type} className="flex justify-between gap-2 px-3 py-1.5">
                      <span className="text-ink/50">{t.trait_type}</span>
                      <span className="truncate font-medium text-ink">{t.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border border-ink bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">
                Action Points
              </p>
              <p className="mt-1 text-2xl font-black text-signal">AP: 100</p>
            </div>

            <button
              type="button"
              disabled
              title="On-chain save coming after mint"
              className="w-full border border-ink px-4 py-3 text-sm font-bold uppercase tracking-wide text-ink/40"
            >
              Save Changes
            </button>
          </aside>

          {/* Center — 50% */}
          <section className="flex w-full flex-col items-center gap-4 p-5 lg:w-[50%]">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className="border border-ink px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-signal hover:text-signal disabled:opacity-40"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className="border border-ink px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-signal hover:text-signal disabled:opacity-40"
              >
                Redo
              </button>
              <span className="text-xs text-ink/45">Ctrl+Z / Ctrl+Y</span>
              <button
                type="button"
                onClick={handleReset}
                disabled={!loadedId || diffCount === 0}
                className="border border-ink px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-signal hover:text-signal disabled:opacity-40"
              >
                Reset
              </button>
            </div>

            <div
              className={`border-2 ${loadedId ? "border-ink" : "border-dashed border-ink"} bg-white`}
            >
              <canvas
                ref={mainCanvasRef}
                width={DISPLAY_SIZE}
                height={DISPLAY_SIZE}
                className={loadedId ? "cursor-crosshair" : "cursor-not-allowed"}
                style={{ imageRendering: "pixelated", width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />
            </div>

            {paletteColors.length > 0 && (
              <div className="w-full max-w-lg">
                <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-ink/50">
                  Palette
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {paletteColors.map((hex, i) => (
                    <button
                      key={i}
                      type="button"
                      title={`${i}: ${ROLES[i]}`}
                      onClick={() => setColorIndex(i)}
                      className={`aspect-square border-2 transition-transform hover:scale-105 ${
                        colorIndex === i ? "border-signal" : "border-ink"
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Right — 20% */}
          <aside className="flex w-full flex-col gap-5 border-t border-ink p-5 lg:w-[20%] lg:border-t-0 lg:border-l">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">
                Tool
              </p>
              <div className="flex flex-col gap-1">
                {TOOLS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTool(t)}
                    className={`border px-3 py-2 text-left text-sm font-semibold capitalize transition-colors ${
                      tool === t
                        ? "border-signal bg-signal/10 text-signal"
                        : "border-ink text-ink/70 hover:border-ink/60"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">
                Brush
              </p>
              <p className="border border-ink bg-white px-3 py-2 text-sm text-ink/60">
                1px
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">
                Color
              </p>
              <div className="border border-ink bg-white p-3">
                <div
                  className="mb-2 h-10 w-full border border-ink"
                  style={{ backgroundColor: selectedHex }}
                />
                <p className="text-xs text-ink/50">
                  Index <span className="font-mono text-ink">{colorIndex}</span>
                </p>
                <p className="mt-1 font-mono text-sm text-signal">{selectedRole}</p>
                <p className="mt-1 font-mono text-xs text-ink/50">{selectedHex}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleExportPng}
                disabled={!loadedId}
                className="w-full border border-signal px-4 py-3 text-sm font-bold text-signal transition-colors hover:bg-signal hover:text-ink disabled:opacity-40"
              >
                Export PNG
              </button>
              <button
                type="button"
                onClick={handleExportSvg}
                disabled={!loadedId}
                className="w-full border border-signal px-4 py-3 text-sm font-bold text-signal transition-colors hover:bg-signal hover:text-ink disabled:opacity-40"
              >
                Export SVG
              </button>
            </div>

            <label className="flex cursor-pointer items-center gap-3 border border-ink bg-white px-3 py-3">
              <input
                type="checkbox"
                checked={showDiff}
                onChange={(e) => setShowDiff(e.target.checked)}
                disabled={!loadedId}
                className="accent-signal"
              />
              <span className="text-sm font-semibold">
                Diff view
                {diffCount > 0 && (
                  <span className="ml-1 text-xs text-ink/50">({diffCount} px)</span>
                )}
              </span>
            </label>

            {showDiff && (
              <p className="text-xs text-ink/50">
                Changed pixels highlighted in magenta against the original token.
              </p>
            )}

            {loadedId && (
              <a
                href={tokenPngUrl(loadedId)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-ink/50 underline hover:text-signal"
              >
                View original PNG
              </a>
            )}
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
