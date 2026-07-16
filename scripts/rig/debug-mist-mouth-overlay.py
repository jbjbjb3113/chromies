#!/usr/bin/env python3
"""Compare token #1 mouth pixels: baseline vs Neutral vs talk-open collision check."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SCRIPTS = REPO / "scripts"
COMPONENTS = REPO / "art-pipeline" / "components"
MOUTH_PATCHES = REPO / "src" / "pages" / "AwakenDemo" / "mist-mouth-patches.json"
NEUTRAL_PNG = COMPONENTS / "chubby" / "EXPRESSION_Chubby_Neutral.png"
OUT = REPO / "out" / "rig"

if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from anim._canonical_token_source import canonical_grid_for_token, load_mint_records  # noqa: E402

GRID = 64
MOUTH_LINE = [(x, 34) for x in range(29, 35)]
MOUTH_CORNERS = [(28, 35), (35, 35)]
TALK_PROBE_X = range(29, 35)


def rgba_str(grid: np.ndarray, x: int, y: int) -> tuple[int, ...]:
    return tuple(int(v) for v in grid[y, x, :4])


def main() -> None:
    patches = json.loads(MOUTH_PATCHES.read_text(encoding="utf-8"))
    mint_records = load_mint_records()
    canonical = canonical_grid_for_token(1, mint_records)

    baseline_map = {(p["x"], p["y"]): p["rgba"] for p in patches["baselinePixels"]}
    neutral_map = {(p["x"], p["y"]): p["rgba"] for p in patches["variants"]["Chubby_Neutral"]["pixels"]}
    smile_map = {(p["x"], p["y"]): p["rgba"] for p in patches["variants"]["Chubby_Smile"]["pixels"]}

    print("=== SANITY: canonical baseline (Chubby_Front) vs Chubby_Neutral overlay ===")
    for x, y in MOUTH_LINE:
        base = baseline_map.get((x, y), rgba_str(canonical, x, y))
        neutral = neutral_map.get((x, y))
        diff = base[:3] != tuple(neutral[:3]) if neutral else True
        print(f"  ({x},{y}) baseline={base[:3]} neutral={neutral[:3] if neutral else None} differs={diff}")

    print("\n=== SANITY: Chubby_Smile vs baseline (force-test visibility) ===")
    for x, y in sorted(smile_map.keys()):
        base = baseline_map.get((x, y), rgba_str(canonical, x, y))
        smile = smile_map[(x, y)]
        print(f"  ({x},{y}) baseline={base[:3]} smile={smile[:3]}")

    print("\n=== TALK OPEN +1px: probe y=32 row (would extend if maxOpenRows=4) ===")
    for x in TALK_PROBE_X:
        px = rgba_str(canonical, x, 32)
        mouth_px = rgba_str(canonical, x, 34)
        print(f"  ({x},32)={px[:3]}  ({x},34)mouth={mouth_px[:3]}")

    print("\n=== TALK OPEN +1px: probe y=36 row (below corners) ===")
    for x in range(28, 37):
        px = rgba_str(canonical, x, 36)
        print(f"  ({x},36)={px[:3]}")

    print("\n=== Current talk bounds y=33-35 at max open (3 rows) ===")
    for y in range(33, 36):
        row = [rgba_str(canonical, x, y)[:3] for x in TALK_PROBE_X]
        print(f"  y={y}: {row}")

    print("\n=== Simulated maxOpenRows=4 (slitStart=32, rows 32-35) collision ===")
    for y in range(32, 36):
        for x in TALK_PROBE_X:
            px = rgba_str(canonical, x, y)
            if y == 34:
                role = "mouth-line"
            elif y == 32:
                role = "NEW-row"
            else:
                role = "existing-talk"
            print(f"  ({x},{y}) [{role}]={px[:3]}")

    # Raw Neutral PNG palette-mapped check at mouth line only
    print("\n=== EXPRESSION_Chubby_Neutral.png raw at mouth line ===")
    with Image.open(NEUTRAL_PNG) as im:
        arr = np.array(im.convert("RGBA"))
    for x, y in MOUTH_LINE:
        r, g, b, a = (int(arr[y, x, i]) for i in range(4))
        print(f"  ({x},{y}) raw=({r},{g},{b}) alpha={a}")

    OUT.mkdir(parents=True, exist_ok=True)


if __name__ == "__main__":
    main()
