"""Face Bake-Off — Classic vs Angular vs Rugged on identical seeds/traits."""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

from engine.art_safety import ReadOnlyArtGuard
from engine.art_schema_loader import load_art_schema_bundle
from engine.compositor import CompositorResult, generate_chromie
from engine.config import REPORTS_DIR, ROOT
from engine.face_forge import FACE_FORGE_ROOT, READ_ONLY_HEADS, _font, _make_pick
from engine.face_forge_v2 import V2_TRAITS
from engine.js_rng import mulberry32, seed_from_str
from engine.palette_renderer import (
    build_role_index,
    composite_layers,
    extract_to_buffer,
    load_pick_buffers,
    render_palette_png,
    resolve_extraction_draw_colors,
)

V21_ROOT = FACE_FORGE_ROOT / "v2_1"

FAMILIES = ("Classic", "Angular", "Rugged")

RANDOM_SEEDS = [7, 23, 42, 101, 256, 512, 777, 999]
HAIR_SEED = 42
ACCESSORY_SEED = 128
SKIN_SEED = 314

SKIN_PALETTES = ["SIGNAL", "SIGNAL_SHIRT_RED", "CYAN", "BLOOD", "GHOST"]


def _gender_key(character: dict[str, Any]) -> str:
    g = character.get("gender")
    if g == "Female":
        return "female"
    return "male"


def _head_path(family: str, gender: str) -> Path:
    if family == "Classic":
        return READ_ONLY_HEADS[gender]
    cap = gender.capitalize()
    return V21_ROOT / f"HEAD_{family}_{cap}_v2_1.png"


def _load_head_buffer(
    head_path: Path,
    schema: Any,
    character: dict[str, Any],
) -> np.ndarray | None:
    pick = {"variant": {"name": "BakeOff", "zOrder": 10}, "file": str(head_path)}
    slot_def = schema.slot_def("head")
    draw_colors = resolve_extraction_draw_colors("head", pick, character, slot_def, schema)
    role_index = build_role_index(schema.roles)
    return extract_to_buffer(
        head_path,
        draw_colors,
        role_index,
        grid=schema.grid,
        bg_knockout_threshold=schema.bg_knockout_threshold,
    )


def _apply_trait_overrides(
    picks: dict[str, dict[str, Any]],
    schema: Any,
    character: dict[str, Any],
    overrides: dict[str, str | None],
) -> dict[str, dict[str, Any]]:
    out = deepcopy(picks)
    for slot, variant_name in overrides.items():
        if variant_name is None:
            continue
        out[slot] = _make_pick(schema, slot, variant_name)
    return out


def render_family_triple(
    result: CompositorResult,
    schema: Any,
    *,
    palette_key: str | None = None,
    trait_overrides: dict[str, str | None] | None = None,
) -> dict[str, np.ndarray]:
    gender = _gender_key(result.character)
    palette = palette_key or result.palette_key
    trait_overrides = trait_overrides or {}
    images: dict[str, np.ndarray] = {}

    for family in FAMILIES:
        head_path = _head_path(family, gender)
        picks = _apply_trait_overrides(result.render_picks, schema, result.character, trait_overrides)
        picks["head"] = {
            "variant": {"name": f"BakeOff_{family}", "zOrder": 10},
            "file": str(head_path),
            "buffer": None,
        }
        load_pick_buffers(picks, schema, result.character)
        picks["head"]["buffer"] = _load_head_buffer(head_path, schema, result.character)

        layers = []
        for slot, pick in picks.items():
            variant = pick.get("variant") or {}
            z = int(variant.get("zOrder") or schema.slot_def(slot).get("zOrder", 0))
            layers.append((z, pick.get("buffer")))
        role_buf = composite_layers(layers, schema.grid)
        images[family] = render_palette_png(role_buf, palette, schema, grid=schema.grid)

    return images


