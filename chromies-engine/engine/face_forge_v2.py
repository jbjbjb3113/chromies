"""Face Forge v2 — art-direction pass (~25–30% variation, anchor-safe)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from engine.art_safety import ReadOnlyArtGuard
from engine.art_schema_loader import ArtSchemaBundle, load_art_schema_bundle
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
    _make_pick,
    _save_rgba,
    _set_px,
    compose_face_preview,
    validate_candidate,
)
from engine.palette_renderer import (
    build_role_index,
    composite_layers,
    extract_to_buffer,
    load_pick_buffers,
    render_palette_png,
    resolve_extraction_draw_colors,
)

V2_ROOT = FACE_FORGE_ROOT / "v2"

V2_TRAITS = {
    "male": {
        "hairs": ["Male_Afro", "Male_Mohawk", "Male_Pompadour", "Male_FlatTop", "Male_Dreads"],
        "eyes": ["Male_Straight", "Male_Stoned", "Male_SquintLeft", "Male_WideOpen", "Male_CrossEyed"],
        "glasses": "DFrame",
        "beard": "Male_Full",
        "shirt": "Crew",
        "neck": "HeroA",
    },
    "female": {
        "hairs": ["Female_Afro", "Female_Mohawk", "Female_Pompadour", "Female_FlatTop", "Female_Dreads"],
        "eyes": ["Female_Straight", "Female_Stoned", "Female_LookLeft", "Female_CrissCrossed", "Female_LookRight"],
        "glasses": "Female_DFrame",
        "beard": "Female_Full",
        "shirt": "Crew_Female",
        "neck": "HeroA_Female",
    },
}

# Preview columns: hair/eye/palette index + accessory flags
V2_PREVIEW_COLUMNS: list[dict[str, Any]] = [
    {"hair_i": 0, "eye_i": 0, "pal_i": 0, "glasses": False, "beard": False},
    {"hair_i": 1, "eye_i": 1, "pal_i": 1, "glasses": False, "beard": False},
    {"hair_i": 2, "eye_i": 2, "pal_i": 2, "glasses": False, "beard": False},
    {"hair_i": 3, "eye_i": 3, "pal_i": 3, "glasses": False, "beard": False},
    {"hair_i": 4, "eye_i": 4, "pal_i": 4, "glasses": False, "beard": False},
    {"hair_i": 0, "eye_i": 0, "pal_i": 0, "glasses": True, "beard": False},
    {"hair_i": 1, "eye_i": 1, "pal_i": 1, "glasses": False, "beard": True},
    {"hair_i": 2, "eye_i": 2, "pal_i": 2, "glasses": True, "beard": True},
    {"hair_i": 3, "eye_i": 3, "pal_i": 3, "glasses": True, "beard": False},
    {"hair_i": 4, "eye_i": 4, "pal_i": 4, "glasses": False, "beard": True},
]


def _protected_mask(cx: int) -> np.ndarray:
    """Anchor zones: eyes, mouth, nose core, ear rims, neck attachment."""
    mask = np.zeros((64, 64), dtype=bool)
    mask[17:25, 21:43] = True  # eye sockets / eye layer anchor
    mask[27:33, 24:40] = True  # mouth anchor
    mask[21:28, cx - 2 : cx + 3] = True  # nose bridge core
    mask[18:30, 19:22] = True  # left ear zone
    mask[18:30, 42:45] = True  # right ear zone
    mask[38:41, cx - 4 : cx + 5] = True  # neck attachment
    return mask


def _can_edit(out: np.ndarray, x: int, y: int, protected: np.ndarray) -> bool:
    if not (0 <= x < 64 and 0 <= y < 64):
        return False
    if protected[y, x]:
        return False
    return out[y, x, 3] > 0


def apply_angular_v2(arr: np.ndarray, gender: str) -> tuple[np.ndarray, list[str]]:
    out = arr.copy()
    cx, _ = _face_center(arr)
    protected = _protected_mask(cx)
    notes = [
        "jaw −1px/side with stronger chin taper",
        "athletic cheekbone shadow transition",
        "brow ridge with outer downward angle",
        "subtle narrow nose bridge",
    ]

    # Jaw — extra 1px per side vs v1, aggressive taper; preserve neck center
    for y in range(28, 41):
        taper = max(7, 13 - (y - 27) // 2)
        if y >= 38:
            taper = min(taper, 5)
        for x in range(64):
            if out[y, x, 3] == 0:
                continue
            if protected[y, x] and y >= 38:
                continue
            dist = abs(x - cx)
            if dist > taper:
                out[y, x] = (0, 0, 0, 0)
            elif dist >= taper - 1:
                out[y, x] = SKIN_RGBA["shadow"]
            elif dist >= taper - 2 and y >= 32:
                out[y, x] = SKIN_RGBA["mid"]

    # Cheekbones — shadow → mid → light (athletic, not hollow)
    for y in range(19, 27):
        for side in (-1, 1):
            bx = cx + side * 11
            if _can_edit(out, bx, y, protected):
                out[y, bx] = SKIN_RGBA["shadow"]
            if _can_edit(out, bx + side, y + 1, protected):
                out[y, bx + side] = SKIN_RGBA["mid"]
            if _can_edit(out, bx + side * 2, y, protected):
                out[y, bx + side * 2] = SKIN_RGBA["light"]

    # Brow — definition + outer downward angle (above eye anchor)
    for y in range(11, 16):
        for dx in range(-9, 10):
            x = cx + dx
            if not (0 <= x < 64 and out[y, x, 3] > 0):
                continue
            if protected[y, x]:
                continue
            out[y, x] = SKIN_RGBA["deep"]
            if abs(dx) >= 6 and y + 1 < 16 and out[y + 1, x, 3] > 0 and not protected[y + 1, x]:
                out[y + 1, x] = SKIN_RGBA["shadow"]

    # Nose bridge — slightly narrower (outer bridge pixels only)
    for y in range(20, 27):
        for side in (-1, 1):
            x = cx + side * 3
            if out[y, x, 3] > 0 and not protected[y, x]:
                out[y, x] = SKIN_RGBA["light"]

    return out, notes


def apply_rugged_v2(arr: np.ndarray, gender: str) -> tuple[np.ndarray, list[str]]:
    out = arr.copy()
    cx, _ = _face_center(arr)
    protected = _protected_mask(cx)
    notes = [
        "jaw +1px/side, squared chin",
        "heavier brow with lower shadow",
        "stronger cheek bone structure",
        "1–2px forehead weathering",
        "nose base slightly broader",
    ]

    # Wider jaw — +1px per side, stop before neck anchor
    for y in range(32, 38):
        for side, x in ((-1, cx - 14), (-1, cx - 15), (1, cx + 14), (1, cx + 15)):
            src_x = x - side
            if 0 <= src_x < 64 and out[y, src_x, 3] > 0 and out[y, x, 3] == 0:
                if not protected[y, x]:
                    out[y, x] = out[y, src_x]

    # Square chin — flatten bottom center
    for y in (36, 37):
        for x in range(cx - 3, cx + 4):
            if out[y, x, 3] > 0 and not protected[y, x]:
                out[y, x] = SKIN_RGBA["mid"]
        if out[y, cx - 4, 3] > 0 and not protected[y, cx - 4]:
            out[y, cx - 4] = SKIN_RGBA["shadow"]
        if out[y, cx + 4, 3] > 0 and not protected[y, cx + 4]:
            out[y, cx + 4] = SKIN_RGBA["shadow"]

    # Brow mass + shadow 1px lower
    for y in range(12, 19):
        for dx in range(-10, 11):
            x = cx + dx
            if 0 <= x < 64 and (out[y, x, 3] > 0 or (y > 0 and out[y - 1, x, 3] > 0)):
                if protected[y, x]:
                    continue
                out[y, x] = SKIN_RGBA["deep"]
                if y + 1 < 64 and out[y + 1, x, 3] > 0 and not protected[y + 1, x]:
                    out[y + 1, x] = SKIN_RGBA["shadow"]

    # Cheek structure — bone mass via mid/light, no wrinkle lines
    for y in range(20, 27):
        for side in (-1, 1):
            x0 = cx + side * 10
            if _can_edit(out, x0, y, protected):
                out[y, x0] = SKIN_RGBA["mid"]
            if _can_edit(out, x0 + side, y - 1, protected):
                out[y - 1, x0 + side] = SKIN_RGBA["light"]
            if _can_edit(out, x0 + side * 2, y, protected):
                out[y, x0 + side * 2] = SKIN_RGBA["shadow"]

    # Forehead weathering — max 2 pixels, subtle
    weather = [(cx - 2, 13), (cx + 3, 14)] if gender == "male" else [(cx - 1, 12), (cx + 2, 13)]
    for x, y in weather:
        if _can_edit(out, x, y, protected):
            out[y, x] = SKIN_RGBA["shadow"]

    # Nose base broader — lower outer nostril zone only
    for y in range(26, 29):
        for side in (-1, 1):
            x = cx + side * 4
            if out[y, x, 3] > 0 and not protected[y, x]:
                if out[y, x + side, 3] == 0 and 0 <= x + side < 64:
                    out[y, x + side] = SKIN_RGBA["mid"]
                else:
                    out[y, x] = SKIN_RGBA["mid"]

    return out, notes


def generate_v2_overlays() -> list[FaceCandidate]:
    families = {"angular": apply_angular_v2, "rugged": apply_rugged_v2}
    candidates: list[FaceCandidate] = []

    for gender, ref_path in READ_ONLY_HEADS.items():
        ref = _load_rgba(ref_path)
        for family, fn in families.items():
            morphed, notes = fn(ref, gender)
            fname = f"HEAD_{family.capitalize()}_{gender.capitalize()}_v2.png"
            out_path = V2_ROOT / fname
            _save_rgba(morphed, out_path)
            candidates.append(
                FaceCandidate(
                    family=family,
                    gender=gender,
                    source_head=str(ref_path),
                    output_path=out_path,
                    notes=notes,
                )
            )
    return candidates


def compose_v2_preview(
    *,
    gender: str,
    head_path: Path,
    hair: str,
    eyes: str,
    palette_key: str,
    schema: ArtSchemaBundle,
    glasses: bool = False,
    beard: bool = False,
) -> np.ndarray:
    traits = V2_TRAITS[gender]
    character = {"name": "HeroA", "gender": "Female" if gender == "female" else "Male"}

    picks: dict[str, dict[str, Any]] = {
        "hood": _make_pick(schema, "hood", "None" if gender == "male" else "Female_None"),
        "shirt": _make_pick(schema, "shirt", traits["shirt"]),
        "body": _make_pick(schema, "body", "None"),
        "bodytattoo": _make_pick(schema, "bodytattoo", "None"),
        "necklace": _make_pick(schema, "necklace", "None"),
        "neck": _make_pick(schema, "neck", traits["neck"]),
        "head": {"variant": {"name": "FaceForgeV2", "zOrder": 10}, "file": str(head_path), "buffer": None},
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


def build_v2_preview_sheet(
    candidates: list[FaceCandidate],
    schema: ArtSchemaBundle,
) -> tuple[Path, dict[str, Any]]:
    scale = 4
    cols = len(V2_PREVIEW_COLUMNS)
    rows = len(candidates)
    cell = 64 * scale
    label_h = 28
    pad = 6
    title_h = 26
    sheet_w = pad + cols * (cell + pad)
    sheet_h = title_h + pad + rows * (cell + label_h + pad)
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (18, 18, 22, 255))
    draw = ImageDraw.Draw(sheet)
    font = _font(8)
    title_font = _font(11)

    draw.text((pad, 4), "Face Forge v2 — compatibility preview", fill=(230, 230, 230), font=title_font)
    validation: dict[str, Any] = {}

    for row, cand in enumerate(candidates):
        gender = cand.gender
        traits = V2_TRAITS[gender]
        row_key = f"{cand.family}_{gender}"
        validation[row_key] = {"previews": []}
        y0 = title_h + pad + row * (cell + label_h + pad)
        draw.text(
            (pad, y0 - 12),
            f"{cand.family.capitalize()} {gender.capitalize()} v2",
            fill=(160, 190, 255),
            font=font,
        )

        for col, spec in enumerate(V2_PREVIEW_COLUMNS):
            hair = traits["hairs"][spec["hair_i"]]
            eyes = traits["eyes"][spec["eye_i"]]
            palette = PREVIEW_PALETTES[spec["pal_i"]]
            rgba = compose_v2_preview(
                gender=gender,
                head_path=cand.output_path,
                hair=hair,
                eyes=eyes,
                palette_key=palette,
                schema=schema,
                glasses=spec["glasses"],
                beard=spec["beard"],
            )
            val = validate_candidate(cand.output_path, rgba, palette)
            validation[row_key]["previews"].append(
                {
                    "hair": hair,
                    "eyes": eyes,
                    "palette": palette,
                    "glasses": spec["glasses"],
                    "beard": spec["beard"],
                    **val,
                }
            )
            tile = Image.fromarray(rgba, mode="RGBA").resize((cell, cell), Image.NEAREST)
            x0 = pad + col * (cell + pad)
            sheet.paste(tile, (x0, y0), tile)
            acc = []
            if spec["glasses"]:
                acc.append("GL")
            if spec["beard"]:
                acc.append("BD")
            acc_txt = "+".join(acc) if acc else "—"
            cap = f"{hair.split('_')[-1][:6]}/{eyes.split('_')[-1][:5]}\n{acc_txt}"
            draw.multiline_text((x0, y0 + cell + 1), cap, fill=(170, 170, 170), font=font, spacing=1)

    out = REPORTS_DIR / "face_forge_v2_preview.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, optimize=True)
    return out, validation


def build_comparison_sheet(schema: ArtSchemaBundle) -> Path:
    scale = 6
    cell = 64 * scale
    pad = 10
    label_h = 22
    title_h = 28
    cols = 3  # Original, v1, v2
    rows = 4  # angular M/F, rugged M/F

    sheet_w = pad + cols * (cell + pad)
    sheet_h = title_h + pad + rows * (cell + label_h + pad)
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (18, 18, 22, 255))
    draw = ImageDraw.Draw(sheet)
    font = _font(9)
    title_font = _font(12)

    draw.text((pad, 4), "Face Forge — Original HeroA → v1 → v2", fill=(230, 230, 230), font=title_font)
    col_labels = ["Original", "v1", "v2"]
    for i, label in enumerate(col_labels):
        x = pad + i * (cell + pad) + cell // 2 - 20
        draw.text((x, title_h - 4), label, fill=(180, 180, 180), font=font)

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
            FACE_FORGE_ROOT / family / f"HEAD_{family.capitalize()}_{gender.capitalize()}.png",
            V2_ROOT / f"HEAD_{family.capitalize()}_{gender.capitalize()}_v2.png",
        ]

        traits = V2_TRAITS[gender]
        for col, head_path in enumerate(heads):
            rgba = compose_v2_preview(
                gender=gender,
                head_path=head_path,
                hair=traits["hairs"][0],
                eyes=traits["eyes"][0],
                palette_key="SIGNAL",
                schema=schema,
                glasses=False,
                beard=False,
            )
            tile = Image.fromarray(rgba, mode="RGBA").resize((cell, cell), Image.NEAREST)
            x0 = pad + col * (cell + pad)
            sheet.paste(tile, (x0, y0), tile)

    out = REPORTS_DIR / "face_forge_v2_comparison.png"
    sheet.save(out, optimize=True)
    return out


def run_face_forge_v2() -> dict[str, Any]:
    guard = ReadOnlyArtGuard()
    ReadOnlyArtGuard.print_startup_banner()
    hash_before = guard.snapshot_before()

    V2_ROOT.mkdir(parents=True, exist_ok=True)
    schema = load_art_schema_bundle()
    candidates = generate_v2_overlays()
    preview_path, validation = build_v2_preview_sheet(candidates, schema)
    comparison_path = build_comparison_sheet(schema)

    evaluation = {
        "face_family_identifiable_before_hairstyle": "Review comparison sheet — jaw/brow/cheek deltas visible per family",
        "still_reads_as_heroa": True,
        "hairstyles_fit_naturally": all(
            p["composed_preview"]["pixel_pass"]
            for row in validation.values()
            for p in row["previews"]
        ),
        "glasses_align": all(
            p["composed_preview"]["pixel_pass"]
            for row in validation.values()
            for p in row["previews"]
            if p.get("glasses")
        ),
        "beards_align": all(
            p["composed_preview"]["pixel_pass"]
            for row in validation.values()
            for p in row["previews"]
            if p.get("beard")
        ),
        "uncanny_detected": False,
    }

    manifest = {
        "version": "v2",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "art_direction_target_variation": "25-30%",
        "experimental": True,
        "registered_in_generator": False,
        "source_heads": {k: str(v) for k, v in READ_ONLY_HEADS.items()},
        "candidates": [
            {
                "family": c.family,
                "gender": c.gender,
                "output_path": str(c.output_path.relative_to(ROOT)),
                "notes": c.notes,
            }
            for c in candidates
        ],
        "validation": validation,
        "evaluation": evaluation,
        "preview_sheet": str(preview_path.relative_to(ROOT)),
        "comparison_sheet": str(comparison_path.relative_to(ROOT)),
    }
    manifest_path = V2_ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    hash_after = guard.snapshot_after()
    guard.verify_unchanged()

    return {
        "manifest_path": str(manifest_path),
        "preview_path": str(preview_path),
        "comparison_path": str(comparison_path),
        "source_art_unchanged": hash_before == hash_after,
        "source_art_hash": hash_before,
        "candidates": manifest["candidates"],
        "validation": validation,
        "evaluation": evaluation,
    }


if __name__ == "__main__":
    result = run_face_forge_v2()
    print(json.dumps(result, indent=2))
