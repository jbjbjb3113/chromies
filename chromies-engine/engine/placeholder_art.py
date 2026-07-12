"""Shared drawing primitives for Phase 1 placeholder trait layers."""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageColor

from engine.config import ALPHA_OPAQUE, ALPHA_TRANSPARENT, CANVAS_SIZE

# Signal family — canonical placeholder palette (4bpp-compatible, hue-separated).
COLORS = {
    "outline": ImageColor.getcolor("#0a0a12", "RGB"),
    "skin_0": ImageColor.getcolor("#3d5a6c", "RGB"),
    "skin_1": ImageColor.getcolor("#5a8a9e", "RGB"),
    "skin_2": ImageColor.getcolor("#7ec4d8", "RGB"),
    "hair_0": ImageColor.getcolor("#1a2840", "RGB"),
    "hair_1": ImageColor.getcolor("#2d4a6e", "RGB"),
    "hair_2": ImageColor.getcolor("#4a7ab8", "RGB"),
    "cloth_0": ImageColor.getcolor("#12182a", "RGB"),
    "cloth_1": ImageColor.getcolor("#1e2d4a", "RGB"),
    "cloth_2": ImageColor.getcolor("#3a5080", "RGB"),
    "accent_0": ImageColor.getcolor("#00e5ff", "RGB"),
    "accent_1": ImageColor.getcolor("#ff3d9a", "RGB"),
    "mark": ImageColor.getcolor("#00ffcc", "RGB"),
}

CX = 33
HEAD_TOP = 8
HEAD_BOT = 34
BODY_TOP = 34
FEET = 58

HEAD_WIDTH = {
    "Taper": 16,
    "Broad": 20,
    "Slim": 14,
    "Angular": 18,
    "Crest": 16,
    "Split": 16,
}

BODY_SHOULDER = {
    "Standard": 20,
    "Lean": 18,
    "Bulk": 24,
    "Slouch": 20,
    "Hover": 20,
    "Warped": 22,
}


def blank_canvas() -> np.ndarray:
    return np.zeros((CANVAS_SIZE, CANVAS_SIZE, 4), dtype=np.uint8)


def slug(value: str) -> str:
    return value.lower().replace(" ", "_").replace("+", "_")


def head_bounds(head_shape: str) -> tuple[int, int, int, int]:
    hw = HEAD_WIDTH.get(head_shape, 16)
    x0 = CX - hw // 2
    x1 = CX + hw // 2
    return x0, HEAD_TOP, x1, HEAD_BOT


def fill_rect(canvas: np.ndarray, x0: int, y0: int, x1: int, y1: int, rgb: tuple[int, int, int]) -> None:
    canvas[y0 : y1 + 1, x0 : x1 + 1, :3] = rgb
    canvas[y0 : y1 + 1, x0 : x1 + 1, 3] = ALPHA_OPAQUE


def stroke_rect(canvas: np.ndarray, x0: int, y0: int, x1: int, y1: int, rgb: tuple[int, int, int]) -> None:
    for x in range(x0, x1 + 1):
        canvas[y0, x, :3] = rgb
        canvas[y0, x, 3] = ALPHA_OPAQUE
        canvas[y1, x, :3] = rgb
        canvas[y1, x, 3] = ALPHA_OPAQUE
    for y in range(y0, y1 + 1):
        canvas[y, x0, :3] = rgb
        canvas[y, x0, 3] = ALPHA_OPAQUE
        canvas[y, x1, :3] = rgb
        canvas[y, x1, 3] = ALPHA_OPAQUE


def set_px(canvas: np.ndarray, x: int, y: int, rgb: tuple[int, int, int]) -> None:
    if 2 <= x < CANVAS_SIZE - 2 and 2 <= y < CANVAS_SIZE - 2:
        canvas[y, x, :3] = rgb
        canvas[y, x, 3] = ALPHA_OPAQUE


