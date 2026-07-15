#!/usr/bin/env python3
"""Extract token #1 mouth-expression pixel patches for /awaken-demo."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_ROOT.parent
ENGINE_ROOT = REPO_ROOT / "chromies-engine"
COMPONENTS = REPO_ROOT / "art-pipeline" / "components"
FACE_REGIONS = SCRIPTS_ROOT / "anim" / "face-regions.json"
TRAITS = REPO_ROOT / "art-pipeline" / "traits.json"
MINT_DATA = REPO_ROOT / "public" / "data" / "mint-data.json"
OUT = REPO_ROOT / "src" / "pages" / "AwakenDemo" / "mist-mouth-patches.json"

if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from anim._canonical_token_source import canonical_grid_for_token, load_mint_records  # noqa: E402
from anim.expression_deltas import apply_delta, diff_to_delta, split_delta_into_steps  # noqa: E402
from engine.on_chain_palette import palette_colors  # noqa: E402
from engine.palette_renderer import hex_to_rgb  # noqa: E402

TOKEN_ID = 1
BASELINE = "Chubby_Front"
VARIANTS = [
    "Chubby_Smile",
    "Chubby_Frown",
    "Chubby_Neutral",
    "Chubby_Pouting",
]
MOUTH_ANCHOR = [32, 34]

# Expression PNGs use #4c270f as a lip-shadow tone; traits.json maps it to
# skin_shadow_deep (palette white on SIGNAL). Remap only here for mouth patches.
MOUTH_EXPRESSION_HEX_ROLE_OVERRIDE = {
    "#4c270f": "skin_shadow",
}

ROLE_TO_INDEX = {
    "hood": 0,
    "mask_dark": 1,
    "mask_mid": 2,
    "skin_shadow_deep": 3,
    "skin_shadow": 4,
    "skin_mid": 5,
    "skin_light": 6,
    "skin_highlight": 7,
    "highlight": 8,
    "eye_socket": 10,
    "eye_glow": 11,
    "eye_signal": 12,
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def variant_file(traits: dict, name: str) -> Path:
    for v in traits["slots"]["expression"]["variants"]:
        if v["name"] == name:
            return COMPONENTS / v["file"].replace("\\", "/")
    raise KeyError(name)


def coords_from_png(png_path: Path) -> list[list[int]]:
    with Image.open(png_path) as im:
        arr = np.array(im.convert("RGBA"), dtype=np.uint8)
    coords: list[list[int]] = []
    for y in range(arr.shape[0]):
        for x in range(arr.shape[1]):
            if arr[y, x, 3] > 0:
                coords.append([x, y])
    return coords


def region_coords(face_regions: dict, traits: dict, name: str) -> list[list[int]]:
    mouths = face_regions.get("mouths", {})
    if name in mouths:
        return mouths[name]
    path = variant_file(traits, name)
    return coords_from_png(path)


def extract_pixels(
    png_path: Path,
    coords: list[list[int]],
    draw_colors: dict[str, str],
    palette_id: int,
) -> list[dict]:
    colors = palette_colors(palette_id)
    hex_to_role = {k.lower(): v for k, v in draw_colors.items()}
    with Image.open(png_path) as im:
        arr = np.array(im.convert("RGBA"), dtype=np.uint8)

    pixels: list[dict] = []
    for x, y in coords:
        r, g, b, a = (int(arr[y, x, i]) for i in range(4))
        if a == 0:
            continue
        hx = f"#{r:02x}{g:02x}{b:02x}"
        role = MOUTH_EXPRESSION_HEX_ROLE_OVERRIDE.get(hx) or hex_to_role.get(hx)
        if role is None:
            pixels.append({"x": x, "y": y, "rgba": [r, g, b, a]})
            continue
        idx = ROLE_TO_INDEX.get(role)
        if idx is None:
            pixels.append({"x": x, "y": y, "rgba": [r, g, b, a]})
            continue
        pr, pg, pb = hex_to_rgb(colors[idx])
        pixels.append({"x": x, "y": y, "rgba": [pr, pg, pb, 255]})
    return pixels


def union_coords(face_regions: dict, traits: dict, names: list[str]) -> list[list[int]]:
    seen: set[tuple[int, int]] = set()
    out: list[list[int]] = []
    for name in names:
        for x, y in region_coords(face_regions, traits, name):
            key = (x, y)
            if key in seen:
                continue
            seen.add(key)
            out.append([x, y])
    return out


def pixels_to_grid(base_grid: np.ndarray, pixels: list[dict]) -> np.ndarray:
    out = base_grid.copy()
    for p in pixels:
        x, y = p["x"], p["y"]
        rgba = p["rgba"]
        out[y, x, 0:4] = rgba
    return out


def delta_steps(base_grid: np.ndarray, target_pixels: list[dict], region: list[list[int]]) -> list[list[dict]]:
    target_grid = pixels_to_grid(base_grid, target_pixels)
    delta, palette = diff_to_delta(base_grid, target_grid, region)
    if not delta:
        return []
    steps = split_delta_into_steps(base_grid, delta)
    steps_out: list[list[dict]] = []
    for step in steps:
        stepped = apply_delta(base_grid, step, palette)
        step_pixels = []
        for x, y, idx in step:
            r, g, b = palette[idx]
            step_pixels.append({"x": x, "y": y, "rgba": [r, g, b, 255]})
        steps_out.append(step_pixels)
    return steps_out


def main() -> None:
    face_regions = load_json(FACE_REGIONS)
    traits = load_json(TRAITS)
    mint_records = load_mint_records()
    record = mint_records[TOKEN_ID]
    traits_raw = bytes.fromhex(record["traitsHex"].lower().removeprefix("0x"))
    palette_id = traits_raw[1]
    draw_colors = traits["slots"]["expression"]["drawColors"]

    base_grid = canonical_grid_for_token(TOKEN_ID, mint_records)
    mask_coords = union_coords(face_regions, traits, [BASELINE, *VARIANTS])
    baseline_region = region_coords(face_regions, traits, BASELINE)

    baseline_pixels = [
        {"x": x, "y": y, "rgba": base_grid[y, x].tolist()}
        for x, y in baseline_region
        if base_grid[y, x, 3] > 0
    ]

    variants_out: dict[str, dict] = {}
    for name in VARIANTS:
        coords = region_coords(face_regions, traits, name)
        path = variant_file(traits, name)
        pixels = extract_pixels(path, coords, draw_colors, palette_id)
        steps = delta_steps(base_grid, pixels, mask_coords)
        variants_out[name] = {
            "pixels": pixels,
            "steps": steps,
            "stepCount": len(steps),
        }

    payload = {
        "tokenId": TOKEN_ID,
        "baseline": BASELINE,
        "mouthAnchor": MOUTH_ANCHOR,
        "paletteId": palette_id,
        "maskCoords": mask_coords,
        "baselinePixels": baseline_pixels,
        "variants": variants_out,
        "transition": {
            "stepFrames": 2,
            "holdFrames": 24,
            "reverseMode": "fast",
        },
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"wrote {OUT}")
    for name, data in variants_out.items():
        print(f"  {name}: {len(data['pixels'])} pixels, {data['stepCount']} steps")


if __name__ == "__main__":
    main()
