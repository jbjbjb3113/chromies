"""Pixel-level constitution checks."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from engine.config import ALPHA_OPAQUE, ALPHA_TRANSPARENT, CANVAS_SIZE
from engine.image_analysis import thumbnail_readability
from engine.models import PixelValidation
from engine.validation_modes import DEFAULT_VALIDATION_MODE, ValidationMode, mode_thresholds


def load_rgba(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGBA")
    if img.size != (CANVAS_SIZE, CANVAS_SIZE):
        img = img.resize((CANVAS_SIZE, CANVAS_SIZE), Image.NEAREST)
    return np.array(img, dtype=np.uint8)


def count_orphans(alpha: np.ndarray) -> int:
    opaque = alpha == ALPHA_OPAQUE
    h, w = opaque.shape
    orphans = 0
    for y in range(h):
        for x in range(w):
            if not opaque[y, x]:
                continue
            neighbors = 0
            if y > 0 and opaque[y - 1, x]:
                neighbors += 1
            if y < h - 1 and opaque[y + 1, x]:
                neighbors += 1
            if x > 0 and opaque[y, x - 1]:
                neighbors += 1
            if x < w - 1 and opaque[y, x + 1]:
                neighbors += 1
            if neighbors == 0:
                orphans += 1
    return orphans


def count_edge_touch(alpha: np.ndarray) -> int:
    opaque = alpha == ALPHA_OPAQUE
    edge = np.zeros_like(opaque, dtype=bool)
    edge[0:2, :] = True
    edge[-2:, :] = True
    edge[:, 0:2] = True
    edge[:, -2:] = True
    return int(np.sum(opaque & edge))


def count_non_binary_alpha(alpha: np.ndarray) -> int:
    return int(np.sum((alpha != ALPHA_OPAQUE) & (alpha != ALPHA_TRANSPARENT)))


def validate_pixels(
    image: np.ndarray,
    *,
    mode: ValidationMode = DEFAULT_VALIDATION_MODE,
    phase1_lenient: bool | None = None,
) -> PixelValidation:
    if phase1_lenient is not None:
        mode = ValidationMode.LENIENT if phase1_lenient else ValidationMode.STRICT

    thresholds = mode_thresholds(mode)["pixel"]
    notes: list[str] = [f"validation_mode={mode.value}"]

    alpha = image[:, :, 3]
    opaque = alpha == ALPHA_OPAQUE
    pixel_count = int(np.sum(opaque))
    orphans = count_orphans(alpha)
    edge_touch = count_edge_touch(alpha)
    non_binary = count_non_binary_alpha(alpha)

    if orphans > 0:
        notes.append(f"{orphans} orphan pixel(s)")
    if edge_touch > 0:
        notes.append(f"{edge_touch} pixel(s) touch canvas edge buffer")
    if non_binary > 0:
        notes.append(f"{non_binary} non-binary alpha value(s)")

    passed = orphans <= thresholds["max_orphans"] and non_binary <= thresholds["max_non_binary_alpha"]
    if thresholds.get("fail_on_edge_touch"):
        passed = passed and edge_touch == 0
    elif edge_touch > 0 and mode == ValidationMode.ART_PIPELINE:
        notes.append("edge-touch allowed for full-bleed body/hood/shirt art layers")

    return PixelValidation(
        pass_=passed,
        pixel_count=pixel_count,
        orphans=orphans,
        edge_touch=edge_touch,
        non_binary_alpha=non_binary,
        thumbnail_retention=round(thumbnail_readability(image), 4),
        notes=notes,
    )


def validate_png(
    path: Path,
    *,
    mode: ValidationMode = DEFAULT_VALIDATION_MODE,
    phase1_lenient: bool | None = None,
) -> PixelValidation:
    return validate_pixels(load_rgba(path), mode=mode, phase1_lenient=phase1_lenient)


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate pixel constitution rules")
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
