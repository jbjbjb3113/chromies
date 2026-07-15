#!/usr/bin/env python3
"""Render a facial-rig verification contact sheet for JB review.

Picks 24 diverse tokens from facial-rigs.json, renders a 3-frame blink strip per
token (open / half-blink / closed) using rig data only, and assembles a labeled
grid PNG.

Usage:
    python scripts/rig/render-rig-proof.py [--rigs PATH] [--out PATH]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_ROOT.parent
RIG_ROOT = SCRIPTS_ROOT / "rig"
DEFAULT_RIGS_PATH = RIG_ROOT / "facial-rigs.json"
DEFAULT_OUT_PATH = REPO_ROOT / "out" / "rig" / "facial-rig-proof.png"

if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

from anim._canonical_token_source import canonical_grid_for_token, load_mint_records  # noqa: E402
from anim.primitives import blink  # noqa: E402

SCALE = 8
FRAME_W = GRID = 64
STRIP_FRAMES = 3
COLS = 4
ROWS = 6
LABEL_H = 22
PAD = 4


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def upscale(grid: np.ndarray) -> np.ndarray:
    return np.repeat(np.repeat(grid, SCALE, axis=0), SCALE, axis=1)


def half_blink_frame(grid: np.ndarray, eyes: list[list[int]], skin: list[int]) -> np.ndarray:
    """Paint the lower half of each eye pixel column with skin color."""
    if not eyes:
        return grid.copy()
    out = grid.copy()
    sx, sy = skin
    color = out[sy, sx].copy()
    by_eye: dict[tuple[int, int], list[int]] = {}
    for ex, ey in eyes:
        by_eye.setdefault((ex, ey), []).append(ey)
    for (ex, ey) in eyes:
        same_x = [c[1] for c in eyes if c[0] == ex]
        mid_y = (min(same_x) + max(same_x)) / 2.0
        if ey >= mid_y:
            out[ey, ex] = color
    return out


def closed_blink_frame(grid: np.ndarray, eyes: list[list[int]], skin: list[int]) -> np.ndarray:
    """Full blink — same as blink primitive at frame 0 of a blink window."""
    return blink(
        grid,
        0,
        {
            "eyes": eyes,
            "skin": skin,
            "phase": 0,
            "interval_frames": 30,
            "duration_frames": 3,
        },
    )


def pick_diverse_tokens(rigs_doc: dict) -> list[int]:
    """Select 24 tokens covering character types, eye variants, and edge cases."""
    rigs = rigs_doc["rigs"]
    mint_records = load_mint_records()
    selected: list[int] = []
    used: set[int] = set()

    def add(token_id: int) -> bool:
        if token_id in used:
            return False
        key = str(token_id)
        rig = rigs.get(key)
        if not rig or "eyes" not in rig:
            return False
        used.add(token_id)
        selected.append(token_id)
        return True

    def find_one(**want) -> int | None:
        for key, rig in sorted(rigs.items(), key=lambda kv: int(kv[0])):
            tid = int(key)
            if tid in used or "eyes" not in rig:
                continue
            if all(rig.get(k) == v for k, v in want.items()):
                return tid
        return None

    # One per character type (9)
    characters = [
        "HeroA_Male",
        "HeroA_Female",
        "Chubby_Male",
        "Alien",
        "Zombie",
        "Agent",
        "SideProfile_Male",
        "SideProfile_Female",
    ]
    for ch in characters:
        tid = find_one(character=ch)
        if tid:
            add(tid)

    # Eye-variant diversity
    for eyes_trait in (
        "Male_SquintLeft",
        "Male_SquintRight",
        "Chubby_Squint_Right",
        "Female_LookLeft",
        "SP_SquintLeft_Female",
        "Signal",
    ):
        tid = find_one(eyesTrait=eyes_trait)
        if tid:
            add(tid)

    # Glasses wearers
    for glasses in ("Chubby_DFrameFilled", "DFrameFilled", "Female_Neo", "SP_DFrame_Female"):
        tid = find_one(glassesTrait=glasses)
        if tid and tid not in used:
            add(tid)

    # eyes=None baked-in edge cases
    for ch in ("Zombie", "Agent", "SideProfile_Male"):
        tid = find_one(character=ch, eyesTrait="None")
        if tid and tid not in used:
            add(tid)

    # Fill to 24 from remaining distinct eye traits
    eye_traits_seen: set[str] = set()
    for tid in selected:
        eye_traits_seen.add(rigs[str(tid)]["eyesTrait"])

    for key, rig in sorted(rigs.items(), key=lambda kv: int(kv[0])):
        if len(selected) >= 24:
            break
        tid = int(key)
        if "eyes" not in rig or tid in used:
            continue
        et = rig["eyesTrait"]
        if et in eye_traits_seen:
            continue
        eye_traits_seen.add(et)
        add(tid)

    for key, rig in sorted(rigs.items(), key=lambda kv: int(kv[0])):
        if len(selected) >= 24:
            break
        tid = int(key)
        if "eyes" not in rig or tid in used:
            continue
        add(tid)

    if len(selected) < 24:
        raise SystemExit(f"could only pick {len(selected)} diverse tokens (wanted 24)")

    return selected[:24]


def render_strip(token_id: int, rig: dict, mint_records: dict) -> Image.Image:
    base = canonical_grid_for_token(token_id, mint_records)
    eyes = rig["eyes"]
    skin = rig["skinSample"]

    frames = [
        base.copy(),
        half_blink_frame(base, eyes, skin),
        closed_blink_frame(base, eyes, skin),
    ]

    strip_w = STRIP_FRAMES * FRAME_W * SCALE
    strip_h = FRAME_W * SCALE
    strip = Image.new("RGBA", (strip_w, strip_h), (0, 0, 0, 0))

    for i, frame in enumerate(frames):
        rgb = upscale(frame[:, :, :3].astype(np.uint8))
        img = Image.fromarray(rgb, mode="RGB")
        strip.paste(img, (i * FRAME_W * SCALE, 0))

    return strip


def label_font() -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=14)
    except TypeError:
        return ImageFont.load_default()


def main() -> None:
    parser = argparse.ArgumentParser(description="Render facial rig proof contact sheet.")
    parser.add_argument("--rigs", type=Path, default=DEFAULT_RIGS_PATH)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_PATH)
    args = parser.parse_args()

    rigs_doc = load_json(args.rigs)
    mint_records = load_mint_records()
    token_ids = pick_diverse_tokens(rigs_doc)
    rigs = rigs_doc["rigs"]

    strip_w = STRIP_FRAMES * FRAME_W * SCALE
    row_h = strip_h = FRAME_W * SCALE + LABEL_H
    sheet_w = COLS * (strip_w + PAD) + PAD
    sheet_h = ROWS * (row_h + PAD) + PAD

    sheet = Image.new("RGB", (sheet_w, sheet_h), (32, 32, 40))
    draw = ImageDraw.Draw(sheet)
    font = label_font()

    for idx, token_id in enumerate(token_ids):
        col = idx % COLS
        row = idx // COLS
        x0 = PAD + col * (strip_w + PAD)
        y0 = PAD + row * (row_h + PAD)

        rig = rigs[str(token_id)]
        strip = render_strip(token_id, rig, mint_records)
        sheet.paste(strip.convert("RGB"), (x0, y0))

        label = (
            f"#{token_id} {rig['character']} eyes={rig['eyesTrait']} "
            f"mouth={rig['mouthTrait']} ({len(rig['eyes'])} eye px)"
        )
        draw.text((x0, y0 + strip_h + 2), label, fill=(220, 220, 230), font=font)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out)
    print(f"wrote {args.out} ({len(token_ids)} tokens: {token_ids})")


if __name__ == "__main__":
    main()