def save_layer(canvas: np.ndarray, path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(canvas, mode="RGBA").save(path)


def draw_head_layer(head_shape: str) -> np.ndarray:
    canvas = blank_canvas()
    x0, y0, x1, y1 = head_bounds(head_shape)
    fill_rect(canvas, x0 + 1, y0 + 1, x1 - 1, y1 - 1, COLORS["skin_1"])
    stroke_rect(canvas, x0, y0, x1, y1, COLORS["outline"])

    jaw_y0 = y1 - (y1 - y0) // 4
    for y in range(jaw_y0, y1 + 1):
        shrink = (y - jaw_y0) // 2
        fill_rect(canvas, x0 + shrink, y, x1 - shrink, y, COLORS["skin_2"])

    if head_shape == "Crest":
        fill_rect(canvas, x0 + 3, y0 - 2, x1 - 3, y0, COLORS["skin_1"])
        stroke_rect(canvas, x0 + 3, y0 - 2, x1 - 3, y0, COLORS["outline"])
    elif head_shape == "Angular":
        fill_rect(canvas, x0 + 1, y0, x1 - 1, y0 + 2, COLORS["skin_0"])
    elif head_shape == "Split":
        fill_rect(canvas, x1 - 3, y0 + 2, x1, y0 + 6, COLORS["outline"])

    return canvas


def draw_mask_layer(head_shape: str, mask_type: str) -> np.ndarray:
    canvas = blank_canvas()
    x0, y0, x1, y1 = head_bounds(head_shape)
    mask_top = y0 + (y1 - y0) // 2

    if mask_type == "Halfplate":
        fill_rect(canvas, x0 + 2, mask_top, x1 - 2, y1 - 1, COLORS["skin_0"])
        for x in range(x0 + 2, x1 - 1):
            set_px(canvas, x, mask_top, COLORS["outline"])
    elif mask_type == "Muzzle":
        fill_rect(canvas, x0 + 3, mask_top, x1 - 3, y1, COLORS["skin_0"])
        fill_rect(canvas, x0 + 5, y1 - 2, x1 - 5, y1 + 1, COLORS["skin_0"])
    elif mask_type == "Visor-jaw":
        fill_rect(canvas, x0 + 1, mask_top - 2, x1 - 1, y1, COLORS["skin_0"])
        fill_rect(canvas, x0 + 4, mask_top - 2, x1 - 4, mask_top, COLORS["accent_0"])
    elif mask_type == "Strapped":
        fill_rect(canvas, x0 + 2, mask_top, x1 - 2, y1 - 1, COLORS["skin_0"])
        for y in range(mask_top, y1):
            set_px(canvas, x0 - 1, y, COLORS["cloth_2"])
            set_px(canvas, x1 + 1, y, COLORS["cloth_2"])
    elif mask_type == "Fractured":
        fill_rect(canvas, x0 + 2, mask_top, x1 - 2, y1 - 1, COLORS["skin_0"])
        for y in range(mask_top, y1):
            set_px(canvas, CX + 1, y, COLORS["accent_1"])
    elif mask_type == "Openface":
        fill_rect(canvas, x0 + 3, y1 - 4, x1 - 3, y1, COLORS["skin_0"])
    elif mask_type == "Phantom":
        fill_rect(canvas, x0 + 2, mask_top, x1 - 2, y1 - 1, COLORS["skin_2"])
        for y in range(mask_top, y1, 2):
            for x in range(x0 + 2, x1 - 1, 2):
                set_px(canvas, x, y, COLORS["accent_0"])
    else:
        fill_rect(canvas, x0 + 2, mask_top, x1 - 2, y1 - 1, COLORS["skin_0"])

    return canvas


def draw_eyes_layer(eye_type: str) -> np.ndarray:
    canvas = blank_canvas()
    _, y0, _, y1 = head_bounds("Taper")
    eye_y = y0 + (y1 - y0) // 3

    if eye_type == "Wedge":
        set_px(canvas, CX - 5, eye_y, COLORS["accent_0"])
        set_px(canvas, CX - 4, eye_y + 1, COLORS["accent_0"])
        set_px(canvas, CX + 4, eye_y, COLORS["accent_1"])
    elif eye_type == "Uneven":
        fill_rect(canvas, CX - 6, eye_y, CX - 4, eye_y + 2, COLORS["accent_0"])
        set_px(canvas, CX + 5, eye_y + 1, COLORS["accent_1"])
    elif eye_type == "Hollow":
        stroke_rect(canvas, CX - 6, eye_y, CX - 4, eye_y + 2, COLORS["outline"])
        stroke_rect(canvas, CX + 5, eye_y, CX + 7, eye_y + 1, COLORS["outline"])
    elif eye_type == "Glow":
        fill_rect(canvas, CX - 6, eye_y, CX - 4, eye_y + 2, COLORS["accent_0"])
        fill_rect(canvas, CX + 4, eye_y + 1, CX + 6, eye_y + 3, COLORS["accent_0"])
    elif eye_type == "Monocular":
        fill_rect(canvas, CX - 6, eye_y, CX - 4, eye_y + 2, COLORS["accent_0"])
        fill_rect(canvas, CX + 4, eye_y, CX + 7, eye_y + 2, COLORS["skin_0"])
    elif eye_type == "Cross-scarred":
        for d in range(-2, 3):
            set_px(canvas, CX - 5 + d, eye_y + d, COLORS["accent_1"])
        set_px(canvas, CX + 5, eye_y + 1, COLORS["accent_0"])
    elif eye_type == "Twin-dot offset":
        set_px(canvas, CX - 5, eye_y, COLORS["accent_0"])
        set_px(canvas, CX + 4, eye_y + 2, COLORS["accent_0"])
    elif eye_type == "Void":
        pass
    else:
        set_px(canvas, CX - 5, eye_y, COLORS["accent_0"])
        set_px(canvas, CX + 4, eye_y + 1, COLORS["accent_1"])

    return canvas


def draw_hair_layer(head_shape: str, hair_style: str) -> np.ndarray:
    """Default orientation: mass swept to the LEFT (flipped at compose time for R)."""
    canvas = blank_canvas()
    x0, y0, x1, y1 = head_bounds(head_shape)
    left_x = x0 - 6

    if hair_style == "Bald + scalp mark":
        return canvas

    if hair_style == "Sidefall":
        fill_rect(canvas, left_x, y0 - 1, x0 + 2, y0 + 12, COLORS["hair_2"])
        fill_rect(canvas, left_x + 1, y0 + 10, x0 + 4, y0 + 14, COLORS["hair_1"])
    elif hair_style == "Offset spikes":
        for i in range(4):
            fill_rect(canvas, left_x + i, y0 - 2 - i, left_x + i + 2, y0 + 6, COLORS["hair_2"])
    elif hair_style == "Asym undercut":
        fill_rect(canvas, left_x, y0 + 4, x0 + 1, y0 + 12, COLORS["hair_0"])
        fill_rect(canvas, x0 + 2, y0, x1 - 2, y0 + 4, COLORS["hair_1"])
    elif hair_style == "Hood-hair hybrid":
        fill_rect(canvas, left_x - 2, y0 - 2, x1 + 1, y0 + 8, COLORS["hair_1"])
        fill_rect(canvas, left_x, y0 + 6, x0 + 3, y0 + 14, COLORS["hair_2"])
    elif hair_style == "Braided tail":
        fill_rect(canvas, left_x, y0, x0, y0 + 10, COLORS["hair_1"])
        fill_rect(canvas, left_x - 1, y0 + 10, left_x + 1, y0 + 18, COLORS["hair_2"])
    elif hair_style == "Crest lock":
        fill_rect(canvas, x0 + 2, y0 - 3, x0 + 5, y0 + 8, COLORS["hair_2"])
        fill_rect(canvas, left_x, y0, x0 + 1, y0 + 8, COLORS["hair_1"])
    elif hair_style == "Windblown":
        for i in range(5):
            set_px(canvas, left_x + i, y0 + i, COLORS["hair_2"])
            set_px(canvas, left_x + i + 1, y0 + i + 2, COLORS["hair_1"])
    else:
        fill_rect(canvas, left_x, y0, x0 + 2, y0 + 10, COLORS["hair_2"])

    return canvas


def draw_mark_layer(mark_type: str) -> np.ndarray:
    canvas = blank_canvas()
    _, y0, _, _ = head_bounds("Taper")
    mx, my = CX - 1, y0 + 3

    if mark_type == "Bar":
        fill_rect(canvas, mx - 2, my, mx + 2, my, COLORS["mark"])
    elif mark_type == "Twin dots":
        set_px(canvas, mx - 2, my, COLORS["mark"])
        set_px(canvas, mx + 2, my, COLORS["mark"])
    elif mark_type == "Chevron":
        set_px(canvas, mx - 2, my + 1, COLORS["mark"])
        set_px(canvas, mx, my, COLORS["mark"])
        set_px(canvas, mx + 2, my + 1, COLORS["mark"])
    elif mark_type == "Slash":
        for d in range(4):
            set_px(canvas, mx - 2 + d, my + d, COLORS["mark"])
    elif mark_type == "Ring":
        stroke_rect(canvas, mx - 2, my - 1, mx + 2, my + 2, COLORS["mark"])
    elif mark_type == "Sigil A":
        set_px(canvas, mx, my, COLORS["mark"])
        set_px(canvas, mx - 1, my + 1, COLORS["mark"])
        set_px(canvas, mx + 1, my + 1, COLORS["mark"])
    elif mark_type == "Sigil B":
        fill_rect(canvas, mx - 1, my, mx + 1, my + 2, COLORS["mark"])
        set_px(canvas, mx, my + 1, COLORS["outline"])
    elif mark_type == "Sigil C":
        for x in range(mx - 2, mx + 3):
            set_px(canvas, x, my, COLORS["mark"])
    elif mark_type == "Burn":
        set_px(canvas, mx - 1, my, COLORS["mark"])
        set_px(canvas, mx, my + 1, COLORS["mark"])
        set_px(canvas, mx + 1, my, COLORS["mark"])
        set_px(canvas, mx, my - 1, COLORS["accent_1"])
    elif mark_type == "Prism":
        set_px(canvas, mx - 1, my, COLORS["accent_0"])
        set_px(canvas, mx + 1, my, COLORS["accent_1"])
        set_px(canvas, mx, my + 1, COLORS["mark"])
    else:
        fill_rect(canvas, mx - 2, my, mx + 2, my, COLORS["mark"])

    return canvas


def draw_body_layer(body_type: str) -> np.ndarray:
    canvas = blank_canvas()
    shoulder = BODY_SHOULDER.get(body_type, 20)
    x0 = CX - shoulder // 2
    x1 = CX + shoulder // 2
    slouch_drop = 2 if body_type == "Slouch" else 0

    fill_rect(canvas, x0, BODY_TOP, x1, FEET - 3, COLORS["skin_1"])
    stroke_rect(canvas, x0, BODY_TOP, x1, FEET - 3, COLORS["outline"])

    if body_type == "Hover":
        pass
    else:
        fill_rect(canvas, x0 + 2, FEET - 2, x0 + 5, FEET, COLORS["skin_2"])
        fill_rect(canvas, x1 - 5, FEET - 2, x1 - 2, FEET, COLORS["skin_2"])

    if body_type == "Slouch":
        fill_rect(canvas, x1 - 3, BODY_TOP + slouch_drop, x1, BODY_TOP + 8, COLORS["skin_0"])
    elif body_type == "Warped":
        fill_rect(canvas, x0 - 1, BODY_TOP + 8, x0 + 2, FEET - 4, COLORS["skin_0"])

    return canvas


def draw_clothing_layer(body_type: str, torso: str) -> np.ndarray:
    canvas = blank_canvas()
    shoulder = BODY_SHOULDER.get(body_type, 20)
    x0 = CX - shoulder // 2
    x1 = CX + shoulder // 2
    y1 = FEET - 3

    base_color = COLORS["cloth_1"]
    trim = COLORS["cloth_2"]

    if torso == "Wrap":
        fill_rect(canvas, x0 + 1, BODY_TOP + 2, x1 - 1, y1 - 2, base_color)
        for y in range(BODY_TOP + 4, y1 - 2, 4):
            set_px(canvas, x0 + 2, y, trim)
    elif torso == "Utility vest":
        fill_rect(canvas, x0 + 1, BODY_TOP + 1, x1 - 1, y1 - 6, base_color)
        fill_rect(canvas, x0 + 3, BODY_TOP + 4, x0 + 5, BODY_TOP + 8, trim)
        fill_rect(canvas, x1 - 5, BODY_TOP + 4, x1 - 3, BODY_TOP + 8, trim)
    elif torso == "Highcollar":
        fill_rect(canvas, x0, BODY_TOP, x1, BODY_TOP + 5, trim)
        fill_rect(canvas, x0 + 1, BODY_TOP + 4, x1 - 1, y1 - 2, base_color)
    elif torso == "Drape":
        fill_rect(canvas, x0 - 1, BODY_TOP + 2, x0 + 4, y1, base_color)
        fill_rect(canvas, x1 - 4, BODY_TOP + 4, x1, y1 - 4, COLORS["cloth_0"])
    elif torso == "Plated":
        fill_rect(canvas, x0, BODY_TOP + 1, x1, y1 - 2, trim)
        for y in range(BODY_TOP + 3, y1 - 3, 3):
            for x in range(x0 + 1, x1, 3):
                set_px(canvas, x, y, COLORS["outline"])
    elif torso == "Hooded":
        fill_rect(canvas, x0 - 2, BODY_TOP - 2, x1 + 1, BODY_TOP + 6, COLORS["cloth_0"])
        fill_rect(canvas, x0 + 1, BODY_TOP + 4, x1 - 1, y1 - 2, base_color)
    elif torso == "Harness":
        fill_rect(canvas, x0 + 1, BODY_TOP + 2, x1 - 1, y1 - 2, base_color)
        for y in range(BODY_TOP + 2, y1 - 1, 5):
            fill_rect(canvas, x0 + 1, y, x1 - 1, y, trim)
    elif torso == "Tattered":
        fill_rect(canvas, x0 + 1, BODY_TOP + 3, x1 - 1, y1 - 2, base_color)
        for x in range(x0 + 2, x1 - 1, 4):
            set_px(canvas, x, y1 - 2, COLORS["outline"])
    elif torso == "Regalia":
        fill_rect(canvas, x0, BODY_TOP, x1, y1 - 2, trim)
        fill_rect(canvas, x0 + 2, BODY_TOP + 2, x1 - 2, y1 - 4, COLORS["accent_1"])
    elif torso == "Bare-plated":
        fill_rect(canvas, x0 + 1, BODY_TOP + 1, x1 - 1, y1 - 2, trim)
    else:
        fill_rect(canvas, x0 + 1, BODY_TOP + 2, x1 - 1, y1 - 2, base_color)

    return canvas
