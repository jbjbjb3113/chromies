"""Render preview PNG from inscribed mint payload (packed pixels + trait bytes)."""

from __future__ import annotations

import numpy as np

from engine.mint_payload import TRAITS_BYTES, decode_traits, unpack_pixels
from engine.on_chain_palette import palette_colors
from engine.palette_renderer import hex_to_rgb

# Renderer-level universal background (not payload / registry palette slot 0).
UNIVERSAL_BACKGROUND = "#e3e5e4"


def render_role_buffer(role_buffer: np.ndarray, palette_colors_list: list[str], *, grid: int = 64) -> np.ndarray:
    """Map role indices through a 16-color palette to RGBA (matches on-chain renderer output)."""
    buf = np.asarray(role_buffer, dtype=np.uint8).reshape(-1)
    if buf.size != grid * grid:
        raise ValueError(f"expected {grid * grid} pixels, got {buf.size}")

    rgba = np.zeros((grid, grid, 4), dtype=np.uint8)
    bg = hex_to_rgb(UNIVERSAL_BACKGROUND)
    for i in range(buf.size):
        idx = int(buf[i])
        y, x = divmod(i, grid)
        if idx == 0:
            rgba[y, x] = (*bg, 255)
            continue
        hex_color = palette_colors_list[idx] if idx < len(palette_colors_list) else palette_colors_list[0]
        r, g, b = hex_to_rgb(hex_color)
        rgba[y, x] = (r, g, b, 255)
    return rgba


def render_from_payload(
    pixels_packed: bytes,
    traits_packed: bytes,
    *,
    grid: int = 64,
) -> np.ndarray:
    """
    Authoritative preview path: decode exact inscription payload, render with on-chain palette.
    """
    if len(traits_packed) != TRAITS_BYTES:
        raise ValueError(f"expected {TRAITS_BYTES} trait bytes, got {len(traits_packed)}")
    decoded = decode_traits(traits_packed)
    palette_id = decoded.palette_id
    colors = palette_colors(palette_id)
    role_buffer = unpack_pixels(pixels_packed)
    return render_role_buffer(role_buffer, colors, grid=grid)


def render_from_hex(pixels_hex: str, traits_hex: str, *, grid: int = 64) -> np.ndarray:
    from engine.mint_payload import from_hex

    return render_from_payload(from_hex(pixels_hex), from_hex(traits_hex), grid=grid)
