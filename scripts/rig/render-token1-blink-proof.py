#!/usr/bin/env python3
"""Single-token blink proof for token #1 (Chubby_DFrameFilled)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_ROOT.parent
RIG_PATH = SCRIPTS_ROOT / "rig" / "facial-rigs.json"
OUT_DIR = REPO_ROOT / "out" / "rig"

if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

from anim._canonical_token_source import canonical_grid_for_token, load_mint_records  # noqa: E402

SCALE = 16
TOKEN_ID = 1


def closed_blink_frame(grid: np.ndarray, eyes: list[list[int]], fill_rgba: list[int]) -> np.ndarray:
    out = grid.copy()
    color = np.array(fill_rgba, dtype=np.uint8)
    for ex, ey in eyes:
        out[ey, ex] = color
    return out


def upscale(grid: np.ndarray) -> Image.Image:
    rgb = grid[:, :, :3].astype(np.uint8)
    arr = np.repeat(np.repeat(rgb, SCALE, axis=0), SCALE, axis=1)
    return Image.fromarray(arr, mode="RGB")


def main() -> None:
    rigs = json.loads(RIG_PATH.read_text(encoding="utf-8"))
    rig = rigs["rigs"][str(TOKEN_ID)]
    mint_records = load_mint_records()
    base = canonical_grid_for_token(TOKEN_ID, mint_records)

    open_frame = base.copy()
    closed_frame = closed_blink_frame(base, rig["eyes"], rig["closedEyeFill"])

    open_img = upscale(open_frame)
    closed_img = upscale(closed_frame)

    strip_w = 64 * SCALE * 2 + 24
    strip_h = 64 * SCALE + 40
    sheet = Image.new("RGB", (strip_w, strip_h), (32, 32, 40))

    sheet.paste(open_img, (8, 8))
    sheet.paste(closed_img, (8 + 64 * SCALE + 8, 8))

    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default(size=14)
    except TypeError:
        font = ImageFont.load_default()

    draw.text((8, 8 + 64 * SCALE + 4), "OPEN", fill=(220, 220, 230), font=font)
    draw.text((8 + 64 * SCALE + 8, 8 + 64 * SCALE + 4), "CLOSED (closedEyeFill)", fill=(220, 220, 230), font=font)
    label = (
        f"#{TOKEN_ID} {rig['character']} glasses={rig['glassesTrait']} "
        f"fill={rig['closedEyeFill'][:3]}"
    )
    draw.text((8, strip_h - 18), label, fill=(180, 180, 190), font=font)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "token1-blink-proof.png"
    sheet.save(out_path)

    # Also save eye-region crop for close inspection
    crop_y0, crop_y1 = 20 * SCALE, 32 * SCALE
    crop_x0, crop_x1 = 20 * SCALE, 44 * SCALE
    crop = sheet.crop((crop_x0, crop_y0, crop_x1, crop_y1))
    crop_path = OUT_DIR / "token1-blink-proof-eyes-crop.png"
    crop.save(crop_path)

    print(f"wrote {out_path}")
    print(f"wrote {crop_path}")
    print(f"glassesTrait={rig['glassesTrait']}")
    print(f"closedEyeFill={rig['closedEyeFill']}")


if __name__ == "__main__":
    main()
