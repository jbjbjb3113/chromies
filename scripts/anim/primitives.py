"""Pure per-frame primitive transforms for the scene animation renderer.

Each primitive is a function `(grid, frame_index, params) -> grid`, where
`grid` is an (H, W, 4) uint8 RGBA array in native (unscaled) sprite pixel
space (alpha=0 means transparent / background, alpha=255 opaque -- see
scripts/anim/catalogue.py). Primitives never mutate their input; they
always return a new array.

Composition: the renderer applies a sprite's `anims` list in order, each
primitive receiving the output of the previous one. There is no shared
state between primitives -- if you want a paint-style primitive (e.g.
`blink`) to move together with a movement-style primitive (e.g. `bob`),
list the paint primitive *before* the movement primitive in `anims`, so
its output pixels get carried along by the shift. This is exactly how
scenes/single-blink.json reproduces the old script's blink-tracks-the-bob
behavior with zero coordinate-offset math in either primitive.

Adding a new primitive (e.g. `wave`, `head-turn`) means writing one more
`(grid, frame_index, params) -> grid` function and adding it to PRIMITIVES
below -- the renderer and scene-config format never need to change.
"""

from __future__ import annotations

from typing import Callable

import numpy as np

from .expression_deltas import apply_delta


def bob(grid: np.ndarray, frame_index: int, params: dict) -> np.ndarray:
    """Shift rows above `bob_split` down 1px on "bob" frames.

    A frame is a bob frame when ((frame_index + phase) // half_period) % 2 == 1.

    params:
      phase (int, default 0)
      half_period (int, default 12) -- frames each bob state holds
      bob_split (int, default H-1, i.e. the whole sprite) -- 0-indexed row;
        rows ABOVE this shift down 1px (row y -> y+1, so the shifted
        region's bottom row overwrites the original content at bob_split);
        rows at/below bob_split never move. Row 0 becomes fully transparent.
        Leaving this unset shifts the entire sprite (its bottom row is
        clipped off-canvas), matching the plain "shift sprite down 1px"
        primitive spec; pass an explicit bob_split for a squash-style
        partial-body bob (e.g. head-only).
    """
    phase = int(params.get("phase", 0))
    half_period = int(params.get("half_period", 12))
    h = grid.shape[0]
    bob_split = int(params.get("bob_split", h - 1))
    bob_split = max(0, min(bob_split, h - 1))

    is_bob_frame = ((frame_index + phase) // half_period) % 2 == 1
    if not is_bob_frame or bob_split == 0:
        return grid.copy()

    shifted = grid.copy()
    shifted[1 : bob_split + 1, :, :] = grid[0:bob_split, :, :]
    shifted[0, :, :] = 0  # transparent -- let whatever is behind show through
    return shifted


def blink(grid: np.ndarray, frame_index: int, params: dict) -> np.ndarray:
    """Paint `eyes` coordinates with the color sampled at `skin` during blink windows.

    A frame is a blink frame when frame_index >= phase and
    (frame_index - phase) % interval_frames < duration_frames.

    params:
      eyes ([[x, y], ...], required)
      skin ([x, y], required)
      phase (int, default 0)
      interval_frames (int, required) -- frames between the start of one
        blink window and the next
      duration_frames (int, required) -- how many consecutive frames each
        blink window lasts
    """
    phase = int(params.get("phase", 0))
    interval_frames = int(params["interval_frames"])
    duration_frames = int(params["duration_frames"])

    is_blink_frame = frame_index >= phase and (frame_index - phase) % interval_frames < duration_frames
    if not is_blink_frame:
        return grid.copy()

    out = grid.copy()
    skin_x, skin_y = params["skin"]
    color = out[skin_y, skin_x].copy()
    for ex, ey in params["eyes"]:
        out[ey, ex] = color
    return out


def smile(grid: np.ndarray, frame_index: int, params: dict) -> np.ndarray:
    """Stepped mouth-trait delta-overlay transition: hold neutral -> step1 -> step2
    -> step3 (smile/target) -> hold smile -> step2 -> step1 -> (loops back to
    neutral hold). Loopable by construction (same state at frame 0 and at the end
    of one full cycle).

    Paints scripts/anim/expression_deltas.py delta-overlay steps on top of the
    sprite's own baked-in mouth pixels for the affected coordinates only; leaves
    every other pixel untouched. See scripts/anim/build-smile-transition.py for how
    `steps`/`palette` are derived (real compositor pixel diffs, not hand-drawn).

    params:
      steps ([[[x, y, palette_index], ...], step1/step2/step3] -- exactly 3
        cumulative delta lists, required; step3 is the full target delta.
      palette ([[r, g, b], ...], required) -- palette_index lookup table for `steps`.
      phase (int, default 0)
      hold_frames (int, default 12) -- frames held at the neutral end and at the
        smile (step3/target) end of the cycle.
      step_frames (int, default 2) -- frames held at each intermediate step
        (step1, step2), forward and reverse.
    """
    phase = int(params.get("phase", 0))
    hold_frames = int(params.get("hold_frames", 12))
    step_frames = int(params.get("step_frames", 2))

    steps_raw = params["steps"]
    if len(steps_raw) != 3:
        raise ValueError("smile primitive requires exactly 3 steps (step1, step2, step3/target)")
    steps = [[tuple(p) for p in step] for step in steps_raw]
    palette = [tuple(c) for c in params["palette"]]

    cycle = 2 * hold_frames + 4 * step_frames
    t = (frame_index + phase) % cycle

    if t < hold_frames:
        delta = None  # neutral hold
    elif t < hold_frames + step_frames:
        delta = steps[0]
    elif t < hold_frames + 2 * step_frames:
        delta = steps[1]
    elif t < hold_frames + 2 * step_frames + hold_frames:
        delta = steps[2]  # smile hold (target)
    elif t < hold_frames + 2 * step_frames + hold_frames + step_frames:
        delta = steps[1]  # reverse
    else:
        delta = steps[0]  # reverse

    if delta is None:
        return grid.copy()
    return apply_delta(grid, delta, palette)


PRIMITIVES: dict[str, Callable[[np.ndarray, int, dict], np.ndarray]] = {
    "bob": bob,
    "blink": blink,
    "smile": smile,
}
