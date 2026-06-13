import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import { ROLES, PALETTES, getPaletteFromMetadata, resolvePalette } from "../data/chromies-palettes.js";
import { useUndoRedo } from "../hooks/useUndoRedo.js";
import {
  DISPLAY_SIZE,
  applyRemovalMask,
  canvasCoordsFromEvent,
  cloneIndices,
  computeRemovalMask,
  countDiff,
  countMaskPixels,
  drawIndicesToCanvas,
  downloadIndicesSvg,
  exportIndicesPng,
  floodFill,
  imageDataToPreviewUrl,
  indicesToPreviewUrl,
  loadImageFromFile,
  loadTokenPixelIndices,
  paintBrushAt,
  paintBrushStroke,
  processImportImage,
  processCleanImportImage,
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
const TOOLS = ["paint", "erase", "fill", "eyedropper"];
const BRUSH_SIZES = [1, 2, 3, 5, 8, 10];
const MIN_ZOOM = 25;
const MAX_ZOOM = 800;
const ZOOM_STEP = 25;
const WHEEL_ZOOM_STEP = 15;
const PALETTE_OPTIONS = Object.keys(PALETTES);
const IMPORT_PREVIEW_SIZE = 128;

function isEditableField(target) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function brushPreviewRect(gridX, gridY, brushSize, displayPx) {
  const half = Math.floor(brushSize / 2);
  const cell = displayPx / 64;
  return {
    left: (gridX - half) * cell,
    top: (gridY - half) * cell,
    width: brushSize * cell,
    height: brushSize * cell,
  };
}

function ImportImageModal({ open, onClose, onApply, initialPaletteName }) {
  const fileInputRef = useRef(null);
  const [sourceImage, setSourceImage] = useState(null);
  const [fileName, setFileName] = useState("");
  const [importMode, setImportMode] = useState("match");
  const [importPalette, setImportPalette] = useState(initialPaletteName ?? "SIGNAL");
  const [resizeMethod, setResizeMethod] = useState("nearest");
  const [beforeUrl, setBeforeUrl] = useState("");
  const [afterUrl, setAfterUrl] = useState("");
  const [previewIndices, setPreviewIndices] = useState(null);
  const [previewPaletteColors, setPreviewPaletteColors] = useState(null);
  const [importError, setImportError] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const resetModal = useCallback(() => {
    setSourceImage(null);
    setFileName("");
    setImportMode("match");
    setBeforeUrl("");
    setAfterUrl("");
    setPreviewIndices(null);
    setPreviewPaletteColors(null);
    setImportError(null);
    setLoadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (!open) resetModal();
  }, [open, resetModal]);

  useEffect(() => {
    if (open && initialPaletteName) {
      setImportPalette(initialPaletteName);
    }
  }, [open, initialPaletteName]);

  useEffect(() => {
    if (!sourceImage) {
      setBeforeUrl("");
      setAfterUrl("");
      setPreviewIndices(null);
      setPreviewPaletteColors(null);
      return;
    }

    if (importMode === "extract") {
      const { indices, resized, paletteColors } = processCleanImportImage(
        sourceImage,
        resizeMethod,
      );
      setPreviewIndices(indices);
      setPreviewPaletteColors(paletteColors);
      if (resized && paletteColors.length) {
        setBeforeUrl(imageDataToPreviewUrl(resized, IMPORT_PREVIEW_SIZE / 64));
        setAfterUrl(indicesToPreviewUrl(indices, paletteColors, IMPORT_PREVIEW_SIZE / 64));
      }
      return;
    }

    const pal = resolvePalette(importPalette);
    const { indices, resized } = processImportImage(sourceImage, pal.colors, resizeMethod);
    setPreviewIndices(indices);
    setPreviewPaletteColors(null);
    if (resized) {
      setBeforeUrl(imageDataToPreviewUrl(resized, IMPORT_PREVIEW_SIZE / 64));
      setAfterUrl(indicesToPreviewUrl(indices, pal.colors, IMPORT_PREVIEW_SIZE / 64));
    }
  }, [sourceImage, importMode, importPalette, resizeMethod]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg)$/i.test(file.type) && !/\.(png|jpe?g)$/i.test(file.name)) {
      setImportError("Please choose a PNG or JPG image.");
      return;
    }
    setLoadingFile(true);
    setImportError(null);
    try {
      const img = await loadImageFromFile(file);
      setSourceImage(img);
      setFileName(file.name);
    } catch (err) {
      setImportError(err?.message ?? "Failed to load image.");
      setSourceImage(null);
      setFileName("");
    } finally {
      setLoadingFile(false);
    }
  };

  const handleApply = () => {
    if (!previewIndices) return;
    const palette =
      importMode === "extract" && previewPaletteColors?.length
        ? { name: "EXTRACTED", colors: previewPaletteColors }
        : resolvePalette(importPalette);
    onApply({
      indices: cloneIndices(previewIndices),
      palette,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-ink bg-paper shadow-lg"
        role="dialog"
        aria-labelledby="import-image-title"
      >
        <div className="border-b border-ink px-4 py-3">
          <h2 id="import-image-title" className="text-sm font-black uppercase tracking-wide">
            Import Image
          </h2>
          <p className="mt-1 text-xs text-ink/60">
            Center-crop to 64×64, then match a Chromies palette or extract colors locally.
          </p>
        </div>

        <div className="space-y-4 px-4 py-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loadingFile}
            className="w-full border border-signal px-3 py-2 text-xs font-bold uppercase tracking-wide text-signal transition-colors hover:bg-signal hover:text-ink disabled:opacity-50"
          >
            {loadingFile ? "Loading…" : fileName || "Choose PNG / JPG"}
          </button>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
              Import Mode
            </p>
            <div className="flex flex-col gap-1">
              {[
                { id: "match", label: "Match to Chromies Palette" },
                { id: "extract", label: "Extract Palette from Image" },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-center gap-2 border px-2 py-2 text-xs font-semibold transition-colors ${
                    importMode === opt.id
                      ? "border-signal bg-signal/10 text-signal"
                      : "border-ink text-ink/70"
                  }`}
                >
                  <input
                    type="radio"
                    name="import-mode"
                    value={opt.id}
                    checked={importMode === opt.id}
                    onChange={() => setImportMode(opt.id)}
                    className="accent-signal"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {importMode === "match" && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                Chromies Palette
              </p>
              <select
                value={importPalette}
                onChange={(e) => setImportPalette(e.target.value)}
                className="w-full border border-ink bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-signal"
              >
                {PALETTE_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {importMode === "extract" && previewPaletteColors?.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                Extracted Palette (16 colors)
              </p>
              <div className="grid grid-cols-8 gap-0.5 border border-ink bg-white p-2">
                {previewPaletteColors.map((hex, i) => (
                  <div
                    key={i}
                    title={`${i}: ${hex}`}
                    className="aspect-square border border-ink"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <p className="mt-1 text-[10px] text-ink/50">
                Session-local palette — not an on-chain Chromies trait.
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
              Resize Method
            </p>
            <div className="flex gap-1">
              {[
                { id: "nearest", label: "Nearest" },
                { id: "average", label: "Average" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setResizeMethod(opt.id)}
                  className={`flex-1 border px-2 py-1.5 text-xs font-semibold transition-colors ${
                    resizeMethod === opt.id
                      ? "border-signal bg-signal/10 text-signal"
                      : "border-ink text-ink/70 hover:border-ink/60"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {importError && <p className="text-xs text-signal">{importError}</p>}

          {beforeUrl && afterUrl && (
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                  Resized
                </p>
                <img
                  src={beforeUrl}
                  alt="Resized 64×64 preview"
                  className="pixelated mx-auto border border-ink bg-white"
                  width={IMPORT_PREVIEW_SIZE}
                  height={IMPORT_PREVIEW_SIZE}
                />
              </div>
              <div className="text-center">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                  Quantized
                </p>
                <img
                  src={afterUrl}
                  alt="Palette-quantized preview"
                  className="pixelated mx-auto border border-ink bg-white"
                  width={IMPORT_PREVIEW_SIZE}
                  height={IMPORT_PREVIEW_SIZE}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-ink px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-ink px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink/70 transition-colors hover:border-signal hover:text-signal"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!previewIndices}
            className="flex-1 border border-signal px-3 py-2 text-xs font-bold uppercase tracking-wide text-signal transition-colors hover:bg-signal hover:text-ink disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function viewportOverflows(viewport) {
  return (
    viewport.scrollWidth > viewport.clientWidth + 1 ||
    viewport.scrollHeight > viewport.clientHeight + 1
  );
}

function panViewport(viewport, e) {
  if (e.shiftKey) {
    viewport.scrollLeft += e.deltaY;
    return;
  }
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    viewport.scrollLeft += e.deltaX;
  } else {
    viewport.scrollTop += e.deltaY;
  }
}

function clampZoom(value, fitZoom) {
  const min = Math.min(100, fitZoom);
  return Math.max(min, Math.min(MAX_ZOOM, Math.round(value)));
}

function computeFitZoom(width, height) {
  const padding = 32;
  const w = Math.max(1, width - padding);
  const h = Math.max(1, height - padding);
  const raw = Math.floor(Math.min(w / DISPLAY_SIZE, h / DISPLAY_SIZE) * 100);
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, raw));
}

function ZoomControls({
  zoomPercent,
  fitZoom,
  onZoomChange,
  onFit,
  panMode,
  onPanModeToggle,
  touchFriendly = false,
}) {
  const min = Math.min(100, fitZoom);
  const btnClass = touchFriendly
    ? "min-h-11 min-w-11 border border-ink px-3 text-lg font-bold text-ink transition-colors hover:border-signal hover:text-signal disabled:opacity-40"
    : "border border-ink px-2 py-1 text-sm font-bold text-ink transition-colors hover:border-signal hover:text-signal disabled:opacity-40";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/50">Zoom</p>
        <span className="font-mono text-[10px] text-ink/60">{zoomPercent}%</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onZoomChange(zoomPercent - ZOOM_STEP)}
          disabled={zoomPercent <= min}
          className={btnClass}
          aria-label="Zoom out"
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          value={zoomPercent}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="hidden min-w-0 flex-1 accent-signal sm:block"
        />
        <button
          type="button"
          onClick={() => onZoomChange(zoomPercent + ZOOM_STEP)}
          disabled={zoomPercent >= MAX_ZOOM}
          className={btnClass}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={onFit}
          className="border border-ink px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink/70 transition-colors hover:border-signal hover:text-signal"
        >
          Fit
        </button>
      </div>
      {onPanModeToggle && (
        <button
          type="button"
          onClick={onPanModeToggle}
          className={`w-full border px-2 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
            panMode
              ? "border-signal bg-signal/10 text-signal"
              : "border-ink text-ink/70 hover:border-ink/60"
          } ${touchFriendly ? "min-h-11" : ""}`}
        >
          {panMode ? "Pan mode" : "Paint mode"}
        </button>
      )}
    </div>
  );
}

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
  const [brushSize, setBrushSize] = useState(1);
  const [colorIndex, setColorIndex] = useState(1);
  const [showDiff, setShowDiff] = useState(false);
  const [painting, setPainting] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(null);
  const [fitZoom, setFitZoom] = useState(100);
  const [panMode, setPanMode] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importedActive, setImportedActive] = useState(false);
  const [bgPickIndex, setBgPickIndex] = useState(null);
  const [bgTolerance, setBgTolerance] = useState(12);
  const [bgEyedropperActive, setBgEyedropperActive] = useState(false);
  const [pickAndSwitchToPaint, setPickAndSwitchToPaint] = useState(true);
  const [altEyedropper, setAltEyedropper] = useState(false);
  const [brushHoverGrid, setBrushHoverGrid] = useState(null);

  const empty = useMemo(() => new Uint8Array(64 * 64), []);
  const { indices, setIndices, resetHistory, undo, redo, canUndo, canRedo, historyTick } =
    useUndoRedo(empty);

  const mainCanvasRef = useRef(null);
  const thumbCanvasRef = useRef(null);
  const viewportRef = useRef(null);
  const lastPaintRef = useRef(null);
  const zoomInitializedRef = useRef(false);
  const wheelAnchorRef = useRef(null);
  const zoomPercentRef = useRef(null);
  const fitZoomRef = useRef(100);
  const altEyedropperRef = useRef(false);

  const paletteColors = palette?.colors ?? [];
  const canEdit = paletteColors.length > 0;
  const isPaintColorPick = tool === "eyedropper" || altEyedropper;
  const showBrushPreview =
    canEdit &&
    !panMode &&
    (tool === "paint" || tool === "erase") &&
    !isPaintColorPick &&
    !bgEyedropperActive;
  const exportLabel = loadedId ? formatTokenId(loadedId) : "import";

  const effectiveZoom = zoomPercent ?? fitZoom;
  const displayPx = Math.round((DISPLAY_SIZE * effectiveZoom) / 100);

  const brushPreviewStyle = useMemo(() => {
    if (!brushHoverGrid || !showBrushPreview) return null;
    return brushPreviewRect(brushHoverGrid.x, brushHoverGrid.y, brushSize, displayPx);
  }, [brushHoverGrid, brushSize, displayPx, showBrushPreview]);

  useEffect(() => {
    zoomPercentRef.current = zoomPercent;
    fitZoomRef.current = fitZoom;
  }, [zoomPercent, fitZoom]);

  const traits = useMemo(() => metadata?.attributes ?? [], [metadata]);

  const diffCount = useMemo(() => {
    if (!original || !indices) return 0;
    return countDiff(indices, original);
  }, [indices, original]);

  const bgPreviewMask = useMemo(() => {
    if (bgPickIndex === null || !paletteColors.length) return null;
    return computeRemovalMask(indices, paletteColors, bgPickIndex, bgTolerance);
  }, [indices, paletteColors, bgPickIndex, bgTolerance]);

  const bgRemovalCount = useMemo(
    () => countMaskPixels(bgPreviewMask),
    [bgPreviewMask],
  );

  const pickedBgHex =
    bgPickIndex !== null ? (paletteColors[bgPickIndex] ?? "#000000") : null;

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
      setImportedActive(false);
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
      removalPreview: bgPickIndex !== null ? bgPreviewMask : null,
    });
  }, [indices, paletteColors, original, showDiff, historyTick, bgPickIndex, bgPreviewMask]);

  useEffect(() => {
    drawThumb(thumbCanvasRef.current, indices, paletteColors);
  }, [indices, paletteColors, historyTick]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;

    const updateFit = () => {
      if (el.clientWidth < 48 || el.clientHeight < 48) return;
      const fit = computeFitZoom(el.clientWidth, el.clientHeight);
      setFitZoom(fit);
      if (!zoomInitializedRef.current) {
        zoomInitializedRef.current = true;
        setZoomPercent(fit);
      }
    };

    updateFit();
    const ro = new ResizeObserver(updateFit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleZoomChange = useCallback(
    (next) => {
      setZoomPercent(clampZoom(next, fitZoom));
    },
    [fitZoom],
  );

  const handleFitZoom = useCallback(() => {
    setZoomPercent(fitZoom);
  }, [fitZoom]);

  useLayoutEffect(() => {
    const anchor = wheelAnchorRef.current;
    if (!anchor) return;

    const viewport = viewportRef.current;
    const canvas = mainCanvasRef.current;
    if (!viewport || !canvas) {
      wheelAnchorRef.current = null;
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const canvasContentX = viewport.scrollLeft + (canvasRect.left - viewportRect.left);
    const canvasContentY = viewport.scrollTop + (canvasRect.top - viewportRect.top);
    const targetCanvasContentX = anchor.pointX - anchor.normX * displayPx;
    const targetCanvasContentY = anchor.pointY - anchor.normY * displayPx;

    viewport.scrollLeft += targetCanvasContentX - canvasContentX;
    viewport.scrollTop += targetCanvasContentY - canvasContentY;
    wheelAnchorRef.current = null;
  }, [displayPx]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const onWheel = (e) => {
      if (zoomPercentRef.current === null) return;

      if (viewportOverflows(viewport)) {
        e.preventDefault();
        panViewport(viewport, e);
        return;
      }

      const oldZoom = zoomPercentRef.current ?? fitZoomRef.current;
      const delta = e.deltaY < 0 ? WHEEL_ZOOM_STEP : -WHEEL_ZOOM_STEP;
      const nextZoom = clampZoom(oldZoom + delta, fitZoomRef.current);
      if (nextZoom === oldZoom) return;

      e.preventDefault();

      const canvas = mainCanvasRef.current;
      if (canvas) {
        const viewportRect = viewport.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        if (canvasRect.width > 0 && canvasRect.height > 0) {
          const normX = (e.clientX - canvasRect.left) / canvasRect.width;
          const normY = (e.clientY - canvasRect.top) / canvasRect.height;
          const canvasContentX = viewport.scrollLeft + (canvasRect.left - viewportRect.left);
          const canvasContentY = viewport.scrollTop + (canvasRect.top - viewportRect.top);
          wheelAnchorRef.current = {
            normX,
            normY,
            pointX: canvasContentX + normX * canvasRect.width,
            pointY: canvasContentY + normY * canvasRect.height,
          };
        }
      }

      setZoomPercent(nextZoom);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!showBrushPreview) setBrushHoverGrid(null);
  }, [showBrushPreview]);

  useEffect(() => {
    if (panMode) {
      setPainting(false);
      lastPaintRef.current = null;
    }
  }, [panMode]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Alt" || e.key === "AltLeft" || e.key === "AltRight") {
        if (e.type === "keydown" && tool === "paint" && canEdit) {
          e.preventDefault();
          setAltEyedropper(true);
          altEyedropperRef.current = true;
        } else if (e.type === "keyup") {
          setAltEyedropper(false);
          altEyedropperRef.current = false;
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey)) {
        if (
          !isEditableField(e.target) &&
          canEdit &&
          e.key.length === 1 &&
          !e.altKey &&
          !e.shiftKey
        ) {
          const key = e.key.toLowerCase();
          if (key === "b") {
            e.preventDefault();
            setTool("paint");
          } else if (key === "e") {
            e.preventDefault();
            setTool("erase");
          } else if (key === "g") {
            e.preventDefault();
            setTool("fill");
          } else if (key === "i") {
            e.preventDefault();
            setTool("eyedropper");
          }
        }
        return;
      }
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    const clearAltPick = () => {
      setAltEyedropper(false);
      altEyedropperRef.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", clearAltPick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", clearAltPick);
    };
  }, [undo, redo, tool, canEdit]);

  const handleImportApply = useCallback(
    ({ indices: imported, palette: importPalette }) => {
      setPalette(importPalette);
      setOriginal(cloneIndices(imported));
      setIndices(cloneIndices(imported));
      setColorIndex(1);
      setShowDiff(false);
      setImportedActive(true);
      setLoadedId(null);
      setMetadata(null);
      setLoadError(null);
    },
    [setIndices],
  );

  const handleRemoveBackground = useCallback(() => {
    if (!bgPreviewMask || bgRemovalCount === 0) return;
    setIndices((prev) => applyRemovalMask(prev, bgPreviewMask));
    setBgPickIndex(null);
    setBgEyedropperActive(false);
  }, [bgPreviewMask, bgRemovalCount, setIndices]);

  const pickPaintColorAt = useCallback(
    (x, y, { fromTool = false } = {}) => {
      const picked = indices[y * 64 + x];
      setColorIndex(picked);
      if (fromTool && pickAndSwitchToPaint) {
        setTool("paint");
      }
    },
    [indices, pickAndSwitchToPaint],
  );

  const applyAt = useCallback(
    (x, y) => {
      if (!canEdit) return;
      const eraseIndex = 0;
      const paintIndex = tool === "erase" ? eraseIndex : colorIndex;

      if (tool === "fill") {
        setIndices((prev) => floodFill(prev, x, y, paintIndex));
        return;
      }

      const last = lastPaintRef.current;
      setIndices((prev) => {
        if (last) {
          const [lx, ly] = last.split(",").map(Number);
          if (lx === x && ly === y) return prev;
          return paintBrushStroke(prev, lx, ly, x, y, paintIndex, brushSize);
        }
        return paintBrushAt(prev, x, y, paintIndex, brushSize);
      });
      lastPaintRef.current = `${x},${y}`;
    },
    [canEdit, tool, colorIndex, brushSize, setIndices],
  );

  const updateBrushHover = useCallback(
    (clientX, clientY) => {
      if (!showBrushPreview) {
        setBrushHoverGrid(null);
        return;
      }
      const coords = canvasCoordsFromEvent(mainCanvasRef.current, clientX, clientY);
      setBrushHoverGrid(coords ? { x: coords.x, y: coords.y } : null);
    },
    [showBrushPreview],
  );

  const onPointerDown = (e) => {
    if (!canEdit || panMode) return;
    const coords = canvasCoordsFromEvent(mainCanvasRef.current, e.clientX, e.clientY);
    if (!coords) return;

    if (bgEyedropperActive) {
      const picked = indices[coords.y * 64 + coords.x];
      setBgPickIndex(picked);
      setBgEyedropperActive(false);
      return;
    }

    if (isPaintColorPick || altEyedropperRef.current) {
      pickPaintColorAt(coords.x, coords.y, { fromTool: tool === "eyedropper" });
      return;
    }

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
    updateBrushHover(e.clientX, e.clientY);
    if (!painting || tool === "fill" || panMode || isPaintColorPick) return;
    const coords = canvasCoordsFromEvent(mainCanvasRef.current, e.clientX, e.clientY);
    if (!coords) return;
    applyAt(coords.x, coords.y);
  };

  const onPointerUp = () => {
    setPainting(false);
    lastPaintRef.current = null;
  };

  const onPointerLeave = () => {
    setBrushHoverGrid(null);
    onPointerUp();
  };

  const handleReset = () => {
    if (!original) return;
    resetHistory(original);
  };

  const handleExportPng = async () => {
    if (!canEdit) return;
    const blob = await exportIndicesPng(indices, paletteColors);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportLabel}-edited.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSvg = () => {
    if (!canEdit) return;
    downloadIndicesSvg(indices, paletteColors, `chromie-${exportLabel}.svg`);
  };

  const selectedRole = ROLES[colorIndex] ?? `index_${colorIndex}`;
  const selectedHex = paletteColors[colorIndex] ?? "#000000";

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />

      <main className="flex min-h-screen flex-col pt-16">
        <div className="border-b border-ink px-4 py-3 md:px-6">
          <h1 className="text-xl font-black tracking-tight md:text-2xl">CANVAS</h1>
          <p className="mt-0.5 text-xs text-ink/60 md:text-sm">
            Pixel editor preview — paint locally, no on-chain writes yet.
          </p>
        </div>

        <div className="flex flex-1 flex-col md:flex-row md:min-h-0">
          {/* Tools sidebar — vertical on desktop, stacked toolbar on mobile */}
          <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-ink p-4 md:w-[200px] md:border-b-0 md:border-r md:overflow-y-auto">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                Load Token
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadToken()}
                  placeholder="Token ID"
                  className="min-w-0 flex-1 border border-ink bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-signal"
                />
                <button
                  type="button"
                  onClick={loadToken}
                  disabled={loading}
                  className="shrink-0 border border-signal px-3 py-1.5 text-xs font-bold text-signal transition-colors hover:bg-signal hover:text-ink disabled:opacity-50"
                >
                  {loading ? "…" : "Load"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="mt-2 w-full border border-ink px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-ink/70 transition-colors hover:border-signal hover:text-signal"
              >
                Import Image
              </button>
              {loadError && <p className="mt-2 text-xs text-signal">{loadError}</p>}
            </div>

            <div className="flex items-center gap-3">
              <canvas
                ref={thumbCanvasRef}
                width={THUMB_SIZE}
                height={THUMB_SIZE}
                className="border border-ink bg-white"
                style={{ imageRendering: "pixelated", width: 48, height: 48 }}
              />
              <div className="min-w-0 flex-1">
                {loadedId ? (
                  <>
                    <p className="text-sm font-bold text-ink">#{formatTokenId(loadedId)}</p>
                    <p className="truncate text-[10px] text-ink/50">{metadata?.name}</p>
                    {palette && (
                      <p className="mt-0.5 text-[10px] text-ink/60">
                        <span className="text-signal">{palette.name}</span>
                      </p>
                    )}
                  </>
                ) : importedActive ? (
                  <>
                    <p className="text-sm font-bold text-ink">Imported</p>
                    {palette && (
                      <p className="mt-0.5 text-[10px] text-signal">{palette.name} palette</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-ink/50">Load a token or import an image.</p>
                )}
              </div>
            </div>

            <div className="border border-ink bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                Action Points
              </p>
              <p className="text-lg font-black text-signal">AP: 100</p>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                Tool
              </p>
              <div className="flex gap-1 md:flex-col">
                {TOOLS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTool(t)}
                    className={`flex-1 border px-2 py-1.5 text-xs font-semibold capitalize transition-colors md:flex-none md:text-left md:text-sm ${
                      tool === t
                        ? "border-signal bg-signal/10 text-signal"
                        : "border-ink text-ink/70 hover:border-ink/60"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tool === "eyedropper" && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[10px] text-ink/60">
                  <input
                    type="checkbox"
                    checked={pickAndSwitchToPaint}
                    onChange={(e) => setPickAndSwitchToPaint(e.target.checked)}
                    className="accent-signal"
                  />
                  Pick & switch to paint
                </label>
              )}
              <p className="mt-1.5 text-[10px] text-ink/45">
                Hold Alt in paint mode to sample · B E G I
              </p>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                Brush
              </p>
              <div className="grid grid-cols-3 gap-1">
                {BRUSH_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setBrushSize(size)}
                    disabled={tool === "fill" || tool === "eyedropper"}
                    className={`border px-1 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                      brushSize === size
                        ? "border-signal bg-signal/10 text-signal"
                        : "border-ink text-ink/70 hover:border-ink/60"
                    }`}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            </div>

            {canEdit && (
              <div className="border border-ink bg-white p-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                  Background Remover
                </p>
                <button
                  type="button"
                  onClick={() => setBgEyedropperActive((v) => !v)}
                  className={`mb-2 w-full border px-2 py-1.5 text-xs font-semibold transition-colors ${
                    bgEyedropperActive
                      ? "border-signal bg-signal/10 text-signal"
                      : "border-ink text-ink/70 hover:border-ink/60"
                  }`}
                >
                  {bgEyedropperActive ? "Click canvas to pick…" : "Eyedropper — pick color"}
                </button>
                {bgPickIndex !== null && pickedBgHex && (
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className="h-6 w-6 shrink-0 border border-ink"
                      style={{ backgroundColor: pickedBgHex }}
                    />
                    <p className="font-mono text-[10px] text-ink/60">
                      index {bgPickIndex} · {pickedBgHex}
                    </p>
                  </div>
                )}
                <label className="mb-2 block">
                  <span className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                    <span>Tolerance</span>
                    <span>{bgTolerance}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={bgTolerance}
                    onChange={(e) => setBgTolerance(Number(e.target.value))}
                    disabled={bgPickIndex === null}
                    className="w-full accent-signal disabled:opacity-40"
                  />
                </label>
                {bgPickIndex !== null && (
                  <p className="mb-2 text-[10px] text-ink/60">
                    Preview:{" "}
                    <span className="font-semibold text-signal">{bgRemovalCount}</span> px
                    highlighted cyan
                  </p>
                )}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={handleRemoveBackground}
                    disabled={bgPickIndex === null || bgRemovalCount === 0}
                    className="flex-1 border border-signal px-2 py-1.5 text-xs font-bold text-signal transition-colors hover:bg-signal hover:text-ink disabled:opacity-40"
                  >
                    Remove Background
                  </button>
                  {bgPickIndex !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setBgPickIndex(null);
                        setBgEyedropperActive(false);
                      }}
                      className="border border-ink px-2 py-1.5 text-xs font-semibold text-ink/70 hover:border-signal hover:text-signal"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {paletteColors.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                  Palette
                </p>
                <div className="grid grid-cols-8 gap-0.5 md:grid-cols-4">
                  {paletteColors.map((hex, i) => (
                    <button
                      key={i}
                      type="button"
                      title={`${i}: ${ROLES[i]}`}
                      onClick={() => setColorIndex(i)}
                      className={`aspect-square border transition-transform hover:scale-105 ${
                        colorIndex === i ? "border-signal border-2" : "border-ink"
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
                <div className="mt-2 border border-ink bg-white p-2">
                  <div
                    className="mb-1.5 h-6 w-full border border-ink"
                    style={{ backgroundColor: selectedHex }}
                  />
                  <p className="font-mono text-[10px] text-ink/50">
                    {colorIndex} · {selectedRole}
                  </p>
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                History
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  className="flex-1 border border-ink px-2 py-1.5 text-xs font-semibold text-ink/70 hover:border-signal hover:text-signal disabled:opacity-40"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo}
                  className="flex-1 border border-ink px-2 py-1.5 text-xs font-semibold text-ink/70 hover:border-signal hover:text-signal disabled:opacity-40"
                >
                  Redo
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={!canEdit || diffCount === 0}
                  className="flex-1 border border-ink px-2 py-1.5 text-xs font-semibold text-ink/70 hover:border-signal hover:text-signal disabled:opacity-40"
                >
                  Reset
                </button>
              </div>
              <p className="mt-1 text-[10px] text-ink/40">Ctrl+Z / Ctrl+Y</p>
            </div>

            {zoomPercent !== null && (
              <div className="hidden md:block">
                <ZoomControls
                  zoomPercent={effectiveZoom}
                  fitZoom={fitZoom}
                  onZoomChange={handleZoomChange}
                  onFit={handleFitZoom}
                  panMode={panMode}
                  onPanModeToggle={() => setPanMode((p) => !p)}
                />
              </div>
            )}

            {traits.length > 0 && (
              <div className="hidden max-h-36 overflow-y-auto border border-ink bg-white md:block">
                <ul className="divide-y divide-ink-line text-[10px]">
                  {traits.map((t) => (
                    <li key={t.trait_type} className="flex justify-between gap-2 px-2 py-1">
                      <span className="text-ink/50">{t.trait_type}</span>
                      <span className="truncate font-medium text-ink">{t.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          {/* Main canvas + action bar */}
          <section className="flex min-h-0 flex-1 flex-col">
            {zoomPercent !== null && (
              <div className="shrink-0 border-b border-ink p-3 md:hidden">
                <ZoomControls
                  zoomPercent={effectiveZoom}
                  fitZoom={fitZoom}
                  onZoomChange={handleZoomChange}
                  onFit={handleFitZoom}
                  panMode={panMode}
                  onPanModeToggle={() => setPanMode((p) => !p)}
                  touchFriendly
                />
              </div>
            )}

            <div
              ref={viewportRef}
              className="min-h-[280px] flex-1 overflow-auto overscroll-contain bg-paper"
            >
              <div className="flex min-h-full min-w-full items-center justify-center p-4 md:min-h-[min(100%,calc(100vh-12rem))] md:p-8">
                <div
                  className={`shrink-0 border-2 shadow-sm ${
                    canEdit ? "border-ink" : "border-dashed border-ink"
                  } bg-white`}
                >
                  <div className="relative">
                    <canvas
                      ref={mainCanvasRef}
                      width={DISPLAY_SIZE}
                      height={DISPLAY_SIZE}
                      className={`block ${
                        panMode
                          ? "pointer-events-none cursor-grab"
                          : bgEyedropperActive || isPaintColorPick
                            ? "cursor-cell"
                            : canEdit
                              ? "cursor-crosshair"
                              : "cursor-not-allowed"
                      }`}
                      style={{
                        imageRendering: "pixelated",
                        width: displayPx,
                        height: displayPx,
                        touchAction: "none",
                      }}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerLeave={onPointerLeave}
                    />
                    {brushPreviewStyle && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute box-border border border-dashed border-white mix-blend-difference"
                        style={{
                          left: brushPreviewStyle.left,
                          top: brushPreviewStyle.top,
                          width: brushPreviewStyle.width,
                          height: brushPreviewStyle.height,
                          boxShadow: "0 0 0 1px rgba(0,0,0,0.65)",
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink bg-paper px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled
                  title="On-chain save coming after mint"
                  className="border border-ink px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink/40"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={handleExportPng}
                  disabled={!canEdit}
                  className="border border-signal px-3 py-2 text-xs font-bold text-signal transition-colors hover:bg-signal hover:text-ink disabled:opacity-40"
                >
                  Export PNG
                </button>
                <button
                  type="button"
                  onClick={handleExportSvg}
                  disabled={!canEdit}
                  className="border border-signal px-3 py-2 text-xs font-bold text-signal transition-colors hover:bg-signal hover:text-ink disabled:opacity-40"
                >
                  Export SVG
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 border border-ink bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    checked={showDiff}
                    onChange={(e) => setShowDiff(e.target.checked)}
                    disabled={!canEdit}
                    className="accent-signal"
                  />
                  <span className="text-xs font-semibold">
                    Diff view
                    {diffCount > 0 && (
                      <span className="ml-1 text-ink/50">({diffCount} px)</span>
                    )}
                  </span>
                </label>
                {loadedId && (
                  <a
                    href={tokenPngUrl(loadedId)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-ink/50 underline hover:text-signal"
                  >
                    View original
                  </a>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />

      <ImportImageModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onApply={handleImportApply}
        initialPaletteName={palette?.name ?? "SIGNAL"}
      />
    </div>
  );
}
