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

import math
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


def _order_delta_by_adjacency(base_grid: np.ndarray, delta: Delta) -> Delta:
    """Order `delta`'s pixels by an adjacency-wave rank expanding outward from
    `base_grid`'s own drawn (non-transparent) pixels:

      - Rank 0: delta pixels 8-adjacent to any alpha!=0 pixel already present in
        `base_grid` (i.e. touching the sprite's real, existing art).
      - Rank i (i >= 1): delta pixels 8-adjacent to a rank-(i-1) delta pixel --
        each round only looks at the immediately preceding rank, which is
        equivalent to "adjacent to any already-ranked pixel" here, since any pixel
        adjacent to an *older* rank would already have been captured in an earlier
        round (every unranked pixel is re-checked every round).
      - Pixels the wave never reaches (not 8-adjacent to the base sprite or to any
        other delta pixel, directly or transitively) all share one final rank --
        "truly isolated", per split_delta_into_steps.

    Ties within a rank are broken deterministically by (Euclidean distance to the
    centroid of the full delta pixel set, then x, then y), so the same
    (base_grid, delta) pair always produces the same order.
    """
    coord_to_pixel = {(x, y): (x, y, idx) for x, y, idx in delta}
    delta_coords = set(coord_to_pixel)

    ys, xs = np.nonzero(base_grid[:, :, 3])
    base_occupied = set(zip(xs.tolist(), ys.tolist()))

    def neighbors8(x: int, y: int):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx or dy:
                    yield x + dx, y + dy

    rank: dict[tuple[int, int], int] = {}
    unranked = set(delta_coords)
    frontier = {c for c in unranked if any(n in base_occupied for n in neighbors8(*c))}
    current_rank = 0
    while frontier:
        for coord in frontier:
            rank[coord] = current_rank
        unranked -= frontier
        frontier = {c for c in unranked if any(n in frontier for n in neighbors8(*c))}
        current_rank += 1
    for coord in unranked:  # never reached by the wave -- all share the last rank
        rank[coord] = current_rank

    cx = sum(x for x, _ in delta_coords) / len(delta_coords)
    cy = sum(y for _, y in delta_coords) / len(delta_coords)

    def sort_key(coord: tuple[int, int]) -> tuple[int, float, int, int]:
        x, y = coord
        return (rank[coord], math.hypot(x - cx, y - cy), x, y)

    return [coord_to_pixel[c] for c in sorted(delta_coords, key=sort_key)]


def split_delta_into_steps(
    base_grid: np.ndarray,
    delta: Delta,
    steps: int | None = None,
) -> list[Delta]:
    """Partition `delta` into cumulative steps (step i contains all pixels from
    steps 1..i; the final step is always the full delta -- the target), ordered by
    an adjacency wave expanding outward from `base_grid`'s own drawn pixels rather
    than a fixed top-to-bottom scan -- see _order_delta_by_adjacency.

    Step count: if `steps` is None (the default), it's derived from delta size --
    `max(1, min(3, ceil(len(delta) / 3)))` -- so a delta of 3px or fewer collapses
    to a single-step swap (no intermediates), a 4px delta gets 2 steps, and larger
    deltas cap at 3. Pass an explicit integer `steps` to bypass this rule entirely.

    Isolated delta pixels (unreached by the adjacency wave -- see
    _order_delta_by_adjacency) rank last, so they appear only in the final forward
    step and, since a caller reversing this list replays it backward for the
    return leg, disappear first on the way back.

    Still a rule-derived reveal order, not authored art -- see
    build-smile-transition.py's placeholder-art flag.
    """
    if not delta:
        raise ValueError("cannot split an empty delta")

    n_steps = steps if steps is not None else max(1, min(3, math.ceil(len(delta) / 3)))
    if n_steps < 1:
        raise ValueError("steps must be >= 1")

    ordered = _order_delta_by_adjacency(base_grid, delta)

    result: list[Delta] = []
    for i in range(1, n_steps + 1):
        cut = round(len(ordered) * i / n_steps)
        result.append(ordered[:cut])
    result[-1] = list(ordered)  # exact target, no rounding drift
    return result


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
