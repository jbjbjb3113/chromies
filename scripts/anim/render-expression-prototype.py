#!/usr/bin/env python3
"""Task 4: render the prototype neutral<->smile transition to MP4, plus a 4-up
keyframe contact sheet and a byte-cost report. Also runs the byte-identity
regression check for the existing scenes/single-blink.json scene (Task 3's
"don't break animate-scene.py" requirement).

Same ffmpeg invocation pattern as scripts/animate-scene.py / scripts/animate-chromie.py
(literal nearest-neighbor upscale via numpy repeat, then libx264/crf18/yuv420p/
sws_flags neighbor). Output resolution: 64 * 17 = 1088x1088.

Sourcing the base sprite: like scripts/animate-chromie.py (not
scripts/anim/catalogue.py's marketing catalogue -- art-pipeline/output/tokens/ is
empty in this checkout), this script gets its one real base token via
scripts/anim/_canonical_token_source.py, which decodes it directly out of
public/data/mint-data.json's committed pixelsHex/traitsHex -- no compositing, no
RNG, no chromies-engine compositor involved at all (see "Rework Prototype onto
Canonical Bytes + JS Compositor"). "Expression" (mouth trait) is read from data
via scripts/anim/_expression_swap_source.py's self-verified isolated-JS lookup,
never rerolled/guessed. scripts/anim/primitives.py and expression_deltas.py (the
actual frame-composition code) remain chromies-engine-free, as before.

Usage:
    python scripts/anim/render-expression-prototype.py
    python scripts/anim/render-expression-prototype.py --vocabulary-sizes 5 10 23
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_ROOT.parent
ANIM_ROOT = SCRIPTS_ROOT / "anim"
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

from anim._canonical_token_source import canonical_grid_for_token, load_mint_records  # noqa: E402
from anim._expression_swap_source import find_canonical_tokens_by_expression  # noqa: E402
from anim.primitives import PRIMITIVES  # noqa: E402
from anim.expression_deltas import pack_delta  # noqa: E402

TRANSITIONS_PATH = ANIM_ROOT / "expression-transitions.json"
FACE_REGIONS_PATH = ANIM_ROOT / "face-regions.json"
OUT_DIR = REPO_ROOT / "out" / "anim" / "expression-prototype"
SCENES_DIR = REPO_ROOT / "scenes"

GRID = 64
SCALE = 17  # 64 * 17 = 1088
FPS = 9  # within the ~8-10fps step-through spec; hold segments are whole seconds at this rate
HOLD_FRAMES = FPS  # ~1s hold at neutral and at smile
STEP_FRAMES = 1  # each intermediate step shown for exactly one frame at FPS


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def nn_upscale(rgb: np.ndarray, scale: int) -> np.ndarray:
    return np.repeat(np.repeat(rgb, scale, axis=0), scale, axis=1)


def save_rgb_png(rgb: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb, mode="RGB").save(path)


def resolve_base_token(base_trait: str, token_id: int | None, scan_limit: int) -> tuple[int, np.ndarray]:
    """Return (token_id, base_grid) for a token whose real "expression" render-pick
    is `base_trait` (self-verified against public/data/mint-data.json -- see
    scripts/anim/_expression_swap_source.py). If `token_id` is given, that exact
    token is used (still routed through the same fidelity check, restricted to it)
    -- otherwise the first matching token up to `scan_limit` is used. The base grid
    itself is a pure canonical-byte decode (scripts/anim/_canonical_token_source.py),
    never a compositor re-render."""
    mint_records = load_mint_records()
    scan_ids = [token_id] if token_id is not None else list(range(1, scan_limit + 1))
    found, flags = find_canonical_tokens_by_expression(scan_ids, mint_records, want_traits={base_trait})
    if flags:
        print(f"[render-expression-prototype] scan flags ({len(flags)}):")
        for f in flags[:10]:
            print(f"  token {f['token_id']}: {f['reason']}")
    matched_token_id = found.get(base_trait)
    if matched_token_id is None:
        raise SystemExit(f"No token with real expression {base_trait!r} found (scan_limit={scan_limit}).")
    if token_id is not None and matched_token_id != token_id:
        raise SystemExit(
            f"--token-id {token_id} does not have real expression {base_trait!r} "
            f"(first matching token was {matched_token_id})."
        )
    return matched_token_id, canonical_grid_for_token(matched_token_id, mint_records)


def build_frames(base_grid: np.ndarray, transition: dict) -> tuple[list[np.ndarray], dict]:
    params = {
        "steps": transition["steps"],
        "palette": transition["palette"],
        "hold_frames": HOLD_FRAMES,
        "step_frames": STEP_FRAMES,
    }
    cycle = 2 * HOLD_FRAMES + 4 * STEP_FRAMES
    smile_fn = PRIMITIVES["smile"]

    frames: list[np.ndarray] = []
    for frame_index in range(cycle):
        grid = smile_fn(base_grid, frame_index, params)
        frames.append(grid)

    # Loop-cleanliness check, same convention as animate-scene.py / animate-chromie.py.
    next_grid = smile_fn(base_grid, cycle, params)
    loop_clean = bool(np.array_equal(frames[0], next_grid))

    # Keyframe indices: neutral hold, step1, step2, step3/target hold.
    keyframe_indices = {
        "neutral": 0,
        "step1": HOLD_FRAMES,
        "step2": HOLD_FRAMES + STEP_FRAMES,
        "smile": HOLD_FRAMES + 2 * STEP_FRAMES,
    }
    return frames, {"cycle": cycle, "loop_clean": loop_clean, "keyframe_indices": keyframe_indices}


def render_mp4(frames: list[np.ndarray], token_id: int) -> tuple[Path, int]:
    frames_dir = OUT_DIR / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for existing in frames_dir.glob("frame_*.png"):
        existing.unlink()

    digits = max(4, len(str(len(frames))))
    for i, grid in enumerate(frames):
        rgb = grid[:, :, :3].astype(np.uint8)
        upscaled = nn_upscale(rgb, SCALE)
        save_rgb_png(upscaled, frames_dir / f"frame_{i:0{digits}d}.png")

    mp4_path = OUT_DIR / f"chromie-{token_id}-expression-prototype.mp4"
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", str(frames_dir / f"frame_%0{digits}d.png"),
        "-c:v", "libx264",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-sws_flags", "neighbor",
        str(mp4_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("ffmpeg STDERR:\n" + result.stderr, file=sys.stderr)
        raise SystemExit(f"ffmpeg failed with exit code {result.returncode}")
    return mp4_path, mp4_path.stat().st_size


def build_contact_sheet(frames: list[np.ndarray], keyframe_indices: dict, token_id: int) -> Path:
    labels = ["neutral", "step1", "step2", "smile"]
    cell_scale = 8
    cell = GRID * cell_scale
    label_h = 20
    sheet = Image.new("RGB", (cell * len(labels), cell + label_h), (227, 229, 228))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default(size=14)
    except TypeError:
        font = ImageFont.load_default()

    for i, label in enumerate(labels):
        grid = frames[keyframe_indices[label]]
        rgb = grid[:, :, :3].astype(np.uint8)
        upscaled = nn_upscale(rgb, cell_scale)
        sheet.paste(Image.fromarray(upscaled, mode="RGB"), (i * cell, 0))
        draw.text((i * cell + 6, cell + 2), label, fill=(20, 20, 20), font=font)

    out_path = OUT_DIR / f"chromie-{token_id}-keyframes.png"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)
    return out_path


def print_byte_report(transition: dict, vocabulary_sizes: list[int], n_traits_options: list[int]) -> None:
    steps = transition["steps"]
    packed_sizes = [len(pack_delta([tuple(p) for p in step])) for step in steps]
    target_bytes = packed_sizes[-1]
    cumulative_stored_total = sum(packed_sizes)  # as actually stored: 3 independent cumulative deltas

    print()
    print("=== Byte report ===")
    print(f"Steps: {len(steps)} (step1, step2, step3/target)")
    for i, size in enumerate(packed_sizes, start=1):
        print(f"  step{i}: {len(steps[i - 1])} px -> {size} bytes (3 bytes/px: x, y, palette_index)")
    print(f"Target (full neutral->smile) delta: {target_bytes} bytes")
    print(
        f"Full neutral<->smile transition as stored (3 independent cumulative step deltas, "
        f"forward direction only): {cumulative_stored_total} bytes"
    )
    print(
        f"  (reverse leg reuses step1/step2/target -- no additional bytes; if steps were stored "
        f"incrementally instead of cumulatively, forward cost would collapse to just "
        f"{target_bytes} bytes, since step1/step2 are subsets of the target)"
    )

    print()
    print("Extrapolation: 4-expression vocabulary (e.g. neutral/smile/frown/surprised, i.e. 3 "
          "non-neutral targets each needing a target+2-intermediate-step transition like this one) "
          "across N mouth traits:")
    per_trait_bytes = 3 * cumulative_stored_total  # 3 non-neutral target expressions, each like this one
    for n in n_traits_options:
        print(f"  N={n:>3} mouth traits: {per_trait_bytes} bytes/trait * {n} = {per_trait_bytes * n} bytes total")
    print(
        "  (this assumes every one of the 3 non-neutral expressions costs roughly the same as the "
        "single measured neutral->smile transition above -- a rough extrapolation for this "
        "prototype, not a per-expression measurement)"
    )


def run_byte_identity_check() -> None:
    """Verify scripts/animate-scene.py --scene scenes/single-blink.json still renders
    byte-identical frames with primitives.py's smile addition present, by diffing
    against a render using the git HEAD (pre-this-change) copy of primitives.py."""
    print()
    print("=== Byte-identity regression check (scenes/single-blink.json) ===")
    primitives_path = ANIM_ROOT / "primitives.py"

    head_content_proc = subprocess.run(
        ["git", "show", "HEAD:scripts/anim/primitives.py"],
        cwd=REPO_ROOT, capture_output=True, text=True,
    )
    if head_content_proc.returncode != 0:
        print(f"  SKIPPED: could not read HEAD:scripts/anim/primitives.py ({head_content_proc.stderr.strip()})")
        return

    current_content = primitives_path.read_text(encoding="utf-8")
    head_content = head_content_proc.stdout

    def render_and_hash(label: str) -> str:
        scene_out = REPO_ROOT / "out" / "anim" / "scenes" / "single-blink"
        if scene_out.exists():
            shutil.rmtree(scene_out)
        proc = subprocess.run(
            [sys.executable, str(REPO_ROOT / "scripts" / "animate-scene.py"), "--scene", str(SCENES_DIR / "single-blink.json")],
            cwd=REPO_ROOT, capture_output=True, text=True,
        )
        if proc.returncode != 0:
            raise SystemExit(f"animate-scene.py failed ({label}):\n{proc.stderr}")
        frame_hashes = []
        for frame_path in sorted((scene_out / "frames").glob("frame_*.png")):
            frame_hashes.append(hashlib.sha256(frame_path.read_bytes()).hexdigest())
        combined = hashlib.sha256("".join(frame_hashes).encode()).hexdigest()
        print(f"  {label}: {len(frame_hashes)} frames, combined sha256={combined}")
        return combined

    try:
        if head_content == current_content:
            print("  primitives.py is unchanged vs HEAD -- nothing to compare (smile addition already committed?)")
            after_hash = render_and_hash("current (with smile primitive)")
            print(f"  current render hash: {after_hash}")
            return

        primitives_path.write_text(head_content, encoding="utf-8")
        before_hash = render_and_hash("HEAD (before smile primitive)")
    finally:
        primitives_path.write_text(current_content, encoding="utf-8")

    after_hash = render_and_hash("current (with smile primitive)")

    if before_hash == after_hash:
        print("  PASS: frame-for-frame SHA256-identical before/after adding the smile primitive.")
    else:
        print("  FAIL: frame hashes differ -- the smile primitive addition changed existing scene output!")
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-trait", default=None, help="Defaults to expression-transitions.json's base trait.")
    parser.add_argument("--token-id", type=int, default=None)
    parser.add_argument("--scan-limit", type=int, default=200)
    parser.add_argument("--vocabulary-sizes", type=int, nargs="+", default=[5, 10, 23])
    parser.add_argument("--skip-byte-identity-check", action="store_true")
    args = parser.parse_args()

    if not TRANSITIONS_PATH.exists():
        raise SystemExit(f"{TRANSITIONS_PATH} not found -- run scripts/anim/build-smile-transition.py first.")
    transitions = load_json(TRANSITIONS_PATH)
    base_trait = args.base_trait or transitions["_meta"]["base_trait"]
    transition = transitions[base_trait]

    token_id, base_grid = resolve_base_token(base_trait, args.token_id, args.scan_limit)
    print(f"Base token: {token_id} (mouth trait: {base_trait})")

    frames, meta = build_frames(base_grid, transition)
    print(f"Frames: {meta['cycle']} @ {FPS}fps ({meta['cycle'] / FPS:.2f}s), scale={SCALE}x -> {GRID*SCALE}x{GRID*SCALE}")
    print(f"Loop-clean (frame 0 == frame after last): {meta['loop_clean']}")

    mp4_path, mp4_size = render_mp4(frames, token_id)
    print(f"MP4: {mp4_path} ({mp4_size} bytes)")

    contact_sheet_path = build_contact_sheet(frames, meta["keyframe_indices"], token_id)
    print(f"Keyframe contact sheet: {contact_sheet_path}")

    if not FACE_REGIONS_PATH.exists():
        print(f"NOTE: {FACE_REGIONS_PATH} not found -- run compile-face-regions.py for the face-region deliverables.")

    print_byte_report(transition, args.vocabulary_sizes, args.vocabulary_sizes)

    if not args.skip_byte_identity_check:
        run_byte_identity_check()


if __name__ == "__main__":
    main()
