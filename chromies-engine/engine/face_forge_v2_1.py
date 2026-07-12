"""Face Forge v2.1 — pixel polish pass (craftsmanship, no structural change)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

from engine.art_safety import ReadOnlyArtGuard
from engine.art_schema_loader import load_art_schema_bundle
from engine.config import REPORTS_DIR, ROOT
from engine.face_forge import (
    FACE_FORGE_ROOT,
    PREVIEW_PALETTES,
    READ_ONLY_HEADS,
    SKIN_RGBA,
    FaceCandidate,
    _face_center,
    _font,
    _load_rgba,
    _save_rgba,
    validate_candidate,
)
from engine.face_forge_v2 import V2_ROOT, V2_TRAITS, _protected_mask

V21_ROOT = FACE_FORGE_ROOT / "v2_1"

# Skin ramp order (darkest → lightest). No new colors.
RAMP_NAMES = ("deep", "shadow", "mid", "light", "highlight", "hi")
RAMP_COLORS: dict[tuple[int, int, int], str] = {
    SKIN_RGBA[name][:3]: name for name in RAMP_NAMES
}
RAMP_COLORS[(26, 13, 14)] = "deep"  # occasional female outline pixel
TIER = {name: i for i, name in enumerate(RAMP_NAMES)}


def _rgb_tier(rgb: tuple[int, int, int]) -> int | None:
    name = RAMP_COLORS.get(rgb)
    return TIER.get(name) if name else None


def _tier_color(tier: int) -> tuple[int, int, int, int]:
    tier = max(0, min(len(RAMP_NAMES) - 1, tier))
    return SKIN_RGBA[RAMP_NAMES[tier]]


def _neighbors4(y: int, x: int) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < 64 and 0 <= nx < 64:
            out.append((ny, nx))
    return out


def _neighbors8(y: int, x: int) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            ny, nx = y + dy, x + dx
            if 0 <= ny < 64 and 0 <= nx < 64:
                out.append((ny, nx))
    return out


def _editable(out: np.ndarray, y: int, x: int, protected: np.ndarray) -> bool:
    return out[y, x, 3] > 0 and not protected[y, x]


def _neighbor_tiers(out: np.ndarray, y: int, x: int) -> list[int]:
    tiers: list[int] = []
    for ny, nx in _neighbors4(y, x):
        if out[ny, nx, 3] == 0:
            continue
        t = _rgb_tier(tuple(int(v) for v in out[ny, nx, :3]))
        if t is not None:
            tiers.append(t)
    return tiers


def _majority_tier(tiers: list[int]) -> int | None:
    if not tiers:
        return None
    return max(set(tiers), key=tiers.count)


def polish_remove_isolated_speckles(out: np.ndarray, protected: np.ndarray) -> int:
    changes = 0
    for y in range(64):
        for x in range(64):
            if not _editable(out, y, x, protected):
                continue
            rgb = tuple(int(v) for v in out[y, x, :3])
            tier = _rgb_tier(rgb)
            if tier is None:
                continue
            same = 0
            for ny, nx in _neighbors8(y, x):
                if tuple(int(v) for v in out[ny, nx, :3]) == rgb:
                    same += 1
            if same > 0:
                continue
            majority = _majority_tier(_neighbor_tiers(out, y, x))
            if majority is not None:
                out[y, x] = _tier_color(majority)
                changes += 1
    return changes


def polish_smooth_harsh_jumps(out: np.ndarray, protected: np.ndarray, max_jump: int = 2) -> int:
    changes = 0
    for y in range(64):
        for x in range(64):
            if not _editable(out, y, x, protected):
                continue
            tier = _rgb_tier(tuple(int(v) for v in out[y, x, :3]))
            if tier is None:
                continue
            neighbors = _neighbor_tiers(out, y, x)
            if not neighbors:
                continue
            avg = sum(neighbors) / len(neighbors)
            if abs(tier - avg) >= max_jump:
                target = int(round((tier + avg) / 2))
                out[y, x] = _tier_color(target)
                changes += 1
    return changes


def polish_brow_transitions(out: np.ndarray, cx: int, protected: np.ndarray) -> int:
    changes = 0
    for y in range(11, 18):
        for x in range(cx - 10, cx + 11):
            if not _editable(out, y, x, protected):
                continue
            tier = _rgb_tier(tuple(int(v) for v in out[y, x, :3]))
            if tier is None:
                continue
            ntiers = _neighbor_tiers(out, y, x)
            if not ntiers:
                continue
            if tier == TIER["deep"] and max(ntiers) >= TIER["light"]:
                out[y, x] = _tier_color(TIER["shadow"])
                changes += 1
            elif tier == TIER["deep"] and sum(1 for t in ntiers if t == TIER["deep"]) <= 1:
                out[y, x] = _tier_color(TIER["shadow"])
                changes += 1
    return changes


def polish_cheek_gradients(out: np.ndarray, cx: int, protected: np.ndarray) -> int:
    changes = 0
    for y in range(19, 29):
        for side in (-1, 1):
            for dx in range(8, 14):
                x = cx + side * dx
                if not _editable(out, y, x, protected):
                    continue
                tier = _rgb_tier(tuple(int(v) for v in out[y, x, :3]))
                if tier is None:
                    continue
                ntiers = _neighbor_tiers(out, y, x)
                if not ntiers:
                    continue
                avg = sum(ntiers) / len(ntiers)
                # Sculpted cheek: outer upper = lighter, lower-inner = darker
                target = avg
                if y < 24 and dx >= 10:
                    target = min(tier, avg + 0.3)
                elif y >= 25:
                    target = max(tier, avg - 0.2)
                new_tier = int(round((tier + target) / 2))
                if new_tier != tier:
                    out[y, x] = _tier_color(new_tier)
                    changes += 1
    return changes


def polish_jaw_edges(out: np.ndarray, cx: int, protected: np.ndarray) -> int:
    changes = 0
    for y in range(28, 40):
        for x in range(64):
            if not _editable(out, y, x, protected):
                continue
            if y >= 38 and abs(x - cx) <= 4:
                continue
            n4 = _neighbors4(y, x)
            transparent_neighbors = sum(1 for ny, nx in n4 if out[ny, nx, 3] == 0)
            if transparent_neighbors == 0:
                continue
            tier = _rgb_tier(tuple(int(v) for v in out[y, x, :3]))
            if tier is None:
                continue
            ntiers = _neighbor_tiers(out, y, x)
            if not ntiers:
                continue
            # Edge pixel: prefer shadow/mid, avoid deep/hi on outline
            majority = _majority_tier(ntiers)
            if majority is None:
                continue
            if tier <= TIER["deep"] or tier >= TIER["highlight"]:
                out[y, x] = _tier_color(TIER["shadow"])
                changes += 1
            elif abs(tier - majority) >= 2:
                out[y, x] = _tier_color(majority)
                changes += 1
    return changes


def polish_nose_cluster(out: np.ndarray, cx: int, protected: np.ndarray) -> int:
    changes = 0
    for y in range(20, 30):
        for dx in range(1, 6):
            xl, xr = cx - dx, cx + dx
            if not (0 <= xl < 64 and 0 <= xr < 64):
                continue
            if protected[y, xl] or protected[y, xr]:
                continue
            if out[y, xl, 3] == 0 or out[y, xr, 3] == 0:
                continue
            tl = _rgb_tier(tuple(int(v) for v in out[y, xl, :3]))
            tr = _rgb_tier(tuple(int(v) for v in out[y, xr, :3]))
            if tl is None or tr is None:
                continue
            if abs(tl - tr) == 1:
                avg = int(round((tl + tr) / 2))
                out[y, xl] = _tier_color(avg)
                out[y, xr] = _tier_color(avg)
                changes += 2
    return changes


def polish_neck_shading(out: np.ndarray, cx: int, protected: np.ndarray) -> int:
    changes = 0
    for y in range(34, 41):
        for x in range(cx - 8, cx + 9):
            if not _editable(out, y, x, protected):
                continue
            tier = _rgb_tier(tuple(int(v) for v in out[y, x, :3]))
            if tier is None:
                continue
            if tier == TIER["deep"]:
                ntiers = _neighbor_tiers(out, y, x)
                deep_neighbors = sum(1 for t in ntiers if t == TIER["deep"])
                if deep_neighbors >= 2:
                    out[y, x] = _tier_color(TIER["shadow"])
                    changes += 1
            elif tier == TIER["shadow"] and y >= 37:
                out[y, x] = _tier_color(TIER["mid"])
                changes += 1
    return changes


def polish_highlight_noise(out: np.ndarray, protected: np.ndarray) -> int:
    changes = 0
    for y in range(64):
        for x in range(64):
            if not _editable(out, y, x, protected):
                continue
            tier = _rgb_tier(tuple(int(v) for v in out[y, x, :3]))
            if tier is None or tier < TIER["highlight"]:
                continue
            same = sum(
                1
                for ny, nx in _neighbors4(y, x)
                if out[ny, nx, 3] > 0
                and _rgb_tier(tuple(int(v) for v in out[ny, nx, :3])) == tier
            )
            if same == 0:
                out[y, x] = _tier_color(tier - 1)
                changes += 1
    return changes


def polish_staircase_shadows(out: np.ndarray, protected: np.ndarray) -> int:
    changes = 0
    for y in range(1, 63):
        for x in range(1, 63):
            if not _editable(out, y, x, protected):
                continue
            tier = _rgb_tier(tuple(int(v) for v in out[y, x, :3]))
            if tier not in (TIER["deep"], TIER["shadow"]):
                continue
            # Detect 2x2 stair: single diagonal shadow/deep checker
            pairs = [
                ((y - 1, x), (y, x - 1)),
                ((y - 1, x), (y, x + 1)),
                ((y + 1, x), (y, x - 1)),
                ((y + 1, x), (y, x + 1)),
            ]
            for (ay, ax), (by, bx) in pairs:
                if out[ay, ax, 3] == 0 or out[by, bx, 3] == 0:
                    continue
                ta = _rgb_tier(tuple(int(v) for v in out[ay, ax, :3]))
                tb = _rgb_tier(tuple(int(v) for v in out[by, bx, :3]))
                if ta is None or tb is None:
                    continue
                if abs(ta - tb) >= 2 and tier == max(ta, tb):
                    out[y, x] = _tier_color((ta + tb) // 2)
                    changes += 1
                    break
    return changes


def polish_symmetry(out: np.ndarray, cx: int, protected: np.ndarray) -> int:
    changes = 0
    for y in range(11, 33):
        for dx in range(1, 15):
            xl, xr = cx - dx, cx + dx
            if protected[y, xl] or protected[y, xr]:
                continue
            if out[y, xl, 3] == 0 or out[y, xr, 3] == 0:
                continue
            tl = _rgb_tier(tuple(int(v) for v in out[y, xl, :3]))
            tr = _rgb_tier(tuple(int(v) for v in out[y, xr, :3]))
            if tl is None or tr is None:
                continue
            if abs(tl - tr) == 1:
                avg = int(round((tl + tr) / 2))
                out[y, xl] = _tier_color(avg)
                out[y, xr] = _tier_color(avg)
                changes += 2
    return changes


def apply_polish_v21(arr: np.ndarray, gender: str) -> tuple[np.ndarray, dict[str, int]]:
    out = arr.copy()
    cx, _ = _face_center(arr)
    protected = _protected_mask(cx)
    stats: dict[str, int] = {}

    for _ in range(2):
        stats["isolated_speckles"] = stats.get("isolated_speckles", 0) + polish_remove_isolated_speckles(
            out, protected
        )
        stats["harsh_jumps"] = stats.get("harsh_jumps", 0) + polish_smooth_harsh_jumps(out, protected)
        stats["staircase"] = stats.get("staircase", 0) + polish_staircase_shadows(out, protected)

    stats["brow"] = polish_brow_transitions(out, cx, protected)
    stats["cheeks"] = polish_cheek_gradients(out, cx, protected)
    stats["jaw_edges"] = polish_jaw_edges(out, cx, protected)
    stats["nose"] = polish_nose_cluster(out, cx, protected)
    stats["neck"] = polish_neck_shading(out, cx, protected)
    stats["highlights"] = polish_highlight_noise(out, protected)
    stats["symmetry"] = polish_symmetry(out, cx, protected)

    # Final pass — gentle consolidation
    stats["final_speckles"] = polish_remove_isolated_speckles(out, protected)
    stats["final_jumps"] = polish_smooth_harsh_jumps(out, protected, max_jump=3)

    return out, stats


def generate_v21_overlays() -> list[tuple[FaceCandidate, dict[str, int]]]:
    results: list[tuple[FaceCandidate, dict[str, int]]] = []
    specs = [
        ("angular", "male"),
        ("rugged", "male"),
        ("angular", "female"),
        ("rugged", "female"),
    ]
    V21_ROOT.mkdir(parents=True, exist_ok=True)

    for family, gender in specs:
        v2_path = V2_ROOT / f"HEAD_{family.capitalize()}_{gender.capitalize()}_v2.png"
        source = _load_rgba(v2_path)
        polished, stats = apply_polish_v21(source, gender)
        out_path = V21_ROOT / f"HEAD_{family.capitalize()}_{gender.capitalize()}_v2_1.png"
        _save_rgba(polished, out_path)
        results.append(
            (
                FaceCandidate(
                    family=family,
                    gender=gender,
                    source_head=str(v2_path),
                    output_path=out_path,
                    notes=["v2.1 pixel polish — shadow/highlight/brow/cheek/jaw/neck cleanup"],
                ),
                stats,
            )
        )
    return results


def compose_v21_preview(
    schema: Any,
    gender: str,
    head_path: Path,
    *,
    hair: str,
    eyes: str = "Male_Straight",
    palette_key: str = "SIGNAL",
    glasses: bool = False,
    beard: bool = False,
    hood: str | None = None,
    body: str | None = None,
    shirt: str | None = None,
    necklace: str | None = None,
) -> np.ndarray:
    traits = V2_TRAITS[gender]

    character = {"name": "HeroA", "gender": "Female" if gender == "female" else "Male"}

    from engine.face_forge import _make_pick
    from engine.palette_renderer import (
        build_role_index,
        composite_layers,
        extract_to_buffer,
        load_pick_buffers,
        render_palette_png,
        resolve_extraction_draw_colors,
    )

    hood_name = hood if hood else ("None" if gender == "male" else "Female_None")
    shirt_name = shirt if shirt is not None else traits["shirt"]
    body_name = body if body is not None else "None"
    necklace_name = necklace if necklace is not None else "None"

    picks: dict[str, dict[str, Any]] = {
        "hood": _make_pick(schema, "hood", hood_name),
        "shirt": _make_pick(schema, "shirt", shirt_name),
        "body": _make_pick(schema, "body", body_name),
        "bodytattoo": _make_pick(schema, "bodytattoo", "None"),
        "necklace": _make_pick(schema, "necklace", necklace_name),
        "neck": _make_pick(schema, "neck", traits["neck"]),
        "head": {"variant": {"name": "FaceForgeV21", "zOrder": 10}, "file": str(head_path), "buffer": None},
        "tattoo": _make_pick(schema, "tattoo", "None"),
        "mask": _make_pick(schema, "mask", "None"),
        "beard": _make_pick(schema, "beard", traits["beard"] if beard else "None"),
        "mustache": _make_pick(schema, "mustache", "None"),
        "eyes": _make_pick(schema, "eyes", eyes),
        "expression": _make_pick(
            schema,
            "expression",
            "Male_Neutral" if gender == "male" else "Female_Neutral",
        ),
        "earrings": _make_pick(schema, "earrings", "None"),
        "glasses": _make_pick(schema, "glasses", traits["glasses"] if glasses else "None"),
        "hair": _make_pick(schema, "hair", hair),
        "accessory": _make_pick(schema, "accessory", "None"),
    }

    load_pick_buffers(picks, schema, character)
    slot_def = schema.slot_def("head")
    draw_colors = resolve_extraction_draw_colors("head", picks["head"], character, slot_def, schema)
    role_index = build_role_index(schema.roles)
    picks["head"]["buffer"] = extract_to_buffer(
        head_path,
        draw_colors,
        role_index,
        grid=schema.grid,
        bg_knockout_threshold=schema.bg_knockout_threshold,
    )

    layers = []
    for slot, pick in picks.items():
        variant = pick.get("variant") or {}
        z = int(variant.get("zOrder") or schema.slot_def(slot).get("zOrder", 0))
        layers.append((z, pick.get("buffer")))
    role_buf = composite_layers(layers, schema.grid)
    return render_palette_png(role_buf, palette_key, schema, grid=schema.grid)


def run_compatibility_validation(candidates: list[FaceCandidate], schema: Any) -> dict[str, Any]:
    """Validate v2.1 heads with hair, glasses, beard, hoodie, tank, necklace."""
    results: dict[str, Any] = {}
    compat_cases = [
        {"label": "base", "hair_i": 0, "glasses": False, "beard": False},
        {"label": "glasses", "hair_i": 1, "glasses": True, "beard": False},
        {"label": "beard", "hair_i": 2, "glasses": False, "beard": True},
        {"label": "hoodie", "hair_i": 3, "hood": "Classic"},
        {"label": "tank", "hair_i": 4, "body": "Tank", "shirt": "None"},
        {"label": "necklace", "hair_i": 0, "necklace": "Male_Chain"},
    ]

    for cand in candidates:
        gender = cand.gender
        traits = V2_TRAITS[gender]
        key = f"{cand.family}_{gender}"
        results[key] = []

        for case in compat_cases:
            hood = case.get("hood")
            if hood and gender == "female":
                hood = "Female_Classic"
            necklace = case.get("necklace")
            if necklace and gender == "female":
                necklace = "Female_Chain"
            body = case.get("body")
            if body and gender == "female":
                body = "Female_Tank"
            shirt = case.get("shirt")

            rgba = compose_v21_preview(
                schema,
                gender,
                cand.output_path,
                hair=traits["hairs"][case["hair_i"]],
                eyes=traits["eyes"][case["hair_i"]],
                palette_key=PREVIEW_PALETTES[case["hair_i"]],
                glasses=case.get("glasses", False),
                beard=case.get("beard", False),
                hood=hood,
                body=body,
                shirt=shirt,
                necklace=necklace,
            )
            val = validate_candidate(cand.output_path, rgba, PREVIEW_PALETTES[case["hair_i"]])
            results[key].append({"case": case["label"], "passes": val["passes_validators"], **val})

    return results


def build_v21_compare_sheet(schema: Any) -> Path:
    scale = 6
    cell = 64 * scale
    pad = 10
    label_h = 22
    title_h = 28
    cols = 3
    rows = 4

    sheet_w = pad + cols * (cell + pad)
    sheet_h = title_h + pad + rows * (cell + label_h + pad)
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (18, 18, 22, 255))
    draw = ImageDraw.Draw(sheet)
    font = _font(9)
    title_font = _font(12)

    draw.text((pad, 4), "Face Forge v2.1 — Original → v2 → v2.1", fill=(230, 230, 230), font=title_font)
    for i, label in enumerate(["Original", "v2", "v2.1"]):
        draw.text((pad + i * (cell + pad) + cell // 2 - 22, title_h - 4), label, fill=(180, 180, 180), font=font)

    row_specs = [
        ("Angular Male", "male", "angular"),
        ("Angular Female", "female", "angular"),
        ("Rugged Male", "male", "rugged"),
        ("Rugged Female", "female", "rugged"),
    ]

    for row, (row_label, gender, family) in enumerate(row_specs):
        y0 = title_h + pad + row * (cell + label_h + pad)
        draw.text((pad, y0 - 14), row_label, fill=(160, 190, 255), font=font)

        heads = [
            READ_ONLY_HEADS[gender],
            V2_ROOT / f"HEAD_{family.capitalize()}_{gender.capitalize()}_v2.png",
            V21_ROOT / f"HEAD_{family.capitalize()}_{gender.capitalize()}_v2_1.png",
        ]
        traits = V2_TRAITS[gender]
        for col, head_path in enumerate(heads):
            rgba = compose_v21_preview(
                schema,
                gender,
                head_path,
                hair=traits["hairs"][0],
                eyes=traits["eyes"][0],
                palette_key="SIGNAL",
            )
            tile = Image.fromarray(rgba, mode="RGBA").resize((cell, cell), Image.NEAREST)
            x0 = pad + col * (cell + pad)
            sheet.paste(tile, (x0, y0), tile)

    out = REPORTS_DIR / "face_forge_v2_1_compare.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, optimize=True)
    return out


def run_face_forge_v21() -> dict[str, Any]:
    guard = ReadOnlyArtGuard()
    ReadOnlyArtGuard.print_startup_banner()
    hash_before = guard.snapshot_before()

    schema = load_art_schema_bundle()
    generated = generate_v21_overlays()
    candidates = [c for c, _ in generated]
    polish_stats = {f"{c.family}_{c.gender}": s for c, s in generated}

    compare_path = build_v21_compare_sheet(schema)
    compat = run_compatibility_validation(candidates, schema)
    all_pass = all(entry["passes"] for rows in compat.values() for entry in rows)

    manifest = {
        "version": "v2.1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "pass_type": "pixel_polish_only",
        "experimental": True,
        "registered_in_generator": False,
        "source": "derived_assets/face_forge/v2",
        "candidates": [
            {
                "family": c.family,
                "gender": c.gender,
                "output_path": str(c.output_path.relative_to(ROOT)),
                "polish_stats": polish_stats[f"{c.family}_{c.gender}"],
            }
            for c in candidates
        ],
        "compatibility_validation": compat,
        "all_compatibility_pass": all_pass,
        "compare_sheet": str(compare_path.relative_to(ROOT)),
    }
    manifest_path = V21_ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    hash_after = guard.snapshot_after()
    guard.verify_unchanged()

    return {
        "manifest_path": str(manifest_path),
        "compare_path": str(compare_path),
        "source_art_unchanged": hash_before == hash_after,
        "source_art_hash": hash_before,
        "polish_stats": polish_stats,
        "compatibility_validation": compat,
        "all_compatibility_pass": all_pass,
        "candidates": manifest["candidates"],
    }


if __name__ == "__main__":
    result = run_face_forge_v21()
    print(json.dumps(result, indent=2))
