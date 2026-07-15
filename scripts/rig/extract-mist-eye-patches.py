#!/usr/bin/env python3
"""One-off: extract token #1 eye-variant pixel patches for /awaken-demo."""

from __future__ import annotations

import json
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
OUT = REPO_ROOT / "src" / "pages" / "AwakenDemo" / "mist-eye-patches.json"

if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from anim._canonical_token_source import canonical_grid_for_token, load_mint_records  # noqa: E402
from engine.on_chain_palette import palette_colors  # noqa: E402
from engine.palette_renderer import hex_to_rgb  # noqa: E402

TOKEN_ID = 1
BASELINE = "Chubby_Squint_Right"
VARIANTS = [
    "Chubby_Squint_Left",
    "Chubby_Squint_Straight",
    "Chubby_CrossEyed",
    "Chubby_Stoned",
    "Chubby_Signal",
]

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
    for v in traits["slots"]["eyes"]["variants"]:
        if v["name"] == name:
            return COMPONENTS / v["file"].replace("\\", "/")
    raise KeyError(name)


def extract_eye_pixels(
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
        role = hex_to_role.get(hx)
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


def union_coords(face_regions: dict, names: list[str]) -> list[list[int]]:
    seen: set[tuple[int, int]] = set()
    out: list[list[int]] = []
    for name in names:
        for x, y in face_regions["eyes"][name]:
            key = (x, y)
            if key in seen:
                continue
            seen.add(key)
            out.append([x, y])
    return out


def main() -> None:
    face_regions = load_json(FACE_REGIONS)
    traits = load_json(TRAITS)
    mint_records = load_mint_records()
    record = mint_records[TOKEN_ID]
    traits_raw = bytes.fromhex(record["traitsHex"].lower().removeprefix("0x"))
    palette_id = traits_raw[1]
    draw_colors = traits["slots"]["eyes"]["drawColors"]

    base_grid = canonical_grid_for_token(TOKEN_ID, mint_records)
    mask_coords = union_coords(face_regions, [BASELINE, *VARIANTS])

    baseline_pixels = [
        {"x": x, "y": y, "rgba": base_grid[y, x].tolist()}
        for x, y in mask_coords
        if base_grid[y, x, 3] > 0
    ]

    variants_out: dict[str, list[dict]] = {}
    for name in VARIANTS:
        coords = face_regions["eyes"][name]
        path = variant_file(traits, name)
        variants_out[name] = extract_eye_pixels(path, coords, draw_colors, palette_id)

    payload = {
        "tokenId": TOKEN_ID,
        "baseline": BASELINE,
        "paletteId": palette_id,
        "maskCoords": mask_coords,
        "baselinePixels": baseline_pixels,
        "variants": variants_out,
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"wrote {OUT}")
    for name, px in variants_out.items():
        print(f"  {name}: {len(px)} pixels")


if __name__ == "__main__":
    main()
