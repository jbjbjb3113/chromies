#!/usr/bin/env python3
"""
Build palette registry candidates, slot-diff inventory, and 1000-seed parity simulation.
Outputs PALETTE_REGISTRY_CANDIDATES.json; feeds PALETTE_REGISTRY_DESIGN.md + parity report.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine.art_schema_loader import load_art_schema_bundle
from engine.chromies_config_loader import load_chromies_config
from engine.config import REPORTS_DIR
from engine.mint_payload import ON_CHAIN_PALETTE_BYTES, build_mint_payload
from engine.on_chain_palette import normalize_hex_colors, palette_colors
from engine.payload_pipeline import build_payload_from_compositor
from engine.payload_render import render_role_buffer
from engine.compositor import generate_chromie

ART_PIPELINE = ROOT.parent / "art-pipeline"
CHROMIES_CONFIG = ART_PIPELINE / "chromies-config.js"
ROLES = [
    "background",
    "mask_dark",
    "mask_mid",
    "highlight",
    "skin_shadow_deep",
    "skin_shadow",
    "skin_mid",
    "skin_light",
    "skin_highlight",
    "shirt_torso",
    "eye_socket",
    "eye_glow",
    "eye_signal",
    "hair_dark",
    "hair_mid",
    "hair_bright",
]

BASE_FAMILIES = ("SIGNAL", "ACID", "CYAN", "GHOST", "BLOOD", "MOSS")
SHIRT_COLORS = ("RED", "PURPLE", "ORANGE", "OLIVE", "GREEN", "GOLD", "BLUE")

# Proposed ID allocation: append shirt palettes after current max (37).
SHIRT_PALETTE_ID_START = 38


def load_roles_and_palettes() -> tuple[list[str], dict]:
    cfg = load_chromies_config(CHROMIES_CONFIG)
    return cfg["roles"], cfg["palettes"]


def parent_base_for_shirt(name: str) -> str | None:
    if "_SHIRT_" not in name:
        return None
    return name.split("_SHIRT_")[0]


def slot_diffs(parent_colors: list[str], child_colors: list[str]) -> list[dict]:
    diffs = []
    for i, role in enumerate(ROLES):
        p = parent_colors[i].lower()
        c = child_colors[i].lower()
        if p != c:
            diffs.append(
                {
                    "role_index": i,
                    "role_name": role,
                    "parent_rgb": p,
                    "child_rgb": c,
                }
            )
    return diffs


def analyze_shirt_palettes(palettes: dict) -> list[dict]:
    entries = []
    for name in sorted(palettes):
        if "_SHIRT_" not in name:
            continue
        base = parent_base_for_shirt(name)
        if base not in palettes:
            continue
        parent = normalize_hex_colors(palettes[base]["colors"])
        child = normalize_hex_colors(palettes[name]["colors"])
        diffs = slot_diffs(parent, child)
        color_suffix = name.split("_SHIRT_")[1]
        entries.append(
            {
                "name": name,
                "parent_base": base,
                "shirt_color": color_suffix,
                "proposed_palette_id": None,  # filled below
                "slot_diffs": diffs,
                "diff_role_indices": [d["role_index"] for d in diffs],
                "only_hood_diff": diffs == [] or all(d["role_index"] == 9 for d in diffs),
                "encodable_today": name in ON_CHAIN_PALETTE_BYTES,
                "encoded_byte_today": ON_CHAIN_PALETTE_BYTES.get(name),
            }
        )

    # Deterministic ID assignment: family order × color order
    idx = 0
    for base in BASE_FAMILIES:
        for color in SHIRT_COLORS:
            key = f"{base}_SHIRT_{color}"
            for entry in entries:
                if entry["name"] == key:
                    entry["proposed_palette_id"] = SHIRT_PALETTE_ID_START + idx
                    idx += 1
    return entries


def analyze_normie_palettes(palettes: dict) -> list[dict]:
    rows = []
    for name, byte_val in sorted(ON_CHAIN_PALETTE_BYTES.items(), key=lambda x: x[1]):
        if not name.startswith("NORMIE_"):
            continue
        pipeline = normalize_hex_colors(palettes.get(name, {}).get("colors", []))
        on_chain_wrapped = normalize_hex_colors(palette_colors(byte_val))
        on_chain_explicit = pipeline  # post-registry: explicit table
        wrap_diffs = slot_diffs(on_chain_wrapped, pipeline) if pipeline else []
        rows.append(
            {
                "name": name,
                "on_chain_byte": byte_val,
                "wraparound_base_id": byte_val % 26,
                "wraparound_family": _BYTE_TO_NAME.get(byte_val % 26, f"id_{byte_val % 26}"),
                "pipeline_vs_wrapped_diff_count": len(wrap_diffs),
                "pipeline_vs_wrapped_diffs": wrap_diffs[:5],
                "requires_explicit_registry_entry": len(wrap_diffs) > 0,
            }
        )
    return rows


_BYTE_TO_NAME = {v: k for k, v in ON_CHAIN_PALETTE_BYTES.items() if k in BASE_FAMILIES}


def analyze_hair_variant_palettes(palettes: dict) -> list[dict]:
    """BLONDE/GREY/RED variants differ at indices 13-15 from base — documented for registry."""
    rows = []
    for base in BASE_FAMILIES:
        for suffix in ("BLONDE", "GREY", "RED"):
            name = f"{base}_{suffix}"
            if name not in palettes:
                continue
            parent = normalize_hex_colors(palettes[base]["colors"])
            child = normalize_hex_colors(palettes[name]["colors"])
            diffs = slot_diffs(parent, child)
            rows.append(
                {
                    "name": name,
                    "on_chain_byte": ON_CHAIN_PALETTE_BYTES.get(name),
                    "parent_base": base,
                    "slot_diffs": diffs,
                    "diff_role_indices": [d["role_index"] for d in diffs],
                    "hair_slot_only": all(d["role_index"] in (13, 14, 15) for d in diffs),
                }
            )
    return rows


def resolve_registry_colors(palette_key: str, palettes: dict) -> list[str]:
    """Simulated registry: pipeline palette table is canonical expanded form."""
    key = palette_key.upper()
    if key not in palettes:
        return palette_colors(0)
    return normalize_hex_colors(palettes[key]["colors"])


def simulate_payload_preview(compositor_result, palettes: dict) -> np.ndarray:
    schema = load_art_schema_bundle()
    built = build_payload_from_compositor(compositor_result, schema)
    colors = resolve_registry_colors(built.palette_key, palettes)
    role_buf = built.payload.unpack_role_buffer()
    return render_role_buffer(role_buf, colors, grid=schema.grid)


def count_rgba_diff(a: np.ndarray, b: np.ndarray) -> int:
    return int(np.sum(np.any(a != b, axis=-1)))


def run_1000_simulation(palettes: dict, *, seed_start: int = 1, count: int = 1000) -> dict:
    schema = load_art_schema_bundle()
    match = 0
    mismatch = 0
    by_palette: Counter[str] = Counter()
    mismatch_by_palette: Counter[str] = Counter()
    mismatch_by_category: Counter[str] = Counter()
    examples: list[dict] = []

    for i in range(count):
        seed = seed_start + i
        token_id = seed
        comp = generate_chromie(seed, token_id, schema=schema)
        compositor_img = comp.image_rgba
        sim_img = simulate_payload_preview(comp, palettes)

        palette_key = comp.palette_key
        by_palette[palette_key] += 1

        if np.array_equal(compositor_img, sim_img):
            match += 1
        else:
            mismatch += 1
            diff_px = count_rgba_diff(compositor_img, sim_img)
            cat = _palette_category(palette_key)
            mismatch_by_palette[palette_key] += 1
            mismatch_by_category[cat] += 1
            if len(examples) < 15:
                examples.append(
                    {
                        "seed": seed,
                        "palette_key": palette_key,
                        "diff_pixels": diff_px,
                        "category": cat,
                    }
                )

    return {
        "count": count,
        "match": match,
        "mismatch": mismatch,
        "match_rate": match / count if count else 0,
        "palette_frequency": dict(by_palette.most_common()),
        "mismatch_by_palette": dict(mismatch_by_palette.most_common()),
        "mismatch_by_category": dict(mismatch_by_category.most_common()),
        "mismatch_examples": examples,
    }


def _palette_category(palette_key: str) -> str:
    k = palette_key.upper()
    if "_SHIRT_" in k:
        return "shirt"
    if k.startswith("NORMIE_"):
        return "normie"
    if any(k.endswith(f"_{s}") for s in ("BLONDE", "GREY", "RED")):
        return "hair_variant"
    if k in BASE_FAMILIES:
        return "base"
    return "other"


def build_registry_candidates(palettes: dict) -> dict:
    shirt = analyze_shirt_palettes(palettes)
    normie = analyze_normie_palettes(palettes)
    hair_var = analyze_hair_variant_palettes(palettes)

    pattern_summary = {
        "shirt_palettes_count": len(shirt),
        "all_shirt_only_hood_diff": all(e["only_hood_diff"] for e in shirt),
        "unique_diff_slots_across_shirts": sorted(
            {idx for e in shirt for idx in e["diff_role_indices"]}
        ),
        "hood_diff_count": sum(1 for e in shirt if 9 in e["diff_role_indices"]),
    }

    proposed_shirt_color_table: dict[str, dict[str, str]] = {}
    for base in BASE_FAMILIES:
        proposed_shirt_color_table[base] = {}
        for color in SHIRT_COLORS:
            key = f"{base}_SHIRT_{color}"
            if key in palettes:
                proposed_shirt_color_table[base][color] = normalize_hex_colors(
                    palettes[key]["colors"]
                )[9]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "schema_version": "1.0.0",
        "roles": ROLES,
        "shirt_palettes": shirt,
        "normie_palettes": normie,
        "hair_variant_palettes": hair_var,
        "pattern_summary": pattern_summary,
        "proposed_shirt_color_table": proposed_shirt_color_table,
        "proposed_id_allocation": {
            "existing_bytes": "0-37 unchanged",
            "shirt_palette_ids": f"{SHIRT_PALETTE_ID_START}-{SHIRT_PALETTE_ID_START + len(shirt) - 1}",
            "next_free_after_shirts": SHIRT_PALETTE_ID_START + len(shirt),
        },
        "recommended_representation": "role_slot_remap",
        "recommendation_rationale": (
            "All 42 shirt palettes differ from their parent base family at exactly role index 9 (hood) only. "
            "Hair BLONDE/GREY/RED variants use a separate pattern (indices 13-15) already encoded as full palette IDs 6-23."
        ),
    }


def main() -> None:
    _, palettes = load_roles_and_palettes()
    candidates = build_registry_candidates(palettes)

    out_json = REPORTS_DIR / "PALETTE_REGISTRY_CANDIDATES.json"
    out_json.write_text(json.dumps(candidates, indent=2), encoding="utf-8")
    print(f"Wrote {out_json}")
    print(
        f"Shirt palettes: {candidates['pattern_summary']['shirt_palettes_count']}, "
        f"only hood diff: {candidates['pattern_summary']['all_shirt_only_hood_diff']}"
    )

    print("Running 1000-seed registry simulation...")
    sim = run_1000_simulation(palettes, seed_start=1, count=1000)
    sim_path = REPORTS_DIR / "palette_registry_simulation_1000.json"
    sim_path.write_text(json.dumps(sim, indent=2), encoding="utf-8")
    print(f"Wrote {sim_path}")
    print(f"Simulation match: {sim['match']}/{sim['count']}")


if __name__ == "__main__":
    main()
