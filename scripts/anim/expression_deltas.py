"""Delta-overlay format for stepped expression transitions + a dumb byte-cost packer.

Render-path safe: like scripts/anim/catalogue.py and scripts/anim/primitives.py, this
module never imports chromies-engine, trait-byte tables, or any compiled palette/trait
artifact -- it only manipulates plain (H, W, 4) uint8 RGBA grids (see catalogue.py) and
plain Python data. The actual pixel *values* used to build a real transition are
derived elsewhere (scripts/anim/build-smile-transition.py, which is allowed to import
chromies-engine, exactly like scripts/anim/compile-face-regions.py) and handed to this
module as plain data.

Delta format
------------
A `Delta` is a list of (x, y, palette_index) triples, relative to a sprite's own
64x64 base grid (see scripts/anim/catalogue.py). `palette_index` indexes into a small
delta-local RGB color table (a plain list[tuple[int, int, int]]) -- NOT the on-chain
palette registry. This is intentionally the dumbest possible indexed-color scheme:
one byte each for x, y, and index. It exists purely to measure byte cost for this
prototype, not as a proposed final on-chain/off-chain encoding.

Deltas are keyed by mouth trait (e.g. "Neutral"), never by token ID -- the same delta
applies to every sprite whose base mouth trait matches, regardless of which token it
is.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

Pixel = tuple[int, int, int]  # (x, y, palette_index)
Delta = list[Pixel]
Palette = list[tuple[int, int, int]]  # index -> (r, g, b)

GRID = 64


def diff_to_delta(
    base_grid: np.ndarray,
    target_grid: np.ndarray,
    region_coords: Sequence[Sequence[int]],
) -> tuple[Delta, Palette]:
    """Build a Delta + local Palette from every pixel that differs between
    `base_grid` and `target_grid` (both (H, W, 4) uint8 RGBA, see catalogue.py),
    restricted to `region_coords` ([x, y] pairs). Every color in the returned
    palette is sampled directly from `target_grid` -- nothing is synthesized.

    Palette indices are assigned by sorting the distinct (r, g, b) colors actually
    observed, so the same set of colors always yields the same indices
    (deterministic, reproducible from the same two grids).
    """
    changed: list[tuple[int, int, tuple[int, int, int]]] = []
    for x, y in region_coords:
        base_px = tuple(int(v) for v in base_grid[y, x, :3])
        target_px = tuple(int(v) for v in target_grid[y, x, :3])
        base_a = int(base_grid[y, x, 3])
        target_a = int(target_grid[y, x, 3])
        if base_px != target_px or base_a != target_a:
            changed.append((x, y, target_px))

    distinct_colors = sorted({c for _, _, c in changed})
    palette: Palette = list(distinct_colors)
    color_to_index = {c: i for i, c in enumerate(palette)}

    delta: Delta = [(x, y, color_to_index[c]) for x, y, c in changed]
    delta.sort(key=lambda p: (p[1], p[0]))
    return delta, palette


def split_delta_into_steps(delta: Delta, n_steps: int) -> list[Delta]:
    """Partition `delta` into `n_steps` cumulative steps (step i contains all pixels
    from steps 1..i), ordered by (y, x) for a deterministic top-to-bottom,
    left-to-right reveal. Step `n_steps` is always the full delta (the target).

    This is a simple linear reveal -- a rule-derived default for pacing a
    placeholder transition, not authored art. See build-smile-transition.py.
    """
    if n_steps < 1:
        raise ValueError("n_steps must be >= 1")
    ordered = sorted(delta, key=lambda p: (p[1], p[0]))
    steps: list[Delta] = []
    for i in range(1, n_steps + 1):
        cut = round(len(ordered) * i / n_steps)
        steps.append(ordered[:cut])
    steps[-1] = list(ordered)  # exact target, no rounding drift
    return steps


def apply_delta(grid: np.ndarray, delta: Delta, palette: Palette) -> np.ndarray:
    """Return a new (H, W, 4) uint8 RGBA grid with `delta` painted on top of `grid`
    (opaque, alpha=255 at every touched pixel). Never mutates `grid`."""
    out = grid.copy()
    for x, y, idx in delta:
        r, g, b = palette[idx]
        out[y, x, 0] = r
        out[y, x, 1] = g
        out[y, x, 2] = b
        out[y, x, 3] = 255
    return out


def pack_delta(delta: Delta) -> bytes:
    """1 byte x, 1 byte y, 1 byte palette_index per pixel. Deliberately dumb --
    a byte-cost measurement for this prototype, not a final encoding. Raises if any
    value doesn't fit in a byte (x, y are already grid-bounded to 0..63; palette
    indices are bounded by len(palette), which for real deltas is a handful of
    colors)."""
    out = bytearray()
    for x, y, idx in delta:
        for name, val in (("x", x), ("y", y), ("palette_index", idx)):
            if not (0 <= val <= 255):
                raise ValueError(f"{name}={val} does not fit in a byte")
        out += bytes((x, y, idx))
    return bytes(out)


def unpack_delta(data: bytes) -> Delta:
    """Inverse of pack_delta -- provided for completeness/round-trip tests."""
    if len(data) % 3 != 0:
        raise ValueError(f"packed delta length {len(data)} is not a multiple of 3")
    return [(data[i], data[i + 1], data[i + 2]) for i in range(0, len(data), 3)]
