"""On-chain palette colors — loaded from compiler-generated registry JSON."""

from __future__ import annotations

from engine.palette_registry_data import palette_colors_on_chain


def palette_colors(palette_id: int) -> list[str]:
    """Return 16 hex colors as the contract would at tokenURI render time."""
    return palette_colors_on_chain(palette_id)


def normalize_hex_colors(colors: list[str]) -> list[str]:
    return [c.lower() for c in colors]
