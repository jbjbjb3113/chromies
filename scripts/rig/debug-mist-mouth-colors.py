#!/usr/bin/env python3
"""Diagnose mouth expression + talk-sync color extraction for token #1."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SCRIPTS = REPO / "scripts"
COMPONENTS = REPO / "art-pipeline" / "components"
TRAITS = REPO / "art-pipeline" / "traits.json"
PATCHES = REPO / "src" / "pages" / "AwakenDemo" / "mist-mouth-patches.json"
FACE_REGIONS = SCRIPTS / "anim" / "face-regions.json"

if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))
if str(REPO / "chromies-engine") not in sys.path:
    sys.path.insert(0, str(REPO / "chromies-engine"))

from anim._canonical_token_source import canonical_grid_for_token, load_mint_records  # noqa: E402
from engine.on_chain_palette import palette_colors  # noqa: E402
from engine.palette_renderer import hex_to_rgb  # noqa: E402

VARIANTS = ["Chubby_Smile", "Chubby_Frown", "Chubby_Neutral", "Chubby_Pouting", "Chubby_Front"]
ROLE_TO_INDEX = {
    "mask_dark": 1,
    "mask_mid": 2,
    "skin_shadow_deep": 3,
    "skin_shadow": 4,
    "skin_mid": 5,
    "skin_light": 6,
    "skin_highlight": 7,
    "highlight": 8,
}


def variant_file(traits: dict, name: str) -> Path:
    for v in traits["slots"]["expression"]["variants"]:
        if v["name"] == name:
            return COMPONENTS / v["file"].replace("\\", "/")
    raise KeyError(name)


def main() -> None:
    traits = json.loads(TRAITS.read_text(encoding="utf-8"))
    face_regions = json.loads(FACE_REGIONS.read_text(encoding="utf-8"))
    patches = json.loads(PATCHES.read_text(encoding="utf-8"))
    mint_records = load_mint_records()
    record = mint_records[1]
    palette_id = bytes.fromhex(record["traitsHex"].lower().removeprefix("0x"))[1]
    draw_colors = traits["slots"]["expression"]["drawColors"]
    hex_to_role = {k.lower(): v for k, v in draw_colors.items()}
    palette = palette_colors(palette_id)

    print(f"=== Token #1 palette_id={palette_id} ===")
    print("expression drawColors:", draw_colors)
    print("\nMapped palette roles:")
    for role, idx in sorted(ROLE_TO_INDEX.items(), key=lambda x: x[1]):
        if idx < len(palette):
            print(f"  {role} [{idx}] -> {hex_to_rgb(palette[idx])}")

    print("\n=== RAW PNG pixels per expression variant ===")
    for name in VARIANTS:
        path = variant_file(traits, name)
        coords = face_regions["mouths"].get(name)
        if not coords and name == "Chubby_Frown":
            with Image.open(path) as im:
                arr = np.array(im.convert("RGBA"))
            coords = [[x, y] for y in range(arr.shape[0]) for x in range(arr.shape[1]) if arr[y, x, 3] > 0]
        with Image.open(path) as im:
            arr = np.array(im.convert("RGBA"))
        print(f"\n{name} ({path.name}):")
        raw_colors: set[str] = set()
        for x, y in coords or []:
            r, g, b, a = (int(arr[y, x, i]) for i in range(4))
            if a == 0:
                continue
            hx = f"#{r:02x}{g:02x}{b:02x}"
            role = hex_to_role.get(hx, "UNMAPPED")
            mapped = "n/a"
            if role != "UNMAPPED":
                idx = ROLE_TO_INDEX.get(role)
                if idx is not None:
                    mapped = str(hex_to_rgb(palette[idx]))
            raw_colors.add(hx)
            patch_px = next(
                (p for p in patches["variants"].get(name, {}).get("pixels", []) if p["x"] == x and p["y"] == y),
                patches["baselinePixels"][0] if name == "Chubby_Front" else None,
            )
            if name == "Chubby_Front":
                patch_px = next((p for p in patches["baselinePixels"] if p["x"] == x and p["y"] == y), None)
            patch_rgba = patch_px["rgba"][:3] if patch_px else None
            print(f"  ({x},{y}) raw={hx} role={role} mapped={mapped} patch_json={patch_rgba}")

        print(f"  distinct raw hex: {sorted(raw_colors)}")

    print("\n=== Live vs canonical mouth line (29-34, y=34) ===")
    canonical = canonical_grid_for_token(1, mint_records)
    for x in range(29, 35):
        c = tuple(int(v) for v in canonical[34, x, :3])
        print(f"  canonical ({x},34)={c}")

    print("\n=== Talk-sync interior color in mist-talk-mouth.js ===")
    print("  hardcoded interiorRgba = [26, 10, 20, 255]  (mask_dark / near-black)")

    print("\n=== All variant patch JSON colors (unique) ===")
    for name in VARIANTS:
        if name == "Chubby_Front":
            px = patches["baselinePixels"]
        else:
            px = patches["variants"][name]["pixels"]
        uniq = sorted({tuple(p["rgba"][:3]) for p in px})
        print(f"  {name}: {uniq}")


if __name__ == "__main__":
    main()
