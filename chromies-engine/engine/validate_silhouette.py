"""Silhouette, asymmetry, and proportion checks."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from engine.config import ALPHA_OPAQUE, CANVAS_SIZE
from engine.image_analysis import (
    hair_centroid_offset_px,
    mark_pixels_in_forehead,
    mask_zone_contrast_rows,
    mask_zone_pixel_count,
    proportion_fit_score,
)
from engine.models import SilhouetteValidation
from engine.validation_context import ValidationContext
from engine.validation_modes import DEFAULT_VALIDATION_MODE, ValidationMode, mode_thresholds


def load_alpha(path: Path | None = None, image: np.ndarray | None = None) -> np.ndarray:
    if image is not None:
        return (image[:, :, 3] == ALPHA_OPAQUE).astype(np.uint8)
    img = Image.open(path).convert("RGBA")
    if img.size != (CANVAS_SIZE, CANVAS_SIZE):
        img = img.resize((CANVAS_SIZE, CANVAS_SIZE), Image.NEAREST)
    arr = np.array(img, dtype=np.uint8)
    return (arr[:, :, 3] == ALPHA_OPAQUE).astype(np.uint8)


def bounding_box(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def asymmetry_pct(mask: np.ndarray) -> float:
    flipped = np.fliplr(mask)
    total = int(np.sum(mask))
    if total == 0:
        return 0.0
    diff = int(np.sum(mask != flipped))
    return (diff / total) * 100.0


def row_widths(mask: np.ndarray) -> list[int]:
    widths = []
    for row in mask:
        cols = np.where(row)[0]
        widths.append(int(cols.max() - cols.min() + 1) if len(cols) else 0)
    return widths


def count_width_breaks(mask: np.ndarray, min_delta: int = 2) -> int:
    widths = row_widths(mask)
    breaks = 0
    prev = None
    for w in widths:
        if w == 0:
            continue
        if prev is not None and abs(w - prev) >= min_delta:
            breaks += 1
        prev = w
    return breaks


def estimate_convexity_defects(mask: np.ndarray) -> int:
    widths = row_widths(mask)
    active = [w for w in widths if w > 0]
    if len(active) < 3:
        return 0
    defects = 0
    for i in range(1, len(active) - 1):
        if active[i] < active[i - 1] and active[i] < active[i + 1]:
            defects += 1
        if active[i] > active[i - 1] and active[i] > active[i + 1]:
            defects += 1
    return max(1, defects // 2) if active else 0


def _silhouette_thresholds(mode: ValidationMode, ctx: ValidationContext | None) -> dict:
    table = mode_thresholds(mode)
    if ctx and ctx.is_side_profile:
        return table["side_profile"]
    return table["silhouette"]


def validate_silhouette(
    image: np.ndarray,
    *,
    mode: ValidationMode = DEFAULT_VALIDATION_MODE,
    context: ValidationContext | None = None,
    phase1_lenient: bool | None = None,
) -> SilhouetteValidation:
    if phase1_lenient is not None:
        mode = ValidationMode.LENIENT if phase1_lenient else ValidationMode.STRICT

    ctx = context or ValidationContext()
    thresholds = _silhouette_thresholds(mode, ctx)
    notes: list[str] = [f"validation_mode={mode.value}"]
    if ctx.is_side_profile:
        notes.append("side_profile silhouette rules")

    mask = load_alpha(image=image)
    bbox = bounding_box(mask)

    if bbox is None:
        return SilhouetteValidation(pass_=False, notes=["empty silhouette"])

    x0, y0, x1, y1 = bbox
    width = x1 - x0 + 1
    height = y1 - y0 + 1
    asym = asymmetry_pct(mask)
    defects = estimate_convexity_defects(mask)
    breaks = count_width_breaks(mask)
    proportion = proportion_fit_score(width, height)
    hair_offset = hair_centroid_offset_px(image)
    mark_pixels = mark_pixels_in_forehead(image)
    mask_pixels = mask_zone_pixel_count(image)
    mask_breaks = mask_zone_contrast_rows(image)

    full_canvas = width == CANVAS_SIZE and height == CANVAS_SIZE
    if full_canvas and thresholds.get("allow_full_canvas_bbox"):
        notes.append("full-canvas bbox allowed for composited art-pipeline output")

    passed = (
        thresholds["min_bbox_width"] <= width <= thresholds["max_bbox_width"]
        and thresholds["min_bbox_height"] <= height <= thresholds["max_bbox_height"]
        and asym >= thresholds["min_asymmetry_pct"]
        and defects >= thresholds["min_defects"]
    )

    if thresholds.get("max_defects") is not None:
        passed = passed and defects <= thresholds["max_defects"]

    if thresholds.get("require_width_breaks"):
        passed = passed and breaks >= 1

    if thresholds.get("check_forehead_mark") and not ctx.forehead_mark_gated:
        if mark_pixels < 3:
            notes.append(f"forehead mark pixels {mark_pixels} (target >= 3)")
            passed = False
    elif ctx.forehead_mark_gated:
        notes.append("forehead mark validation gated off")

    if thresholds.get("check_mask_zone") and not ctx.mask_gated:
        if mask_pixels < 20:
            notes.append(f"mask zone pixels {mask_pixels} (target >= 20)")
            passed = False
    elif ctx.mask_gated:
        notes.append("mask clarity validation gated off (mask forced None)")

    if asym < thresholds["min_asymmetry_pct"]:
        notes.append(f"asymmetry {asym:.1f}% (min {thresholds['min_asymmetry_pct']}%)")

    return SilhouetteValidation(
        pass_=passed,
        asymmetry_pct=round(asym, 2),
        defects=defects,
        hair_centroid_offset_px=round(hair_offset, 2),
        bbox_width=width,
        bbox_height=height,
        width_breaks=breaks,
        proportion_fit=round(proportion, 4),
        mask_zone_pixels=mask_pixels,
        mask_zone_breaks=mask_breaks,
        mark_zone_pixels=mark_pixels,
        notes=notes,
    )


def validate_png(
    path: Path,
    *,
    mode: ValidationMode = DEFAULT_VALIDATION_MODE,
    context: ValidationContext | None = None,
    phase1_lenient: bool | None = None,
) -> SilhouetteValidation:
    img = Image.open(path).convert("RGBA")
    if img.size != (CANVAS_SIZE, CANVAS_SIZE):
        img = img.resize((CANVAS_SIZE, CANVAS_SIZE), Image.NEAREST)
    return validate_silhouette(
        np.array(img, dtype=np.uint8),
        mode=mode,
        context=context,
        phase1_lenient=phase1_lenient,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate silhouette constitution rules")
    parser.add_argument("png", type=Path)
    parser.add_argument(
        "--mode",
        choices=[m.value for m in ValidationMode],
        default=DEFAULT_VALIDATION_MODE.value,
    )
    args = parser.parse_args()
    result = validate_png(args.png, mode=ValidationMode.from_str(args.mode))
    print(result.model_dump(by_alias=True))


if __name__ == "__main__":
    main()
