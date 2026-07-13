#!/usr/bin/env python3
"""Pixel-exact single-Chromie animation tool.

Renders a hard-pixel, nearest-neighbor-only idle-bob + blink animation loop
for one token, or (inspect mode) a coordinate-labeled reference sheet used
to read off eye/skin pixel coordinates by eye.

Source data: the canonical generated-dataset payload for a token
(pixelsHex = 4bpp-packed 64x64 index grid, traitsHex = trait bytes incl.
palette id). Unpacking pixelsHex and resolving traitsHex -> palette colors
is NOT re-implemented here -- both are imported from the existing Python
parity harness code in chromies-engine/engine/mint_payload.py and
chromies-engine/engine/palette_registry_data.py (the same functions the
renderer parity harness uses to verify on-chain output).

Usage:
    python scripts/animate-chromie.py inspect --token 1
    python scripts/animate-chromie.py render --token 1 \
        --eyes "20,28 34,28" --skin "10,30" --bob-split 46 \
        [--fps 12 --seconds 6 --scale 17] [--dataset PATH]

No AI upscaling, no interpolation, no anti-aliasing anywhere: every resize
in this script is done by literal pixel-block replication (numpy repeat),
never PIL/ffmpeg smoothing filters.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parents[1]
ENGINE_ROOT = REPO_ROOT / "chromies-engine"
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

# Imported, not re-implemented: same pixelsHex unpack + traitsHex/palette
# resolution the renderer parity harness (chromies-engine/scripts/parity_harness.py)
# uses to verify on-chain output.
from engine.mint_payload import (  # noqa: E402
    TRAITS_BYTES,
    decode_traits,
    from_hex,
    unpack_pixels_hex,
)
from engine.palette_registry_data import palette_colors_on_chain  # noqa: E402

GRID = 64
BG_HEX = "#e3e5e4"  # renderer-level constant; never lives in payload data (index 0 = bg)
DEFAULT_DATASET = REPO_ROOT / "art-pipeline" / "output" / "mint-data.json"
OUT_ROOT = REPO_ROOT / "out" / "anim"

DEFAULT_LOOP_FRAMES = 72  # the 72-frame loop the blink windows below are defined against
BLINK_STARTS = (30, 60)
BLINK_LEN = 3  # frames 30-32 and 60-62 inclusive


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def parse_coord(token: str) -> tuple[int, int]:
    x_str, y_str = token.split(",")
    return int(x_str), int(y_str)


def parse_coord_list(value: str) -> list[tuple[int, int]]:
    return [parse_coord(tok) for tok in value.split()]


def load_dataset(path: Path) -> dict[int, dict]:
    if not path.exists():
        raise SystemExit(f"Dataset not found: {path}")
    records = json.loads(path.read_text(encoding="utf-8"))
    return {int(r["tokenId"]): r for r in records}


def load_token_grid(token_id: int, dataset_path: Path) -> tuple[np.ndarray, list[str], int]:
    """Return (64x64 uint8 index grid, ordered palette hex colors, palette_id) for a token."""
    records = load_dataset(dataset_path)
    record = records.get(token_id)
    if record is None:
        raise SystemExit(f"Token {token_id} not found in {dataset_path}")

    flat = unpack_pixels_hex(record["pixelsHex"])  # imported: engine.mint_payload
    if flat.size != GRID * GRID:
        raise SystemExit(f"Token {token_id}: unpacked {flat.size} pixels, expected {GRID * GRID}")
    grid = flat.reshape(GRID, GRID)

    traits_bytes = from_hex(record["traitsHex"])
    if len(traits_bytes) != TRAITS_BYTES:
        raise SystemExit(
            f"Token {token_id}: traitsHex is {len(traits_bytes)} bytes, expected {TRAITS_BYTES}"
        )
    decoded = decode_traits(traits_bytes)  # imported: engine.mint_payload
    palette_id = decoded.palette_id
    palette_colors = palette_colors_on_chain(palette_id)  # imported: engine.palette_registry_data
    return grid, palette_colors, palette_id


def render_sprite_rgb(grid: np.ndarray, palette_colors: list[str]) -> np.ndarray:
    """64x64 index grid -> 64x64x3 uint8 RGB array. Index 0 = background fill."""
    bg_rgb = hex_to_rgb(BG_HEX)
    lut = np.zeros((16, 3), dtype=np.uint8)
    for idx in range(16):
        if idx == 0:
            lut[idx] = bg_rgb
        elif idx < len(palette_colors):
            lut[idx] = hex_to_rgb(palette_colors[idx])
        else:
            lut[idx] = bg_rgb
    return lut[grid]


def nn_upscale(rgb: np.ndarray, scale: int) -> np.ndarray:
    """Literal nearest-neighbor upscale via block replication. No filters, no smoothing."""
    return np.repeat(np.repeat(rgb, scale, axis=0), scale, axis=1)


def save_rgb_png(rgb: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb, mode="RGB").save(path)


# ---------------------------------------------------------------------------
# MODE 1: inspect
# ---------------------------------------------------------------------------

INSPECT_SCALE = 12


def _load_label_font() -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=14)
    except TypeError:
        return ImageFont.load_default()


def run_inspect(token_id: int, dataset_path: Path) -> None:
    grid, palette_colors, palette_id = load_token_grid(token_id, dataset_path)
    sprite_rgb = render_sprite_rgb(grid, palette_colors)
    upscaled = nn_upscale(sprite_rgb, INSPECT_SCALE)

    img = Image.fromarray(upscaled, mode="RGB").convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    gridline_color = (0, 0, 0, 60)
    label_color = (10, 10, 10, 255)
    font = _load_label_font()

    w, h = img.size
    for gx in range(GRID + 1):
        px = gx * INSPECT_SCALE
        draw.line([(px, 0), (px, h)], fill=gridline_color, width=1)
    for gy in range(GRID + 1):
        py = gy * INSPECT_SCALE
        draw.line([(0, py), (w, py)], fill=gridline_color, width=1)

    for gx in range(0, GRID + 1, 8):
        px = gx * INSPECT_SCALE
        draw.text((px + 2, 2), str(gx), fill=label_color, font=font)
    for gy in range(0, GRID + 1, 8):
        py = gy * INSPECT_SCALE
        draw.text((2, py + 2), str(gy), fill=label_color, font=font)

    composited = Image.alpha_composite(img, overlay).convert("RGB")
    out_path = OUT_ROOT / f"{token_id}-coords.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    composited.save(out_path)

    print(f"Token {token_id}: palette_id={palette_id} ({palette_colors[0] if palette_colors else '?'} bg)")
    print(f"Inspect PNG: {out_path}")
    print()
    print("Distinct colors (first occurrence, x,y in native 64x64 grid space):")
    seen: dict[int, tuple[int, int]] = {}
    for y in range(GRID):
        for x in range(GRID):
            idx = int(grid[y, x])
            if idx not in seen:
                seen[idx] = (x, y)
    for idx in sorted(seen):
        x, y = seen[idx]
        color = BG_HEX if idx == 0 else (palette_colors[idx] if idx < len(palette_colors) else "?")
        tag = " (background)" if idx == 0 else ""
        print(f"  index {idx:2d}  {color}  first at ({x},{y}){tag}")


# ---------------------------------------------------------------------------
# MODE 2: render
# ---------------------------------------------------------------------------


def compute_blink_frames(total_frames: int) -> set[int]:
    scale = total_frames / DEFAULT_LOOP_FRAMES
    blink_len = max(1, round(BLINK_LEN * scale))
    frames: set[int] = set()
    for start in BLINK_STARTS:
        s = round(start * scale)
        for i in range(blink_len):
            f = s + i
            if 0 <= f < total_frames:
                frames.add(f)
    return frames


def is_bob_frame(frame: int) -> bool:
    return (frame // 12) % 2 == 1


def squash_shift_grid(base_grid: np.ndarray, bob_split: int) -> np.ndarray:
    """Squash bob: rows ABOVE bob_split shift down 1px (row y -> y+1); the
    shifted region's bottom row overwrites the original content at
    bob_split; row 0 becomes background. Rows at/below bob_split never move.
    """
    shifted = base_grid.copy()
    if bob_split > 0:
        shifted[1 : bob_split + 1, :] = base_grid[0:bob_split, :]
    shifted[0, :] = 0
    return shifted


def build_frame_grid(
    base_grid: np.ndarray,
    bob_split: int,
    bob: bool,
    blinking: bool,
    eyes: list[tuple[int, int]],
    skin: tuple[int, int],
) -> np.ndarray:
    frame_grid = squash_shift_grid(base_grid, bob_split) if bob else base_grid
    if not blinking:
        return frame_grid
    # Blink coords are given in unshifted space; on bob frames the shifted
    # region (rows above bob_split) has already moved down 1px, so the same
    # +1 y offset is applied here to keep the blink locked to the eyes.
    offset = 1 if bob else 0
    frame_grid = frame_grid.copy()
    skin_x, skin_y = skin
    skin_idx = int(frame_grid[skin_y + offset, skin_x])
    for ex, ey in eyes:
        frame_grid[ey + offset, ex] = skin_idx
    return frame_grid


def run_render(
    token_id: int,
    dataset_path: Path,
    eyes: list[tuple[int, int]],
    skin: tuple[int, int],
    bob_split: int,
    fps: int,
    seconds: float,
    scale: int,
) -> None:
    grid, palette_colors, palette_id = load_token_grid(token_id, dataset_path)
    skin_x, skin_y = skin
    ref_skin_idx = int(grid[skin_y, skin_x])  # for reporting only; per-frame lookup is offset-aware

    total_frames = int(round(fps * seconds))
    if total_frames <= 0:
        raise SystemExit("fps * seconds must produce at least 1 frame")
    blink_frames = compute_blink_frames(total_frames)

    token_dir = OUT_ROOT / str(token_id)
    frames_dir = token_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for existing in frames_dir.glob("frame_*.png"):
        existing.unlink()

    digits = max(4, len(str(total_frames)))
    rendered: list[np.ndarray] = []
    for frame in range(total_frames):
        blinking = frame in blink_frames
        bob = is_bob_frame(frame)
        frame_grid = build_frame_grid(grid, bob_split, bob, blinking, eyes, skin)
        canvas = render_sprite_rgb(frame_grid, palette_colors)
        rendered.append(canvas)
        upscaled = nn_upscale(canvas, scale)
        frame_path = frames_dir / f"frame_{frame:0{digits}d}.png"
        save_rgb_png(upscaled, frame_path)

    # Loop-cleanliness check: does the state implied at frame `total_frames`
    # (same bob/blink formulas, one step past the last rendered frame, wrapped
    # back to the start of the pattern) match frame 0 exactly?
    next_frame_is_blinking = _frame_in_blink_pattern(total_frames, total_frames, blink_frames)
    next_bob = is_bob_frame(total_frames)
    next_grid = build_frame_grid(grid, bob_split, next_bob, next_frame_is_blinking, eyes, skin)
    next_canvas = render_sprite_rgb(next_grid, palette_colors)
    loop_clean = bool(np.array_equal(rendered[0], next_canvas))

    mp4_path = token_dir / f"chromie-{token_id}-idle.mp4"
    cmd = [
        "ffmpeg",
        "-y",
        "-framerate",
        str(fps),
        "-i",
        str(frames_dir / f"frame_%0{digits}d.png"),
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-sws_flags",
        "neighbor",
        str(mp4_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("ffmpeg STDERR:\n" + result.stderr, file=sys.stderr)
        raise SystemExit(f"ffmpeg failed with exit code {result.returncode}")

    print(f"Token {token_id}: palette_id={palette_id}, skin_idx={ref_skin_idx} at {skin}, bob_split={bob_split}")
    print(f"Frames: {total_frames} ({fps} fps, {seconds}s), scale={scale}x -> {GRID * scale}x{GRID * scale}")
    print(f"Blink frames: {sorted(blink_frames)}")
    print(f"Frames dir: {frames_dir}")
    print(f"MP4: {mp4_path}")
    print(f"Loop-clean (frame 0 == frame after last): {loop_clean}")

    still0_path = token_dir / f"chromie-{token_id}-frame0.png"
    save_rgb_png(nn_upscale(rendered[0], scale), still0_path)
    print(f"Still, frame 0: {still0_path}")

    blink_list = sorted(blink_frames)
    if blink_list:
        blink_frame_idx = blink_list[0]
        still_blink_path = token_dir / f"chromie-{token_id}-blink.png"
        save_rgb_png(nn_upscale(rendered[blink_frame_idx], scale), still_blink_path)
        print(f"Still, blink frame ({blink_frame_idx}): {still_blink_path}")


def _frame_in_blink_pattern(frame: int, total_frames: int, blink_frames: set[int]) -> bool:
    """Whether `frame`, taken mod total_frames, falls in the blink pattern."""
    return (frame % total_frames) in blink_frames


# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)

    p_inspect = sub.add_parser("inspect", help="Render a coordinate-labeled reference sheet.")
    p_inspect.add_argument("--token", type=int, required=True)
    p_inspect.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)

    p_render = sub.add_parser("render", help="Render the idle-bob + blink animation loop.")
    p_render.add_argument("--token", type=int, required=True)
    p_render.add_argument("--eyes", type=str, required=True, help='e.g. "20,28 34,28"')
    p_render.add_argument("--skin", type=str, required=True, help='e.g. "10,30"')
    p_render.add_argument(
        "--bob-split",
        type=int,
        required=True,
        help="0-indexed y row: rows above this shift down 1px on bob frames; this row and below never move.",
    )
    p_render.add_argument("--fps", type=int, default=12)
    p_render.add_argument("--seconds", type=float, default=6)
    p_render.add_argument("--scale", type=int, default=17)
    p_render.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)

    args = parser.parse_args()

    if args.mode == "inspect":
        run_inspect(args.token, args.dataset)
    elif args.mode == "render":
        eyes = parse_coord_list(args.eyes)
        skin = parse_coord(args.skin)
        run_render(
            args.token, args.dataset, eyes, skin, args.bob_split, args.fps, args.seconds, args.scale
        )


if __name__ == "__main__":
    main()