def _compose_sheet(
    rows: list[dict[str, Any]],
    *,
    title: str,
    col_labels: list[str] | None,
    row_label_fn,
    blind: bool = False,
    scale: int = 4,
) -> Image.Image:
    cols = len(col_labels) if col_labels else len(FAMILIES)
    cell = 64 * scale
    label_h = 28 if not blind else 18
    pad = 8
    title_h = 26
    sheet_w = pad + cols * (cell + pad)
    sheet_h = title_h + pad + len(rows) * (cell + label_h + pad)
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (16, 16, 20, 255))
    draw = ImageDraw.Draw(sheet)
    font = _font(8)
    title_font = _font(11)

    draw.text((pad, 4), title, fill=(230, 230, 230), font=title_font)

    if col_labels and not blind:
        for i, label in enumerate(col_labels):
            tw = draw.textlength(label, font=font)
            x = pad + i * (cell + pad) + (cell - tw) // 2
            draw.text((x, title_h - 2), label, fill=(170, 170, 170), font=font)

    for row_idx, row in enumerate(rows):
        y0 = title_h + pad + row_idx * (cell + label_h + pad)
        row_label = row_label_fn(row)
        if row_label and not blind:
            draw.text((pad, y0 - 12), row_label, fill=(150, 175, 220), font=font)

        order = row.get("column_order", list(FAMILIES))
        images: dict[str, np.ndarray] = row["images"]
        for col_idx, family in enumerate(order):
            rgba = images[family]
            tile = Image.fromarray(rgba, mode="RGBA").resize((cell, cell), Image.NEAREST)
            x0 = pad + col_idx * (cell + pad)
            sheet.paste(tile, (x0, y0), tile)
            if blind:
                cap = row.get("blind_row_label", f"#{row_idx + 1}")
                tw = draw.textlength(cap, font=font)
                draw.text((x0 + (cell - tw) // 2, y0 + cell + 2), cap, fill=(120, 120, 120), font=font)

    return sheet


def build_random_sheet(schema: Any) -> tuple[Image.Image, list[dict]]:
    rows: list[dict] = []
    for seed in RANDOM_SEEDS:
        result = generate_chromie(seed, seed, schema)
        images = render_family_triple(result, schema)
        rows.append({"seed": seed, "images": images, "palette": result.palette_key})
    sheet = _compose_sheet(
        rows,
        title="Face Bake-Off — Random seeds (traits identical except head family)",
        col_labels=list(FAMILIES),
        row_label_fn=lambda r: f"Seed {r['seed']}  ({r['palette']})",
    )
    return sheet, rows


def build_hair_sheet(schema: Any) -> tuple[Image.Image, list[dict]]:
    result = generate_chromie(HAIR_SEED, HAIR_SEED, schema)
    gender = _gender_key(result.character)
    hairs = V2_TRAITS[gender]["hairs"]
    rows: list[dict] = []
    for hair in hairs:
        images = render_family_triple(result, schema, trait_overrides={"hair": hair})
        rows.append({"seed": HAIR_SEED, "hair": hair, "images": images})
    sheet = _compose_sheet(
        rows,
        title=f"Face Bake-Off — Hairstyles (seed {HAIR_SEED}, traits identical except head)",
        col_labels=list(FAMILIES),
        row_label_fn=lambda r: r["hair"].replace("_", " "),
    )
    return sheet, rows


def build_accessories_sheet(schema: Any) -> tuple[Image.Image, list[dict]]:
    result = generate_chromie(ACCESSORY_SEED, ACCESSORY_SEED, schema)
    gender = _gender_key(result.character)
    traits = V2_TRAITS[gender]

    cases: list[tuple[str, dict[str, str | None]]] = [
        ("Clean", {}),
        ("Glasses", {"glasses": traits["glasses"]}),
        ("Beard", {"beard": traits["beard"]}),
        ("Glasses + Beard", {"glasses": traits["glasses"], "beard": traits["beard"]}),
        (
            "Hoodie",
            {"hood": "Classic" if gender == "male" else "Female_Classic"},
        ),
        ("Necklace", {"necklace": "Male_Chain" if gender == "male" else "Female_Chain"}),
        ("Tank", {"body": "Tank" if gender == "male" else "Female_Tank", "shirt": "None"}),
    ]

    rows: list[dict] = []
    for label, overrides in cases:
        images = render_family_triple(result, schema, trait_overrides=overrides)
        rows.append({"seed": ACCESSORY_SEED, "case": label, "overrides": overrides, "images": images})

    sheet = _compose_sheet(
        rows,
        title=f"Face Bake-Off — Accessories (seed {ACCESSORY_SEED})",
        col_labels=list(FAMILIES),
        row_label_fn=lambda r: r["case"],
    )
    return sheet, rows


def build_skin_tones_sheet(schema: Any) -> tuple[Image.Image, list[dict]]:
    result = generate_chromie(SKIN_SEED, SKIN_SEED, schema)
    rows: list[dict] = []
    for palette in SKIN_PALETTES:
        images = render_family_triple(result, schema, palette_key=palette)
        rows.append({"seed": SKIN_SEED, "palette": palette, "images": images})
    sheet = _compose_sheet(
        rows,
        title=f"Face Bake-Off — Skin / palette tones (seed {SKIN_SEED})",
        col_labels=list(FAMILIES),
        row_label_fn=lambda r: r["palette"],
    )
    return sheet, rows


def build_blind_sheet(random_rows: list[dict]) -> tuple[Image.Image, list[dict]]:
    blind_rows: list[dict] = []
    for idx, row in enumerate(random_rows):
        seed = row["seed"]
        rng = mulberry32(seed_from_str(f"{seed}:bakeoff:blind"))
        order = list(FAMILIES)
        for i in range(len(order) - 1, 0, -1):
            j = int(rng() * (i + 1))
            order[i], order[j] = order[j], order[i]
        blind_rows.append(
            {
                "seed": seed,
                "images": row["images"],
                "column_order": order,
                "blind_row_label": f"Set {idx + 1}",
            }
        )

    sheet = _compose_sheet(
        blind_rows,
        title="Face Bake-Off — Blind evaluation (head family not labeled)",
        col_labels=None,
        row_label_fn=lambda r: "",
        blind=True,
    )
    return sheet, blind_rows


def run_face_bakeoff() -> dict[str, Any]:
    guard = ReadOnlyArtGuard()
    ReadOnlyArtGuard.print_startup_banner()
    hash_before = guard.snapshot_before()

    schema = load_art_schema_bundle()

    sheets: dict[str, Path] = {}
    random_sheet, random_rows = build_random_sheet(schema)
    sheets["random"] = REPORTS_DIR / "face_bakeoff_random.png"
    random_sheet.save(sheets["random"], optimize=True)

    hair_sheet, hair_rows = build_hair_sheet(schema)
    sheets["hair"] = REPORTS_DIR / "face_bakeoff_hair.png"
    hair_sheet.save(sheets["hair"], optimize=True)

    acc_sheet, acc_rows = build_accessories_sheet(schema)
    sheets["accessories"] = REPORTS_DIR / "face_bakeoff_accessories.png"
    acc_sheet.save(sheets["accessories"], optimize=True)

    skin_sheet, skin_rows = build_skin_tones_sheet(schema)
    sheets["skin_tones"] = REPORTS_DIR / "face_bakeoff_skin_tones.png"
    skin_sheet.save(sheets["skin_tones"], optimize=True)

    blind_sheet, blind_rows = build_blind_sheet(random_rows)
    sheets["blind"] = REPORTS_DIR / "face_bakeoff_blind.png"
    blind_sheet.save(sheets["blind"], optimize=True)

    # Answer key stored separately — not on blind PNG
    blind_key = [
        {
            "set": idx + 1,
            "seed": row["seed"],
            "column_order": row["column_order"],
        }
        for idx, row in enumerate(blind_rows)
    ]

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": "Identical compositor seeds; only head overlay swapped (Classic=HeroA, Angular/Rugged=v2.1)",
        "families": {
            "Classic": "art-pipeline HeroA head (read-only)",
            "Angular": str(V21_ROOT / "HEAD_Angular_*_v2_1.png"),
            "Rugged": str(V21_ROOT / "HEAD_Rugged_*_v2_1.png"),
        },
        "seeds": {
            "random": RANDOM_SEEDS,
            "hair": HAIR_SEED,
            "accessories": ACCESSORY_SEED,
            "skin_tones": SKIN_SEED,
        },
        "sheets": {k: str(v.relative_to(ROOT)) for k, v in sheets.items()},
        "blind_answer_key": blind_key,
        "random_rows": [{"seed": r["seed"], "palette": r["palette"]} for r in random_rows],
        "hair_rows": [{"hair": r["hair"]} for r in hair_rows],
        "accessory_rows": [{"case": r["case"]} for r in acc_rows],
        "skin_rows": [{"palette": r["palette"]} for r in skin_rows],
        "evaluation_prompts": [
            "Can the face family be identified before noticing the hairstyle?",
            "Does the face still read as HeroA?",
            "Do existing hairstyles still fit naturally?",
            "Do glasses still align perfectly?",
            "Do beards still align correctly?",
            "Is anything visually uncanny?",
            "Do the three families increase perceived diversity?",
        ],
    }
    report_path = REPORTS_DIR / "face_bakeoff_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    hash_after = guard.snapshot_after()
    guard.verify_unchanged()

    return {
        "report_path": str(report_path),
        "sheets": {k: str(v) for k, v in sheets.items()},
        "source_art_unchanged": hash_before == hash_after,
        "source_art_hash": hash_before,
    }


if __name__ == "__main__":
    result = run_face_bakeoff()
    print(json.dumps(result, indent=2))
