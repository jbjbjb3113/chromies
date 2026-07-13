"""Small helper: render a side-by-side contact sheet of catalogue sprites.

Not part of the primitive/renderer pipeline -- this is a standalone review
tool so a crowd scene's token picks can be checked at a glance (and swapped
in the scene JSON) before committing to a full render. Reuses the same
catalogue loader the renderer uses; does not touch scripts/anim/primitives.py
or scripts/animate-scene.py.

Usage:
    python scripts/anim/contact_sheet.py --tokens 4 12 3 11 1 6 32 207 15 108 76 \
        --out out/anim/scenes/crowd-contact-sheet.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

from anim.catalogue import GRID, load_sprite_rgba  # noqa: E402

DEFAULT_TOKENS_DIR = SCRIPTS_ROOT.parent / "art-pipeline" / "output" / "tokens"
LABEL_BAND_H = 20
SHEET_BG = (227, 229, 228)  # #e3e5e4


def _label_font() -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=14)
    except TypeError:
        return ImageFont.load_default()


def build_contact_sheet(
    token_ids: list[int], tokens_dir: Path, scale: int = 4, label: bool = True
) -> Image.Image:
    """Sprites are placed edge-to-edge at native pixel scale (nearest-neighbor
    block replication only); the token-id label band below each cell is a
    review aid, drawn directly at output resolution -- it is not part of the
    pixel-exact sprite render."""
    cell = GRID * scale
    label_h = LABEL_BAND_H if label else 0
    sheet = Image.new("RGB", (cell * len(token_ids), cell + label_h), SHEET_BG)
    draw = ImageDraw.Draw(sheet)
    font = _label_font() if label else None

    for i, token_id in enumerate(token_ids):
        rgba = load_sprite_rgba(token_id, tokens_dir)
        rgb = rgba[:, :, :3]
        upscaled = np.repeat(np.repeat(rgb, scale, axis=0), scale, axis=1)
        sheet.paste(Image.fromarray(upscaled, mode="RGB"), (i * cell, 0))
        if label:
            draw.text((i * cell + 6, cell + 2), str(token_id), fill=(20, 20, 20), font=font)

    return sheet


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tokens", type=int, nargs="+", required=True)
    parser.add_argument("--tokens-dir", type=Path, default=DEFAULT_TOKENS_DIR)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--scale", type=int, default=4)
    args = parser.parse_args()

    sheet = build_contact_sheet(args.tokens, args.tokens_dir, args.scale)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out)
    print(f"Contact sheet: {args.out} ({sheet.size[0]}x{sheet.size[1]})")


if __name__ == "__main__":
    main()
