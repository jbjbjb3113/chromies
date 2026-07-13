"""Loader for the existing banner-work per-token rendered-sprite catalogue.

Marketing-only data path: reads the already-rasterized 64x64 PNGs that the
off-chain art-pipeline compositor (art-pipeline/generate.js) writes to
art-pipeline/output/tokens/<id>.png for every token -- the same raster data
its sibling <id>.svg banner-style export is built from (SVGs there are drawn
on a 1000x1000 canvas at a 15.625px-per-cell unit, i.e. 1000/64). This module
reads the pre-rasterized 64x64 PNG directly and does NOT parse or re-parse
those SVGs.

Hard boundary: nothing in this file imports chromies-engine, trait-byte
tables, palette-registry code, or any other trait-byte-registry compilation
target, and nothing in this file writes anywhere near art-pipeline/output
or payload/trait data. It only reads a pre-existing catalogue PNG.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

GRID = 64
BG_HEX = "#e3e5e4"  # the catalogue PNGs' own baked-in background fill


def _hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def load_sprite_rgba(token_id: int, tokens_dir: Path, bg_hex: str = BG_HEX) -> np.ndarray:
    """Return a (GRID, GRID, 4) uint8 RGBA grid for `token_id`.

    Pixels matching `bg_hex` (the catalogue's own baked-in background fill --
    the source PNG has no real alpha channel) are chroma-keyed to alpha=0 so
    sprites composite correctly over a scene background and over each other.
    All other pixels are opaque (alpha=255).
    """
    path = tokens_dir / f"{token_id:04d}.png"
    if not path.exists():
        raise SystemExit(f"Token {token_id} not found in banner catalogue: {path}")
    im = Image.open(path).convert("RGB")
    if im.size != (GRID, GRID):
        raise SystemExit(f"Token {token_id}: catalogue PNG is {im.size}, expected {GRID}x{GRID}")
    rgb = np.array(im, dtype=np.uint8)
    bg_rgb = np.array(_hex_to_rgb(bg_hex), dtype=np.uint8)
    is_bg = np.all(rgb == bg_rgb, axis=-1)
    alpha = np.where(is_bg, 0, 255).astype(np.uint8)
    return np.dstack([rgb, alpha])
