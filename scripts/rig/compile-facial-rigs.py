#!/usr/bin/env python3
"""Facial Rig Compiler — per-token eye + mouth pixel rigs for all 5,150 tokens.

Reads canonical mint-data.json (read-only), compiled layer coordinate tables
(scripts/anim/face-regions.json), and chromies-engine on-chain trait registries.
Resolves mouth trait names via one sequential JS batch pass
(scripts/rig/_batch_expression_lookup.cjs) mirroring production guard state.

Outputs scripts/rig/facial-rigs.json — deterministic, sorted keys, provenance
hashes, no timestamps.

Usage:
    python scripts/rig/compile-facial-rigs.py [--out PATH]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import numpy as np

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_ROOT.parent
RIG_ROOT = SCRIPTS_ROOT / "rig"
ENGINE_ROOT = REPO_ROOT / "chromies-engine"
ENGINE_DATA = ENGINE_ROOT / "engine_data"

MINT_DATA_PATH = REPO_ROOT / "public" / "data" / "mint-data.json"
FACE_REGIONS_PATH = SCRIPTS_ROOT / "anim" / "face-regions.json"
ON_CHAIN_TRAIT_BYTES_PATH = ENGINE_DATA / "on_chain_trait_bytes.json"
SLOT_SCHEMA_PATH = ENGINE_DATA / "slot_schema.json"
LEGENDARY_TABLES_PATH = ENGINE_ROOT / "scripts" / "persona" / "persona-tables.json"
DEFAULT_OUT_PATH = RIG_ROOT / "facial-rigs.json"
BATCH_EXPRESSION_HELPER = RIG_ROOT / "_batch_expression_lookup.cjs"

if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from anim._canonical_token_source import decode_grid, load_mint_records  # noqa: E402
from engine.mint_payload import from_hex, unpack_pixels  # noqa: E402
from engine.on_chain_palette import palette_colors  # noqa: E402
from engine.palette_renderer import hex_to_rgb  # noqa: E402

COMPONENTS_ROOT = REPO_ROOT / "art-pipeline" / "components"

# Characters with forced eyes=None may bake eyes into the head layer (not eye-role indices).
CHARACTER_HEAD_VARIANT = {
    "SideProfile_Male": "SP_HeroA_Male",
    "SideProfile_Female": "SP_HeroA_Female",
    "Zombie": "Zombie",
    "Agent": "Agent",
}

# Dark source colors on head PNGs that mark baked eye sockets (mask_dark / mask_mid art).
BAKED_EYE_RGB = {
    (0x1A, 0x0D, 0x0E),
    (0x2A, 0x15, 0x18),
    (0x13, 0x14, 0x12),
    (0x1A, 0x0A, 0x14),
}
GRID = 64
TRAITS_BYTES = 32
EYE_ROLES = {10, 11, 12}
SKIN_ROLES = {4, 5, 6, 7, 8}
ROLE_NAMES = {
    10: "eye_socket",
    11: "eye_glow",
    12: "eye_signal",
}

SLOT_INDICES = {
    "character": 0,
    "palette": 1,
    "eyes": 11,
    "glasses": 13,
}


def hard_fail(message: str) -> None:
    print(f"HARD FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def load_json(path: Path) -> Any:
    if not path.is_file():
        hard_fail(f"required input missing: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def rig_hash(rig_obj: dict) -> str:
    payload = {k: v for k, v in rig_obj.items() if k != "rigHash"}
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def build_reverse_tables() -> dict[str, dict[int, str]]:
    trait_reg = load_json(ON_CHAIN_TRAIT_BYTES_PATH)
    reverse: dict[str, dict[int, str]] = {}
    reverse["character"] = {v: k for k, v in trait_reg["character_bytes"].items()}
    for slot, entry in trait_reg["slots"].items():
        reverse[slot] = {v: k for k, v in entry["bytes"].items()}
    return reverse


def decode_slot(raw: bytes, slot: str, reverse: dict[str, dict[int, str]], token_id: int) -> str:
    idx = SLOT_INDICES[slot]
    value = reverse[slot].get(raw[idx])
    if value is None:
        hard_fail(f"token {token_id}: slot '{slot}' byte 0x{raw[idx]:02x} has no registry entry")
    return value


def role_grid(pixels_hex: str) -> np.ndarray:
    raw = from_hex(pixels_hex)
    return np.asarray(unpack_pixels(raw), dtype=np.uint8).reshape(GRID, GRID)


def coords_from_roles(grid: np.ndarray, roles: set[int]) -> list[list[int]]:
    ys, xs = np.where(np.isin(grid, list(roles)))
    coords = [[int(x), int(y)] for x, y in zip(xs.tolist(), ys.tolist())]
    coords.sort(key=lambda p: (p[1], p[0]))
    return coords


def split_left_right(coords: list[list[int]]) -> tuple[list[list[int]], list[list[int]], bool]:
    """Split eye coords into left/right hemispheres when separable."""
    if not coords:
        return [], [], False
    xs = [c[0] for c in coords]
    mid = (min(xs) + max(xs)) / 2.0
    left = [c for c in coords if c[0] < mid]
    right = [c for c in coords if c[0] >= mid]
    separable = bool(left and right and max(c[0] for c in left) < min(c[0] for c in right))
    return left, right, separable


def sample_eye_colors(
    grid: np.ndarray,
    rgba: np.ndarray,
    eye_coords: list[list[int]],
    palette_id: int,
) -> dict[str, str]:
    colors = palette_colors(palette_id)
    role_to_hex: dict[int, str] = {}
    for x, y in eye_coords:
        role = int(grid[y, x])
        if role in EYE_ROLES and role not in role_to_hex:
            role_to_hex[role] = colors[role].lower()
    return {ROLE_NAMES[r]: h for r, h in sorted(role_to_hex.items())}


def find_skin_sample(grid: np.ndarray, eye_coords: list[list[int]]) -> list[int]:
    """Pick a skin-adjacent pixel below the eye region for blink repaint sampling."""
    if not eye_coords:
        raise ValueError("internal: find_skin_sample called with empty eye_coords")

    max_eye_y = max(c[1] for c in eye_coords)
    min_eye_x = min(c[0] for c in eye_coords)
    max_eye_x = max(c[0] for c in eye_coords)
    cx = (min_eye_x + max_eye_x) // 2

    candidates: list[tuple[int, int, int]] = []
    for y in range(max_eye_y + 1, min(GRID, max_eye_y + 8)):
        for x in range(max(0, cx - 4), min(GRID, cx + 5)):
            if int(grid[y, x]) in SKIN_ROLES:
                dist = abs(x - cx) + (y - max_eye_y)
                candidates.append((dist, x, y))

    if candidates:
        _, sx, sy = min(candidates)
        return [sx, sy]

    ys, xs = np.where(np.isin(grid, list(SKIN_ROLES)))
    if len(xs) > 0:
        eye_cx = sum(c[0] for c in eye_coords) / len(eye_coords)
        eye_cy = sum(c[1] for c in eye_coords) / len(eye_coords)
        best = min(
            ((xs[i] - eye_cx) ** 2 + (ys[i] - eye_cy) ** 2, int(xs[i]), int(ys[i]))
            for i in range(len(xs))
        )
        return [best[1], best[2]]

    # Empty / background-only payload: anchor below eyes; closedEyeFill uses palette fallback.
    sy = min(max_eye_y + 1, GRID - 1)
    sx = max(0, min(GRID - 1, cx))
    return [sx, sy]


def closed_eye_fill(
    grid: np.ndarray,
    rgba: np.ndarray,
    skin: list[int],
    palette_id: int,
) -> list[int]:
    sx, sy = skin
    if int(grid[sy, sx]) in SKIN_ROLES:
        return rgba[sy, sx].tolist()
    colors = palette_colors(palette_id)
    r, g, b = hex_to_rgb(colors[6])  # skin_mid
    return [r, g, b, 255]


def mouth_anchor(coords: list[list[int]]) -> list[int] | None:
    if not coords:
        return None
    sx = sum(c[0] for c in coords)
    sy = sum(c[1] for c in coords)
    n = len(coords)
    return [round(sx / n), round(sy / n)]


def load_head_variants() -> dict[str, dict[str, Any]]:
    slot_schema = load_json(SLOT_SCHEMA_PATH)
    out: dict[str, dict[str, Any]] = {}
    for v in slot_schema.get("slots", {}).get("head", {}).get("variants", []):
        if v.get("name"):
            out[v["name"]] = v
    sp = slot_schema.get("side_profile_pipeline", {}).get("slots", {}).get("head", {})
    for v in sp.get("variants", []):
        out.setdefault(v["name"], v)
    return out


def baked_head_eye_coords(character: str, head_variants: dict[str, dict[str, Any]]) -> list[list[int]] | None:
    """Head-layer baked eye sockets for characters with forced eyes=None."""
    head_name = CHARACTER_HEAD_VARIANT.get(character)
    if not head_name:
        return None
    variant = head_variants.get(head_name)
    if not variant or not variant.get("on_disk", True):
        return None
    rel = str(variant.get("resolved_path") or variant.get("file")).replace("\\", "/")
    path = COMPONENTS_ROOT / rel
    if not path.is_file():
        return None

    from PIL import Image

    with Image.open(path) as im:
        arr = np.array(im.convert("RGBA"), dtype=np.uint8)
    coords: list[list[int]] = []
    for y in range(GRID):
        for x in range(GRID):
            r, g, b, a = (int(arr[y, x, i]) for i in range(4))
            if a == 0:
                continue
            if (r, g, b) in BAKED_EYE_RGB and 18 <= y <= 35:
                coords.append([x, y])
    coords.sort(key=lambda p: (p[1], p[0]))
    return coords or None


def resolve_eyes(
    token_id: int,
    eyes_trait: str,
    character: str,
    face_regions: dict[str, Any],
    grid: np.ndarray,
    head_variants: dict[str, dict[str, Any]],
) -> list[list[int]]:
    if eyes_trait != "None":
        coords = face_regions["eyes"].get(eyes_trait)
        if coords is None:
            hard_fail(
                f"token {token_id}: eyes trait {eyes_trait!r} has no entry in face-regions.json"
            )
        if not coords:
            hard_fail(f"token {token_id}: eyes trait {eyes_trait!r} maps to empty coordinate set")
        return coords

    baked = coords_from_roles(grid, EYE_ROLES)
    if baked:
        return baked

    head_baked = baked_head_eye_coords(character, head_variants)
    if head_baked:
        return head_baked

    hard_fail(
        f"token {token_id}: eyes trait 'None' but composited sprite has no eye-role pixels "
        f"(roles 10/11/12) and no head-layer baked-eye fallback for character {character!r}"
    )


def load_expression_map() -> dict[str, str | None]:
    if not BATCH_EXPRESSION_HELPER.is_file():
        hard_fail(f"required helper missing: {BATCH_EXPRESSION_HELPER}")
    try:
        proc = subprocess.run(
            ["node", str(BATCH_EXPRESSION_HELPER)],
            cwd=str(REPO_ROOT / "art-pipeline"),
            capture_output=True,
            text=True,
            timeout=3600,
        )
    except FileNotFoundError:
        hard_fail("`node` executable not found on PATH")
    except subprocess.TimeoutExpired:
        hard_fail("batch expression lookup timed out after 3600s")
    if proc.returncode != 0:
        hard_fail(
            f"batch expression lookup exited {proc.returncode}: {proc.stderr.strip()[:2000]}"
        )
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        hard_fail(f"batch expression lookup returned non-JSON: {exc}")


def resolve_expression(token_id: int, expression_map: dict[str, str | None]) -> str | None:
    key = str(token_id)
    if key not in expression_map:
        hard_fail(f"token {token_id}: missing from batch expression map")
    return expression_map[key]


def compile_rigs(out_path: Path) -> dict[str, Any]:
    mint_data = load_json(MINT_DATA_PATH)
    face_regions = load_json(FACE_REGIONS_PATH)
    reverse = build_reverse_tables()
    head_variants = load_head_variants()
    legendary_ids = set(load_json(LEGENDARY_TABLES_PATH)["legendaryTokenIds"])
    mint_records = load_mint_records()

    print("loading expression map (sequential JS batch)...", flush=True)
    expression_map = load_expression_map()

    rigs: dict[str, dict] = {}
    resolved = 0
    null_count = 0
    failed_ids: list[int] = []

    for record in sorted(mint_data, key=lambda r: int(r["tokenId"])):
        token_id = int(record["tokenId"])
        key = str(token_id)

        if token_id in legendary_ids:
            rigs[key] = {"rig": None, "handRigged": False}
            null_count += 1
            continue

        try:
            traits_raw = bytes.fromhex(record["traitsHex"].lower().removeprefix("0x"))
            if len(traits_raw) != TRAITS_BYTES:
                raise ValueError(f"traitsHex is {len(traits_raw)} bytes, expected {TRAITS_BYTES}")

            character = decode_slot(traits_raw, "character", reverse, token_id)
            eyes_trait = decode_slot(traits_raw, "eyes", reverse, token_id)
            glasses_trait = decode_slot(traits_raw, "glasses", reverse, token_id)
            palette_id = traits_raw[SLOT_INDICES["palette"]]

            grid = role_grid(record["pixelsHex"])
            rgba = decode_grid(record["pixelsHex"], record["traitsHex"])
            eye_coords = resolve_eyes(
                token_id, eyes_trait, character, face_regions, grid, head_variants
            )

            left, right, separable = split_left_right(eye_coords)
            skin = find_skin_sample(grid, eye_coords)
            closed_fill = closed_eye_fill(grid, rgba, skin, palette_id)

            expression = resolve_expression(token_id, expression_map)
            mouth_coords = face_regions["mouths"].get(expression)
            if mouth_coords is None:
                hard_fail(
                    f"token {token_id}: expression {expression!r} has no entry in face-regions.json mouths"
                )

            rig: dict[str, Any] = {
                "character": character,
                "eyesTrait": eyes_trait,
                "eyes": eye_coords,
                "eyeColors": sample_eye_colors(grid, rgba, eye_coords, palette_id),
                "closedEyeFill": closed_fill,
                "skinSample": skin,
                "glassesTrait": glasses_trait,
                "mouthTrait": expression,
                "mouth": mouth_coords,
                "mouthAnchor": mouth_anchor(mouth_coords),
            }
            if separable:
                rig["eyesLeft"] = left
                rig["eyesRight"] = right

            rig["rigHash"] = rig_hash(rig)
            rigs[key] = rig
            resolved += 1
        except SystemExit:
            raise
        except Exception as exc:
            failed_ids.append(token_id)
            print(f"  token {token_id}: {exc}", file=sys.stderr)

    if failed_ids:
        hard_fail(
            f"{len(failed_ids)} token(s) failed eye/mouth rig resolution: "
            f"{failed_ids[:50]}{'...' if len(failed_ids) > 50 else ''}"
        )

    output = {
        "version": "1.0.0",
        "grid": GRID,
        "source": {
            "mintData": "public/data/mint-data.json",
            "mintDataSha256": sha256_file(MINT_DATA_PATH),
            "faceRegions": "scripts/anim/face-regions.json",
            "faceRegionsSha256": sha256_file(FACE_REGIONS_PATH),
            "onChainTraitBytes": "chromies-engine/engine_data/on_chain_trait_bytes.json",
            "onChainTraitBytesSha256": sha256_file(ON_CHAIN_TRAIT_BYTES_PATH),
            "slotSchema": "chromies-engine/engine_data/slot_schema.json",
            "slotSchemaSha256": sha256_file(SLOT_SCHEMA_PATH),
            "legendaryTokenIds": "chromies-engine/scripts/persona/persona-tables.json",
            "legendaryTokenIdsSha256": sha256_file(LEGENDARY_TABLES_PATH),
        },
        "tokenCount": len(rigs),
        "stats": {
            "resolved": resolved,
            "null": null_count,
            "failed": len(failed_ids),
        },
        "legendaryTokenIds": sorted(legendary_ids),
        "notes": {
            "mouthSlot": "Mouth art is the compositor 'expression' slot (not on-chain). Names resolved via art-pipeline JS.",
            "eyesNone": "154 tokens with eyes=None use eye-role pixels (10/11/12) from committed pixelsHex.",
            "sequentialExpressionFallback": "Expression names from scripts/rig/_batch_expression_lookup.cjs (one sequential JS pass).",
        },
        "rigs": rigs,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(output, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    print(
        f"wrote {out_path} — resolved={resolved} null={null_count} failed={len(failed_ids)} "
        f"(legendaries={null_count})"
    )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Compile per-token facial rigs.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_PATH)
    args = parser.parse_args()
    compile_rigs(args.out)


if __name__ == "__main__":
    main()
