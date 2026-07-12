"""Face Forge — derive HeroA-compatible head overlays from read-only reference art."""

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
from engine.config import DERIVED_ASSETS_DIR, REPORTS_DIR, ROOT
from engine.palette_renderer import (
    composite_layers,
    extract_to_buffer,
    load_pick_buffers,
    render_palette_png,
    resolve_extraction_draw_colors,
    build_role_index,
)
from engine.validate_palette import validate_palette
from engine.validate_pixels import validate_pixels
from engine.validation_modes import DEFAULT_VALIDATION_MODE

READ_ONLY_HEADS = {
    "male": Path(r"X:\Cursor\Homies\art-pipeline\components\male\HEAD_HeroA.png"),
    "female": Path(r"X:\Cursor\Homies\art-pipeline\components\female\HEAD_Female_Hero_A.png"),
}

FACE_FORGE_ROOT = DERIVED_ASSETS_DIR / "face_forge"

# Head slot skin ramp (matches slot_schema head drawColors)
SKIN_RGBA = {
    "deep": (76, 39, 15, 255),
    "shadow": (137, 83, 42, 255),
    "mid": (178, 114, 63, 255),
    "light": (209, 139, 77, 255),
    "highlight": (223, 156, 94, 255),
    "hi": (240, 234, 224, 255),
}

PREVIEW_PALETTES = [
    "SIGNAL_SHIRT_RED",
    "SIGNAL_SHIRT_BLUE",
    "SIGNAL_SHIRT_GREEN",
    "SIGNAL_SHIRT_ORANGE",
    "SIGNAL_SHIRT_PURPLE",
]

PREVIEW_TRAITS = {
    "male": {
        "hairs": ["Male_Afro", "Male_Dreads", "Male_Mohawk", "Male_Surfer", "Male_Buns"],
        "eyes": ["Male_Straight", "Male_Stoned", "Male_SquintLeft", "Male_WideOpen", "Male_CrossEyed"],
        "shirt": "Crew",
        "neck": "HeroA",
    },
    "female": {
        "hairs": ["Female_Afro", "Female_Dreads", "Female_Mohawk", "Female_Pompadour", "Female_FlatTop"],
        "eyes": ["Female_Straight", "Female_LookLeft", "Female_Stoned", "Female_CrissCrossed", "Female_LookRight"],
        "shirt": "Crew_Female",
        "neck": "HeroA_Female",
    },
}


@dataclass
class FaceCandidate:
    family: str
    gender: str
    source_head: str
    output_path: Path
    notes: list[str]


