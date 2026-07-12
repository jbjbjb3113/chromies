"""Shared pixel analysis helpers for validation and identity strength scoring."""

from __future__ import annotations

import numpy as np
from PIL import ImageColor

from engine.config import ALPHA_OPAQUE, CANVAS_SIZE

# Reference slot colors used by Phase 1 placeholder layers.
HAIR_RGB = {
    ImageColor.getcolor("#1a2840", "RGB"),
    ImageColor.getcolor("#2d4a6e", "RGB"),
    ImageColor.getcolor("#4a7ab8", "RGB"),
}
MARK_RGB = {ImageColor.getcolor("#00ffcc", "RGB")}
MASK_SKIN_RGB = {
    ImageColor.getcolor("#3d5a6c", "RGB"),
    ImageColor.getcolor("#5a8a9e", "RGB"),
    ImageColor.getcolor("#7ec4d8", "RGB"),
}

HEAD_TOP = 8
HEAD_BOT = 34
BODY_TOP = 34
CANVAS_CX = 32


def opaque_mask(image: np.ndarray) -> np.ndarray:
    return image[:, :, 3] == ALPHA_OPAQUE


def rgb_at(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    return image[mask][:, :3]


def count_rgb_pixels(image: np.ndarray, colors: set[tuple[int, int, int]]) -> int:
    mask = opaque_mask(image)
    if not np.any(mask):
        return 0
    pixels = image[mask][:, :3]
    total = 0
    for rgb in colors:
        total += int(np.sum(np.all(pixels == np.array(rgb, dtype=np.uint8), axis=1)))
    return total


def forehead_band_mask() -> np.ndarray:
    band = np.zeros((CANVAS_SIZE, CANVAS_SIZE), dtype=bool)
    band[HEAD_TOP : HEAD_TOP + 8, CANVAS_CX - 8 : CANVAS_CX + 8] = True
    return band


def mask_zone_mask() -> np.ndarray:
    zone = np.zeros((CANVAS_SIZE, CANVAS_SIZE), dtype=bool)
    zone[HEAD_TOP + (HEAD_BOT - HEAD_TOP) // 2 : HEAD_BOT + 1, 2 : CANVAS_SIZE - 2] = True
    return zone


def head_zone_mask() -> np.ndarray:
    zone = np.zeros((CANVAS_SIZE, CANVAS_SIZE), dtype=bool)
    zone[HEAD_TOP:HEAD_BOT, 2 : CANVAS_SIZE - 2] = True
    return zone


def hair_centroid_offset_px(image: np.ndarray, *, head_cx: int = 33) -> float:
    hair_mask = opaque_mask(image)
    hair_colors = np.zeros_like(hair_mask)
    pixels = image[:, :, :3]
    for rgb in HAIR_RGB:
        hair_colors |= np.all(pixels == np.array(rgb, dtype=np.uint8), axis=2)
    hair_mask &= hair_colors
    hair_mask &= head_zone_mask()

    ys, xs = np.where(hair_mask)
    if len(xs) == 0:
        return 0.0
    centroid_x = float(xs.mean())
    return abs(centroid_x - head_cx)


def mark_pixels_in_forehead(image: np.ndarray) -> int:
    band = forehead_band_mask()
    mask = opaque_mask(image) & band
    if not np.any(mask):
        return 0
    pixels = image[mask][:, :3]
    total = 0
    for rgb in MARK_RGB:
        total += int(np.sum(np.all(pixels == np.array(rgb, dtype=np.uint8), axis=1)))
    return total


def mask_zone_pixel_count(image: np.ndarray) -> int:
    zone = mask_zone_mask()
    return int(np.sum(opaque_mask(image) & zone))


def mask_zone_contrast_rows(image: np.ndarray) -> int:
    """Row-to-row width changes >= 2 px inside the mask band."""
    zone = mask_zone_mask()
    sub = opaque_mask(image) & zone
    widths: list[int] = []
    for row in sub:
        cols = np.where(row)[0]
        widths.append(int(cols.max() - cols.min() + 1) if len(cols) else 0)
    breaks = 0
    prev = None
    for w in widths:
        if w == 0:
            continue
        if prev is not None and abs(w - prev) >= 2:
            breaks += 1
        prev = w
    return breaks


def proportion_fit_score(width: int, height: int) -> float:
    """0–1 fit against constitution bounding-box targets."""
    width_score = 1.0 - min(abs(width - 38) / 16.0, 1.0)
    height_score = 1.0 - min(abs(height - 54) / 12.0, 1.0)
    return max(0.0, (width_score + height_score) / 2.0)


def thumbnail_readability(image: np.ndarray) -> float:
    """Downscale-nearest-neighbor opaque pixel retention ratio."""
    from PIL import Image

    src = Image.fromarray(image, mode="RGBA")
    small = src.resize((16, 16), Image.NEAREST)
    arr = np.array(small, dtype=np.uint8)
    large_opaque = int(np.sum(opaque_mask(image)))
    small_opaque = int(np.sum(arr[:, :, 3] == ALPHA_OPAQUE))
    if large_opaque == 0:
        return 0.0
    return min(1.0, small_opaque / max(large_opaque * (16 * 16) / (64 * 64), 1))
