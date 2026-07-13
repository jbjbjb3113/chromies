#!/usr/bin/env python3
"""Pixel-exact scene-based Chromie animation renderer.

Marketing tooling only -- deliberately outside the canonical mint/render
pipeline. This script and everything it imports (scripts/anim/) never
imports chromies-engine, trait-byte-registry, or any compiled palette/trait
artifact, and never writes anywhere near art-pipeline/output or payload/
trait data. Sprite grids come from the existing banner-work catalogue of
pre-rasterized 64x64 PNGs (art-pipeline/output/tokens/<id>.png) -- see
scripts/anim/catalogue.py for exactly why that PNG (not its sibling SVG) is
the source of truth here.

Pixel-exact throughout: nearest-neighbor only, no interpolation, no
anti-aliasing anywhere -- every resize is literal pixel-block replication
(numpy repeat), and every primitive transform is exact pixel indexing/copy.

scripts/animate-chromie.py (single-character, mint-payload-sourced) is left
untouched as the working single-character reference; this script is its
generalization to multi-sprite, config-driven scenes.

Scene config (JSON): see scenes/example.json for the full shape, or
scenes/single-blink.json for a proven, working single-sprite scene.

Usage:
    python scripts/animate-scene.py --scene scenes/single-blink.json
    python scripts/animate-scene.py --scene scenes/example.json \
        --tokens-dir art-pipeline/output/tokens
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPTS_ROOT = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_ROOT.parent
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

from anim.catalogue import load_sprite_rgba  # noqa: E402
from anim.primitives import PRIMITIVES  # noqa: E402

DEFAULT_TOKENS_DIR = REPO_ROOT / "art-pipeline" / "output" / "tokens"
OUT_ROOT = REPO_ROOT / "out" / "anim" / "scenes"
DEFAULT_BACKGROUND = "#e3e5e4"
DEFAULT_FPS = 12
DEFAULT_SECONDS = 6
DEFAULT_SCALE = 17


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def load_scene(path: Path) -> dict:
    scene = json.loads(path.read_text(encoding="utf-8"))
    if "canvas" not in scene or "sprites" not in scene:
        raise SystemExit(f"{path}: scene config must have 'canvas' and 'sprites'")
    return scene


def nn_upscale(rgb: np.ndarray, scale: int) -> np.ndarray:
    """Literal nearest-neighbor upscale via block replication. No filters, no smoothing."""
    return np.repeat(np.repeat(rgb, scale, axis=0), scale, axis=1)


def composite_frame(scene: dict, base_grids: list[np.ndarray], frame_index: int) -> np.ndarray:
    """Render one (H, W, 3) RGB canvas for `frame_index`.

    Sprites composite in list order -- later entries in scene["sprites"]
    draw on top. `row` ("front"/"back") is an optional authoring hint only;
    it is not consulted here, so author z-order via list order directly.
    """
    width, height = scene["canvas"]
    bg_rgb = np.array(hex_to_rgb(scene.get("background", DEFAULT_BACKGROUND)), dtype=np.uint8)
    canvas = np.tile(bg_rgb, (height, width, 1)).astype(np.uint8)

    for sprite, base_grid in zip(scene["sprites"], base_grids):
        grid = base_grid
        for anim in sprite.get("anims", []):
            fn = PRIMITIVES.get(anim["type"])
            if fn is None:
                raise SystemExit(f"Unknown primitive type: {anim['type']!r} (known: {sorted(PRIMITIVES)})")
            grid = fn(grid, frame_index, anim)

        px, py = sprite.get("pos", [0, 0])
        sh, sw = grid.shape[0], grid.shape[1]
        # Clip sprite placement to canvas bounds (defensive; exact fit for
        # this pass's single 64x64 sprite on a 64x64 canvas).
        dst_x0, dst_y0 = max(px, 0), max(py, 0)
        dst_x1, dst_y1 = min(px + sw, width), min(py + sh, height)
        if dst_x0 >= dst_x1 or dst_y0 >= dst_y1:
            continue
        src_x0, src_y0 = dst_x0 - px, dst_y0 - py
        src_x1, src_y1 = src_x0 + (dst_x1 - dst_x0), src_y0 + (dst_y1 - dst_y0)

        src_rgb = grid[src_y0:src_y1, src_x0:src_x1, :3]
        src_alpha = grid[src_y0:src_y1, src_x0:src_x1, 3]
        mask = src_alpha > 0
        dst_region = canvas[dst_y0:dst_y1, dst_x0:dst_x1, :]
        dst_region[mask] = src_rgb[mask]
        canvas[dst_y0:dst_y1, dst_x0:dst_x1, :] = dst_region

    return canvas


def save_rgb_png(rgb: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb, mode="RGB").save(path)


def run_render(scene_path: Path, tokens_dir: Path) -> None:
    scene = load_scene(scene_path)
    width, height = scene["canvas"]
    fps = int(scene.get("fps", DEFAULT_FPS))
    seconds = float(scene.get("seconds", DEFAULT_SECONDS))
    scale = int(scene.get("scale", DEFAULT_SCALE))

    total_frames = int(round(fps * seconds))
    if total_frames <= 0:
        raise SystemExit("fps * seconds must produce at least 1 frame")

    out_w, out_h = width * scale, height * scale
    if out_w % 2 != 0 or out_h % 2 != 0:
        raise SystemExit(
            f"Output resolution {out_w}x{out_h} has an odd dimension -- H.264 requires even "
            f"width and height. Adjust canvas or scale."
        )

    base_grids = [load_sprite_rgba(sprite["token"], tokens_dir) for sprite in scene["sprites"]]

    scene_name = scene_path.stem
    scene_dir = OUT_ROOT / scene_name
    frames_dir = scene_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for existing in frames_dir.glob("frame_*.png"):
        existing.unlink()

    digits = max(4, len(str(total_frames)))
    rendered: list[np.ndarray] = []
    for frame in range(total_frames):
        canvas = composite_frame(scene, base_grids, frame)
        rendered.append(canvas)
        upscaled = nn_upscale(canvas, scale)
        frame_path = frames_dir / f"frame_{frame:0{digits}d}.png"
        save_rgb_png(upscaled, frame_path)

    # Loop-cleanliness check: does the state implied one frame past the
    # last rendered frame match frame 0 exactly? (All primitive formulas
    # here are periodic in frame_index, so this is a real test of whether
    # total_frames is a multiple of every primitive's period.)
    next_canvas = composite_frame(scene, base_grids, total_frames)
    loop_clean = bool(np.array_equal(rendered[0], next_canvas))

    mp4_path = OUT_ROOT / f"{scene_name}.mp4"
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

    mp4_size = mp4_path.stat().st_size
    print(f"Scene: {scene_name} ({len(scene['sprites'])} sprite(s))")
    print(f"Frames: {total_frames} ({fps} fps, {seconds}s), scale={scale}x -> {out_w}x{out_h}")
    print(f"Frames dir: {frames_dir}")
    print(f"Loop-clean (frame 0 == frame after last): {loop_clean}")
    print(f"MP4: {mp4_path}")
    print(f"MP4 resolution: {out_w}x{out_h}")
    print(f"MP4 duration: {seconds:.2f}s")
    print(f"MP4 size: {mp4_size} bytes")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scene", type=Path, required=True, help="Path to a scene JSON config.")
    parser.add_argument("--tokens-dir", type=Path, default=DEFAULT_TOKENS_DIR)
    args = parser.parse_args()
    run_render(args.scene, args.tokens_dir)


if __name__ == "__main__":
    main()