def _load_rgba(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA"), dtype=np.uint8)


def _save_rgba(arr: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, mode="RGBA").save(path)


def _set_px(out: np.ndarray, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if 0 <= x < 64 and 0 <= y < 64:
        out[y, x] = color


def _is_skin(px: np.ndarray) -> bool:
    if px[3] == 0:
        return False
    rgb = tuple(int(v) for v in px[:3])
    return rgb in {c[:3] for c in SKIN_RGBA.values()}


def _face_center(arr: np.ndarray) -> tuple[int, int]:
    opaque = arr[:, :, 3] > 0
    ys, xs = np.where(opaque)
    return int(xs.mean()), int(ys.mean())


def apply_angular(arr: np.ndarray, gender: str) -> tuple[np.ndarray, list[str]]:
    out = arr.copy()
    cx, cy = _face_center(arr)
    notes = ["narrowed lower jaw", "sharpened cheekbone shadows", "intensified brow ridge"]

    # Narrow jaw — trim outer lower face
    for y in range(29, 41):
        taper = max(8, 14 - (y - 28) // 2)
        for x in range(64):
            if out[y, x, 3] == 0:
                continue
            if abs(x - cx) > taper:
                out[y, x] = (0, 0, 0, 0)
            elif abs(x - cx) > taper - 1:
                out[y, x] = SKIN_RGBA["shadow"]

    # Cheekbone accents
    cheek_y = range(20, 28)
    for y in cheek_y:
        _set_px(out, cx - 12, y, SKIN_RGBA["shadow"])
        _set_px(out, cx - 11, y + 1, SKIN_RGBA["mid"])
        _set_px(out, cx + 12, y, SKIN_RGBA["shadow"])
        _set_px(out, cx + 11, y + 1, SKIN_RGBA["mid"])

    # Intense brow
    brow_y = range(12, 16 if gender == "male" else 15)
    for y in brow_y:
        for dx in range(-8, 9):
            x = cx + dx
            if 0 <= x < 64 and out[y, x, 3] > 0:
                out[y, x] = SKIN_RGBA["deep"]
        _set_px(out, cx - 9, y - 1, SKIN_RGBA["deep"])
        _set_px(out, cx + 9, y - 1, SKIN_RGBA["deep"])

    return out, notes


def apply_rugged(arr: np.ndarray, gender: str) -> tuple[np.ndarray, list[str]]:
    out = arr.copy()
    cx, cy = _face_center(arr)
    notes = ["widened jaw line", "heavier brow mass", "weathered cheek detail"]

    # Wider jaw — extend lower sides
    for y in range(34, 41):
        for side, x in (( -1, cx - 13), (-1, cx - 14), (1, cx + 13), (1, cx + 14)):
            src_x = x - side
            if 0 <= src_x < 64 and out[y, src_x, 3] > 0 and out[y, x, 3] == 0:
                out[y, x] = out[y, src_x]

    # Stronger brow
    for y in range(13, 18):
        for dx in range(-10, 11):
            x = cx + dx
            if 0 <= x < 64 and (out[y, x, 3] > 0 or out[y + 1, x, 3] > 0):
                out[y, x] = SKIN_RGBA["deep"]
                if y + 1 < 64:
                    _set_px(out, x, y + 1, SKIN_RGBA["shadow"])

    # Weathered cheek lines
    lines = [
        ((cx - 8, 24), (cx - 5, 27)),
        ((cx + 8, 24), (cx + 5, 27)),
        ((cx - 3, 18), (cx - 1, 20)),
    ]
    for (x0, y0), (x1, y1) in lines:
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(steps + 1):
            x = x0 + (x1 - x0) * i // steps
            y = y0 + (y1 - y0) * i // steps
            if 0 <= x < 64 and 0 <= y < 64:
                if out[y, x, 3] > 0:
                    out[y, x] = SKIN_RGBA["shadow"]

    if gender == "male":
        for x in range(cx - 4, cx + 5):
            _set_px(out, x, 29, SKIN_RGBA["mid"])

    return out, notes


def generate_face_overlays() -> list[FaceCandidate]:
    candidates: list[FaceCandidate] = []
    families = {
        "angular": apply_angular,
        "rugged": apply_rugged,
    }

    for gender, ref_path in READ_ONLY_HEADS.items():
        ref = _load_rgba(ref_path)
        for family, fn in families.items():
            morphed, notes = fn(ref, gender)
            out_dir = FACE_FORGE_ROOT / family
            fname = f"HEAD_{family.capitalize()}_{gender.capitalize()}.png"
            out_path = out_dir / fname
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


def _variant_by_name(schema: ArtSchemaBundle, slot: str, name: str) -> dict[str, Any]:
    for variant in schema.slot_def(slot).get("variants", []):
        if variant.get("name") == name:
            return variant
    raise KeyError(f"Variant {name!r} not found in slot {slot!r}")


def _make_pick(schema: ArtSchemaBundle, slot: str, variant_name: str) -> dict[str, Any]:
    variant = _variant_by_name(schema, slot, variant_name)
    return {"variant": variant, "file": variant["file"], "buffer": None}


def _load_head_buffer(
    head_path: Path,
    schema: ArtSchemaBundle,
    character: dict[str, Any],
) -> np.ndarray | None:
    pick = {"variant": {"name": "FaceForge", "zOrder": 10}, "file": str(head_path)}
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


def compose_face_preview(
    *,
    gender: str,
    head_path: Path,
    hair: str,
    eyes: str,
    palette_key: str,
    schema: ArtSchemaBundle,
) -> np.ndarray:
    character = {"name": "HeroA", "gender": gender.capitalize() if gender == "female" else "Male"}
    traits = PREVIEW_TRAITS[gender]

    picks: dict[str, dict[str, Any]] = {
        "hood": _make_pick(schema, "hood", "None" if gender == "male" else "Female_None"),
        "shirt": _make_pick(schema, "shirt", traits["shirt"]),
        "body": _make_pick(schema, "body", "None"),
        "bodytattoo": _make_pick(schema, "bodytattoo", "None"),
        "necklace": _make_pick(schema, "necklace", "None"),
        "neck": _make_pick(schema, "neck", traits["neck"]),
        "head": {"variant": {"name": "FaceForge", "zOrder": 10}, "file": str(head_path), "buffer": None},
        "tattoo": _make_pick(schema, "tattoo", "None"),
        "mask": _make_pick(schema, "mask", "None"),
        "beard": _make_pick(schema, "beard", "None"),
        "mustache": _make_pick(schema, "mustache", "None"),
        "eyes": _make_pick(schema, "eyes", eyes),
        "expression": _make_pick(
            schema,
            "expression",
            "Male_Neutral" if gender == "male" else "Female_Neutral",
        ),
        "earrings": _make_pick(schema, "earrings", "None"),
        "glasses": _make_pick(schema, "glasses", "None"),
        "hair": _make_pick(schema, "hair", hair),
        "accessory": _make_pick(schema, "accessory", "None"),
    }

    load_pick_buffers(picks, schema, character)
    picks["head"]["buffer"] = _load_head_buffer(head_path, schema, character)

    layers = []
    for slot, pick in picks.items():
        variant = pick.get("variant") or {}
        z = int(variant.get("zOrder") or schema.slot_def(slot).get("zOrder", 0))
        layers.append((z, pick.get("buffer")))
    role_buf = composite_layers(layers, schema.grid)
    return render_palette_png(role_buf, palette_key, schema, grid=schema.grid)


def validate_candidate(
    head_path: Path,
    preview_rgba: np.ndarray,
    palette_key: str,
) -> dict[str, Any]:
    head_rgba = _load_rgba(head_path)
    head_px = validate_pixels(head_rgba, mode=DEFAULT_VALIDATION_MODE)
    head_palette = validate_palette(head_rgba, "SIGNAL", mode=DEFAULT_VALIDATION_MODE)
    prev_px = validate_pixels(preview_rgba, mode=DEFAULT_VALIDATION_MODE)
    prev_palette = validate_palette(preview_rgba, palette_key, mode=DEFAULT_VALIDATION_MODE)

    return {
        "head_overlay": {
            "pixel_pass": head_px.pass_,
            "palette_pass": head_palette.pass_,
            "orphans": head_px.orphans,
            "pixel_count": head_px.pixel_count,
        },
        "composed_preview": {
            "pixel_pass": prev_px.pass_,
            "palette_pass": prev_palette.pass_,
            "orphans": prev_px.orphans,
        },
        "passes_validators": (
            head_px.pass_
            and head_palette.pass_
            and prev_px.pass_
            and prev_palette.pass_
        ),
    }


def _font(size: int = 10):
    for name in ("consola.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def build_preview_sheet(candidates: list[FaceCandidate], schema: ArtSchemaBundle) -> tuple[Path, dict[str, Any]]:
    scale = 5
    cols = 5
    rows = len(candidates)
    cell = 64 * scale
    label_h = 36
    pad = 8
    title_h = 28
    sheet_w = pad + cols * (cell + pad)
    sheet_h = title_h + pad + rows * (cell + label_h + pad)
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (22, 22, 26, 255))
    draw = ImageDraw.Draw(sheet)
    font = _font(9)
    title_font = _font(12)

    draw.text((pad, 6), "Face Forge Prototype — HeroA-compatible overlays", fill=(230, 230, 230), font=title_font)

    validation_report: dict[str, Any] = {}

    for row, cand in enumerate(candidates):
        gender = cand.gender
        traits = PREVIEW_TRAITS[gender]
        row_key = f"{cand.family}_{gender}"
        validation_report[row_key] = {"previews": [], "overlay": None}

        y0 = title_h + pad + row * (cell + label_h + pad)
        draw.text(
            (pad, y0 - 14),
            f"{cand.family.capitalize()} / {gender.capitalize()}",
            fill=(180, 200, 255),
            font=font,
        )

        overlay_val = validate_candidate(
            cand.output_path,
            compose_face_preview(
                gender=gender,
                head_path=cand.output_path,
                hair=traits["hairs"][0],
                eyes=traits["eyes"][0],
                palette_key=PREVIEW_PALETTES[0],
                schema=schema,
            ),
            PREVIEW_PALETTES[0],
        )
        validation_report[row_key]["overlay"] = overlay_val["head_overlay"]

        for col in range(cols):
            hair = traits["hairs"][col]
            eyes = traits["eyes"][col]
            palette = PREVIEW_PALETTES[col]
            rgba = compose_face_preview(
                gender=gender,
                head_path=cand.output_path,
                hair=hair,
                eyes=eyes,
                palette_key=palette,
                schema=schema,
            )
            val = validate_candidate(cand.output_path, rgba, palette)
            validation_report[row_key]["previews"].append(
                {
                    "hair": hair,
                    "eyes": eyes,
                    "palette": palette,
                    **val,
                }
            )

            tile = Image.fromarray(rgba, mode="RGBA").resize((cell, cell), Image.NEAREST)
            x0 = pad + col * (cell + pad)
            sheet.paste(tile, (x0, y0), tile)
            caption = f"{hair.split('_', 1)[-1][:8]}\n{eyes.split('_', 1)[-1][:8]}\n{palette.split('_')[-1]}"
            draw.multiline_text((x0, y0 + cell + 2), caption, fill=(190, 190, 190), font=font, spacing=2)

    out_path = REPORTS_DIR / "face_forge_preview.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, optimize=True)
    return out_path, validation_report


def run_face_forge() -> dict[str, Any]:
    guard = ReadOnlyArtGuard()
    ReadOnlyArtGuard.print_startup_banner()
    hash_before = guard.snapshot_before()

    FACE_FORGE_ROOT.mkdir(parents=True, exist_ok=True)
    schema = load_art_schema_bundle()
    candidates = generate_face_overlays()

    preview_path, validation_report = build_preview_sheet(candidates, schema)

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_heads": {k: str(v) for k, v in READ_ONLY_HEADS.items()},
        "candidates": [
            {
                "family": c.family,
                "gender": c.gender,
                "source_head": c.source_head,
                "output_path": str(c.output_path.relative_to(ROOT)),
                "notes": c.notes,
            }
            for c in candidates
        ],
        "validation": validation_report,
        "preview_sheet": str(preview_path.relative_to(ROOT)),
    }
    manifest_path = FACE_FORGE_ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    hash_after = guard.snapshot_after()
    guard.verify_unchanged()

    return {
        "manifest_path": str(manifest_path),
        "preview_path": str(preview_path),
        "source_art_hash_before": hash_before,
        "source_art_hash_after": hash_after,
        "source_art_unchanged": hash_before == hash_after,
        "candidates": manifest["candidates"],
        "validation": validation_report,
    }


if __name__ == "__main__":
    result = run_face_forge()
    print(json.dumps(result, indent=2))
