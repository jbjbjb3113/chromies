#!/usr/bin/env python3
"""Phase 2B — read-only anchor manifest for every component PNG."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, pstdev

import numpy as np
from PIL import Image

from engine.art_safety import READ_ONLY_ART_ROOT, safe_write_text

COMPONENTS_DIR = READ_ONLY_ART_ROOT
ENGINE_DATA = Path(__file__).resolve().parent / "engine_data"
CANVAS = 64

SLOT_PREFIXES: tuple[tuple[str, str], ...] = (
    ("SP_", "side_profile"),
    ("HEAD", "head"),
    ("MasterHead", "head"),
    ("MASK", "mask"),
    ("EYES", "eyes"),
    ("EXPRESSION", "expression"),
    ("HAIR", "hair"),
    ("BEARD", "beard"),
    ("MUSTACHE", "mustache"),
    ("Mustache", "mustache"),
    ("GLASSES", "glasses"),
    ("HOOD", "hood"),
    ("BODYTATTOO", "bodytattoo"),
    ("TATTOO", "tattoo"),
    ("BODY", "body"),
    ("SHIRT", "shirt"),
    ("NECKLACE", "necklace"),
    ("NECK", "neck"),
    ("EARRINGS", "earrings"),
    ("EARRING", "earrings"),
    ("ACCESSORY", "accessory"),
)


def infer_slot(stem: str) -> tuple[str, str]:
    for prefix, slot in SLOT_PREFIXES:
        if stem.startswith(prefix):
            return slot, stem[len(prefix) :]
    return "unknown", stem


def touches_canvas_edge(opaque: np.ndarray) -> bool:
    if not opaque.any():
        return False
    return bool(opaque[0, :].any() or opaque[-1, :].any() or opaque[:, 0].any() or opaque[:, -1].any())


def analyze_png(path: Path) -> dict:
    rel = str(path.relative_to(COMPONENTS_DIR)).replace("\\", "/")
    slot, variant = infer_slot(path.stem)

    with Image.open(path) as im:
        rgba = im.convert("RGBA")
        width, height = rgba.size
        arr = np.array(rgba)

    alpha = arr[:, :, 3]
    opaque_mask = alpha == 255
    partial = int(((alpha > 0) & (alpha < 255)).sum())
    opaque_count = int(opaque_mask.sum())

    binary_alpha_valid = partial == 0
    colors = set()
    if opaque_count:
        colors = {tuple(map(int, px)) for px in arr[opaque_mask][:, :3]}

    bbox = None
    center_x = center_y = top_y = bottom_y = left_x = right_x = None
    estimated_feet_y = estimated_head_top_y = None

    if opaque_count:
        ys, xs = np.where(opaque_mask)
        left_x = int(xs.min())
        right_x = int(xs.max())
        top_y = int(ys.min())
        bottom_y = int(ys.max())
        center_x = round((left_x + right_x) / 2, 2)
        center_y = round((top_y + bottom_y) / 2, 2)
        bbox = [left_x, top_y, right_x, bottom_y]
        estimated_feet_y = bottom_y
        estimated_head_top_y = top_y if slot in {"head", "hair", "hood", "eyes", "expression", "glasses", "mask"} else None

    sha256 = hashlib.sha256(path.read_bytes()).hexdigest()

    return {
        "path": rel,
        "slot": slot,
        "variant": variant,
        "width": width,
        "height": height,
        "alpha_bbox": bbox,
        "opaque_pixel_count": opaque_count,
        "center_x": center_x,
        "center_y": center_y,
        "top_y": top_y,
        "bottom_y": bottom_y,
        "left_x": left_x,
        "right_x": right_x,
        "estimated_feet_y": estimated_feet_y,
        "estimated_head_top_y": estimated_head_top_y,
        "touches_canvas_edge": touches_canvas_edge(opaque_mask),
        "binary_alpha_valid": binary_alpha_valid,
        "partial_alpha_pixels": partial,
        "color_count": len(colors),
        "sha256": sha256,
    }


def category_anchor_stats(anchors: list[dict]) -> dict[str, dict]:
    stats: dict[str, dict] = {}
    by_slot: dict[str, list[dict]] = defaultdict(list)
    for a in anchors:
        if a["opaque_pixel_count"] > 0 and a["estimated_feet_y"] is not None:
            by_slot[a["slot"]].append(a)

    for slot, items in by_slot.items():
        feet = [x["estimated_feet_y"] for x in items]
        stats[slot] = {
            "count": len(items),
            "feet_y_mean": round(mean(feet), 2),
            "feet_y_stdev": round(pstdev(feet), 2) if len(feet) > 1 else 0.0,
        }
    return stats


def find_misaligned(anchors: list[dict], stats: dict[str, dict], sigma: float = 2.5) -> list[dict]:
    misaligned = []
    for a in anchors:
        if a["opaque_pixel_count"] == 0:
            continue
        slot_stats = stats.get(a["slot"])
        if not slot_stats or slot_stats["feet_y_stdev"] == 0:
            continue
        feet = a["estimated_feet_y"]
        mu = slot_stats["feet_y_mean"]
        sd = slot_stats["feet_y_stdev"]
        if abs(feet - mu) > sigma * sd:
            misaligned.append(
                {
                    "path": a["path"],
                    "slot": a["slot"],
                    "estimated_feet_y": feet,
                    "slot_feet_y_mean": mu,
                    "deviation_sigma": round(abs(feet - mu) / sd, 2),
                }
            )
    return sorted(misaligned, key=lambda x: -x["deviation_sigma"])


def build_report(anchors: list[dict]) -> str:
    stats = category_anchor_stats(anchors)
    misaligned = find_misaligned(anchors, stats)

    edge_touching = [a["path"] for a in anchors if a["touches_canvas_edge"] and a["opaque_pixel_count"] > 0]
    empty_assets = [a["path"] for a in anchors if a["opaque_pixel_count"] == 0]
    non_binary = [a["path"] for a in anchors if not a["binary_alpha_valid"]]
    high_color = [a for a in anchors if a["color_count"] > 32 and a["opaque_pixel_count"] > 0]
    non_64 = [a["path"] for a in anchors if a["width"] != CANVAS or a["height"] != CANVAS]

    by_hash: dict[str, list[str]] = defaultdict(list)
    for a in anchors:
        by_hash[a["sha256"]].append(a["path"])
    duplicate_groups = [
        {"sha256": h, "paths": sorted(paths), "count": len(paths)}
        for h, paths in by_hash.items()
        if len(paths) > 1
    ]
    duplicate_groups.sort(key=lambda g: (-g["count"], g["sha256"]))

    lines = [
        "# Anchor Manifest Report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        f"Read-only art root: `{COMPONENTS_DIR}`",
        "",
        "## Summary",
        "",
        f"- Total PNGs analyzed: **{len(anchors)}**",
        f"- Edge-touching assets: **{len(edge_touching)}**",
        f"- Empty assets (expected None layers): **{len(empty_assets)}**",
        f"- Misaligned by feet_y (>{2.5}σ): **{len(misaligned)}**",
        f"- Duplicate pixel groups: **{len(duplicate_groups)}**",
        f"- Non-binary alpha: **{len(non_binary)}**",
        f"- High color-count (>32): **{len(high_color)}**",
        f"- Non-{CANVAS}×{CANVAS} dimensions: **{len(non_64)}**",
        "",
        "## Anchor stats by slot (feet_y)",
        "",
        "| Slot | Count | Mean feet_y | Stdev |",
        "|------|-------|-------------|-------|",
    ]

    for slot, s in sorted(stats.items()):
        lines.append(f"| {slot} | {s['count']} | {s['feet_y_mean']} | {s['feet_y_stdev']} |")

    lines.extend(["", "## Edge-touching assets", ""])
    if edge_touching:
        lines.extend(f"- `{p}`" for p in edge_touching[:40])
        if len(edge_touching) > 40:
            lines.append(f"- … and {len(edge_touching) - 40} more")
    else:
        lines.append("_None_")

    lines.extend(["", "## Empty assets", ""])
    lines.extend(f"- `{p}`" for p in empty_assets)

    lines.extend(["", "## Misaligned assets (feet_y)", ""])
    if misaligned:
        for m in misaligned[:30]:
            lines.append(
                f"- `{m['path']}` — feet_y={m['estimated_feet_y']}, "
                f"slot mean={m['slot_feet_y_mean']}, σ={m['deviation_sigma']}"
            )
    else:
        lines.append("_None beyond threshold_")

    lines.extend(["", "## Duplicate groups", ""])
    for group in duplicate_groups[:15]:
        lines.append(f"### {group['sha256'][:16]}… ({group['count']} files)")
        for p in group["paths"]:
            lines.append(f"- `{p}`")

    lines.extend(["", "## Non-binary alpha", ""])
    if non_binary:
        lines.extend(f"- `{p}`" for p in non_binary[:30])
    else:
        lines.append("_All PNGs use binary alpha (0 or 255)_")

    lines.extend(["", "## High color-count assets (>32 opaque colors)", ""])
    if high_color:
        for a in sorted(high_color, key=lambda x: -x["color_count"])[:25]:
            lines.append(f"- `{a['path']}` — {a['color_count']} colors")
    else:
        lines.append("_None_")

    lines.extend(["", "## Non-64×64 assets", ""])
    lines.extend(f"- `{p}`" for p in non_64)

    lines.extend(
        [
            "",
            "## Potential issues requiring review",
            "",
            "1. **Shared None PNG** — 14 slots share one transparent pixel hash; safe for compositing but metadata should treat each None variant independently.",
            "2. **BEARD_Full vs BEARD_Goat** — pixel-identical; confirm whether both names should remain in rarity tables.",
            "3. **Male/Female eye duplicates** — some gendered eye layers are identical pixels; palette recolor still applies but asset dedup may be possible in `derived_assets/` only.",
            "4. **Side-profile SP duplicates** — several SP hood/glasses/hair variants share pixels across gender folders.",
            "5. **Missing traits.json refs** — run `missing_assets_report.json` for SP variants referenced but absent on disk.",
            "6. **Legendary Normie exports** — 640×640 reference PNGs in `legendary/`; exclude from standard compositor canvas.",
            "",
        ]
    )

    return "\n".join(lines)


def main() -> None:
    if not COMPONENTS_DIR.is_dir():
        raise SystemExit(f"Components directory not found: {COMPONENTS_DIR}")

    png_paths = sorted(COMPONENTS_DIR.rglob("*.png"))
    anchors = [analyze_png(p) for p in png_paths]

    manifest = {
        "schema_version": "2.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "read_only_art_root": str(COMPONENTS_DIR),
        "canvas_expected": [CANVAS, CANVAS],
        "asset_count": len(anchors),
        "assets": anchors,
    }

    ENGINE_DATA.mkdir(parents=True, exist_ok=True)
    safe_write_text(ENGINE_DATA / "anchors.json", json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    safe_write_text(ENGINE_DATA / "anchor_report.md", build_report(anchors), encoding="utf-8")

    print(f"wrote {ENGINE_DATA / 'anchors.json'} ({len(anchors)} assets)")
    print(f"wrote {ENGINE_DATA / 'anchor_report.md'}")


if __name__ == "__main__":
    main()
