"""Palette membership checks against chromies-config role palettes."""

from __future__ import annotations

import argparse
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageColor

from engine.config import ALPHA_OPAQUE, CANVAS_SIZE
from engine.models import PaletteValidation
from engine.validation_modes import DEFAULT_VALIDATION_MODE, ValidationMode, mode_thresholds


@lru_cache(maxsize=1)
def _palette_color_cache() -> dict[str, set[tuple[int, int, int]]]:
    from engine.art_schema_loader import load_art_schema_bundle

    schema = load_art_schema_bundle()
    cache: dict[str, set[tuple[int, int, int]]] = {}
    for name, palette in schema.palettes.items():
        colors: set[tuple[int, int, int]] = set()
        for hex_color in palette.get("colors", []):
            colors.add(ImageColor.getcolor(hex_color, "RGB"))
        cache[name.upper()] = colors
    return cache


def load_chromies_palette(palette_key: str) -> set[tuple[int, int, int]]:
    cache = _palette_color_cache()
    key = palette_key.upper()
    if key in cache:
        return cache[key]
    if key.startswith("SIGNAL") and "SIGNAL" in cache:
        return cache["SIGNAL"]
    return cache.get("SIGNAL", set())


def rgb_to_hsv_degrees(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    import colorsys

    hsv = colorsys.rgb_to_hsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    return hsv[0] * 360.0, hsv[1], hsv[2]


def count_distinct_hues(colors: set[tuple[int, int, int]], min_separation: float = 15.0) -> int:
    hues = []
    for rgb in sorted(colors):
        h, s, _ = rgb_to_hsv_degrees(rgb)
        if s < 0.08:
            continue
        hues.append(h)

    if not hues:
        return 0

    distinct = 1
    hues.sort()
    for i in range(1, len(hues)):
        delta = min(abs(hues[i] - hues[i - 1]), 360 - abs(hues[i] - hues[i - 1]))
        if delta >= min_separation:
            distinct += 1
    return distinct


def validate_palette(
    image: np.ndarray,
    palette_key: str,
    *,
    mode: ValidationMode = DEFAULT_VALIDATION_MODE,
    phase1_lenient: bool | None = None,
) -> PaletteValidation:
    if phase1_lenient is not None:
        mode = ValidationMode.LENIENT if phase1_lenient else ValidationMode.STRICT

    thresholds = mode_thresholds(mode)["palette"]
    notes: list[str] = [f"validation_mode={mode.value}", f"palette_key={palette_key}"]

    allowed = load_chromies_palette(palette_key)
    alpha = image[:, :, 3]
    opaque = alpha == ALPHA_OPAQUE
    rgb_pixels = image[opaque][:, :3]

    used: set[tuple[int, int, int]] = set()
    out_of_palette = 0
    for px in rgb_pixels:
        key = (int(px[0]), int(px[1]), int(px[2]))
        used.add(key)
        if thresholds.get("require_in_palette", True) and key not in allowed:
            out_of_palette += 1

    distinct = len(used)
    hues = count_distinct_hues(used)

    saturations = []
    for rgb in used:
        _, s, _ = rgb_to_hsv_degrees(rgb)
        saturations.append(s)
    avg_saturation = float(sum(saturations) / len(saturations)) if saturations else 0.0

    passed = distinct <= thresholds["max_distinct_colors"]
    if thresholds.get("require_in_palette", True):
        passed = passed and out_of_palette == 0
    if thresholds["min_distinct_hues"] > 0:
        passed = passed and hues >= thresholds["min_distinct_hues"]

    if out_of_palette:
        notes.append(f"{out_of_palette} pixel(s) outside {palette_key} role palette")
    if distinct > thresholds["max_distinct_colors"]:
        notes.append(f"{distinct} distinct colors (max {thresholds['max_distinct_colors']})")
    if hues < thresholds["min_distinct_hues"]:
        notes.append(f"{hues} distinct hues (min {thresholds['min_distinct_hues']})")

    return PaletteValidation(
        pass_=passed,
        distinct_colors=distinct,
        hues=hues,
        out_of_palette=out_of_palette,
        avg_saturation=round(avg_saturation, 4),
        notes=notes,
    )


def validate_png(
    path: Path,
    palette_key: str,
    *,
    mode: ValidationMode = DEFAULT_VALIDATION_MODE,
    phase1_lenient: bool | None = None,
) -> PaletteValidation:
    img = Image.open(path).convert("RGBA")
    if img.size != (CANVAS_SIZE, CANVAS_SIZE):
        img = img.resize((CANVAS_SIZE, CANVAS_SIZE), Image.NEAREST)
    return validate_palette(
        np.array(img, dtype=np.uint8),
        palette_key,
        mode=mode,
        phase1_lenient=phase1_lenient,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate palette compliance")
    parser.add_argument("png", type=Path)
    parser.add_argument("--palette", default="SIGNAL")
    parser.add_argument(
        "--mode",
        choices=[m.value for m in ValidationMode],
        default=DEFAULT_VALIDATION_MODE.value,
    )
    args = parser.parse_args()
    result = validate_png(args.png, args.palette, mode=ValidationMode.from_str(args.mode))
    print(result.model_dump(by_alias=True))


if __name__ == "__main__":
    main()
