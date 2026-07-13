#!/usr/bin/env python3
"""Compile step: derive per-trait face-region pixel coordinates from compiled trait
tables + real component art. Writes scripts/anim/face-regions.json.

Deliberately allowed to import chromies-engine -- unlike scripts/anim/catalogue.py,
scripts/anim/primitives.py and scripts/animate-scene.py (which never do, by design;
see scripts/anim/__init__.py), this script is a one-shot *compiler*, in the same
spirit as chromies-engine/export_traits_from_art_pipeline.py: it reads compiled
trait tables and real component PNGs once, offline, and writes a static JSON
artifact that the render path (primitives.py, expression_deltas.py, catalogue.py)
can consume later without ever importing chromies-engine at runtime. The only
chromies-engine import left (via scripts/anim/_canonical_token_source.py) is a
pure pixelsHex/traitsHex decode + on-chain-palette lookup -- chromies-engine's
Python *compositor* (the trait-rolling/RNG machinery known to diverge from
public/data/mint-data.json) is never imported anywhere in this script; see
scripts/verify/pipeline-parity-check.py for that divergence's standing report.

Trait-name sourcing -- compiled tables only, never a hand-maintained list (this is
exactly the class of bug documented for the mint encoder: sparse hand-typed byte
tables silently collapsing unknown names to 0; see reports/ENCODER_AUDIT.md):

  eyes   -- chromies-engine/engine_data/on_chain_trait_bytes.json, slots.eyes.bytes.
            This *is* the real on-chain compiled byte table (28 names).

  mouths -- There is no "mouth" slot anywhere in the trait system, on-chain or
            compositor. Mouth-like art is the compositor's "expression" slot, and
            "expression" is deliberately NOT on-chain encoded (absent from
            on_chain_trait_bytes.json entirely -- confirmed by inspection, not
            assumed). This script treats "expression" as the mouth-trait family and
            records that substitution in face-regions.json["_meta"]["mouth_slot_flag"]
            rather than inventing a "mouth" slot that does not exist. Names + file
            paths for "expression" come from chromies-engine/engine_data/
            slot_schema.json, which is itself a *compiled* artifact (produced by
            chromies-engine/export_traits_from_art_pipeline.py from
            art-pipeline/traits.json + on-disk verification), not a hand-typed list.

Pixel derivation: for each resolved trait variant, the real component PNG under
art-pipeline/components/ is opened and every pixel with alpha > 0 is recorded as
occupied -- never a bounding box, never a hand-typed shape. Before use, each source
PNG's sha256 is recomputed from disk and checked against BOTH
art-pipeline/components/COMPONENTS_MANIFEST.json and slot_schema.json's own recorded
sha256. Any mismatch halts that trait (recorded in "_flags") -- it is never silently
overwritten or guessed past.

Sanity check (--sanity-tokens, default 3): base sprites come straight from
public/data/mint-data.json's committed bytes (scripts/anim/_canonical_token_source.py
-- pure pixelsHex/traitsHex decode, no compositing, no RNG; the bytes ARE the
ground truth, so there is nothing to "verify" about them). "Expression" (mouth
trait) is NOT on-chain encoded, so it can't be read out of those same bytes --
determining it requires asking the real trait-rolling code what it picked, which
this script does via scripts/anim/_expression_swap_source.py: an isolated
(fresh-guard) call to the real JS art-pipeline pipeline, self-verified
byte-for-byte against the token's own committed record before its "expression"
pick is trusted for anything (see that module's docstring). Tokens that fail
that verification are silently skipped (expected -- see docstring), never
guessed at. Coordinates are then overlaid on the real canonical-decode PNG for N
tokens with distinct mouth traits. Output goes to a scratch dir, never into
art-pipeline/output.

The old bulk chromies-engine-vs-mint-data.json verification scan that used to
gate this script is no longer part of the compile step (see Task 1 of "Rework
Prototype onto Canonical Bytes + JS Compositor" -- chromies-engine's Python
compositor is eliminated from this and every other payload-critical path here).
That comparison still exists, permanently, as an opt-in report-only tool: pass
--parity-check to run it (off by default) -- see
scripts/verify/pipeline-parity-check.py.

Usage:
    python scripts/anim/compile-face-regions.py
    python scripts/anim/compile-face-regions.py --sanity-tokens 3 --scan-limit 200
    python scripts/anim/compile-face-regions.py --parity-check --parity-start 1 --parity-end 200
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_ROOT.parent
ANIM_ROOT = SCRIPTS_ROOT / "anim"
ENGINE_ROOT = REPO_ROOT / "chromies-engine"
PARITY_CHECK_SCRIPT = SCRIPTS_ROOT / "verify" / "pipeline-parity-check.py"
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

# Allowed here only -- this is the compile step. See module docstring. Both of
# these are pure-decode / self-verifying-JS helpers, not the Python compositor.
from anim._canonical_token_source import canonical_grid_for_token, load_mint_records  # noqa: E402
from anim._expression_swap_source import find_canonical_tokens_by_expression  # noqa: E402

ENGINE_DATA = ENGINE_ROOT / "engine_data"
COMPONENTS_ROOT = REPO_ROOT / "art-pipeline" / "components"
COMPONENTS_MANIFEST = COMPONENTS_ROOT / "COMPONENTS_MANIFEST.json"
ON_CHAIN_TRAIT_BYTES = ENGINE_DATA / "on_chain_trait_bytes.json"
SLOT_SCHEMA = ENGINE_DATA / "slot_schema.json"

OUT_PATH = ANIM_ROOT / "face-regions.json"
SANITY_OUT_DIR = REPO_ROOT / "out" / "anim" / "face-regions-review"

GRID = 64
SANITY_SCALE = 12


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_manifest_hashes() -> dict[str, str]:
    manifest = load_json(COMPONENTS_MANIFEST)
    return {entry["path"]: entry["sha256"] for entry in manifest.get("files", [])}


def merged_slot_variants(slot_schema: dict[str, Any], slot_name: str) -> dict[str, dict[str, Any]]:
    """Merge front-facing + side-profile variants for `slot_name` into one name->variant map."""
    out: dict[str, dict[str, Any]] = {}
    front = slot_schema.get("slots", {}).get(slot_name, {}).get("variants", [])
    for v in front:
        if v.get("name"):
            out[v["name"]] = v
    sp = (
        slot_schema.get("side_profile_pipeline", {})
        .get("slots", {})
        .get(slot_name, {})
        .get("variants", [])
    )
    for v in sp:
        if v.get("name"):
            out.setdefault(v["name"], v)
    return out


def alpha_coords(png_path: Path) -> list[list[int]]:
    """Every (x, y) with alpha > 0 -- the real occupied-pixel footprint, sorted (y, x)."""
    with Image.open(png_path) as im:
        arr = np.array(im.convert("RGBA"), dtype=np.uint8)
    if arr.shape[0] != GRID or arr.shape[1] != GRID:
        raise ValueError(f"{png_path}: {arr.shape[1]}x{arr.shape[0]}, expected {GRID}x{GRID}")
    ys, xs = np.where(arr[:, :, 3] > 0)
    coords = [[int(x), int(y)] for x, y in zip(xs.tolist(), ys.tolist())]
    coords.sort(key=lambda p: (p[1], p[0]))
    return coords


def verify_source_png(
    rel_path: str,
    variant: dict[str, Any],
    manifest_hashes: dict[str, str],
) -> tuple[Path | None, str | None]:
    """Return (resolved_absolute_path, error) -- error is None iff every check passed."""
    abs_path = COMPONENTS_ROOT / rel_path
    if not abs_path.is_file():
        return None, f"source PNG not found on disk: art-pipeline/components/{rel_path}"

    actual_sha256 = sha256_of(abs_path)

    slot_schema_sha256 = variant.get("sha256")
    if slot_schema_sha256 and slot_schema_sha256 != actual_sha256:
        return None, (
            f"sha256 mismatch vs slot_schema.json for {rel_path}: "
            f"disk={actual_sha256} slot_schema={slot_schema_sha256} (slot_schema.json is stale -- "
            f"halting rather than trusting a possibly-renamed/edited asset)"
        )

    manifest_sha256 = manifest_hashes.get(rel_path)
    if manifest_sha256 is None:
        return None, f"{rel_path} has no entry in COMPONENTS_MANIFEST.json -- cannot verify integrity"
    if manifest_sha256 != actual_sha256:
        return None, (
            f"sha256 mismatch vs COMPONENTS_MANIFEST.json for {rel_path}: "
            f"disk={actual_sha256} manifest={manifest_sha256}"
        )

    return abs_path, None


def build_region_table(
    names: list[str],
    variants_by_name: dict[str, dict[str, Any]],
    manifest_hashes: dict[str, str],
    slot_label: str,
    flags: list[dict[str, str]],
) -> dict[str, list[list[int]]]:
    regions: dict[str, list[list[int]]] = {}
    for name in sorted(names):
        variant = variants_by_name.get(name)
        if variant is None:
            flags.append(
                {
                    "slot": slot_label,
                    "trait": name,
                    "reason": "no matching variant found in slot_schema.json (front or side-profile) "
                    "for this compiled trait name -- cannot derive deterministically",
                }
            )
            continue
        if not variant.get("on_disk", False):
            flags.append(
                {
                    "slot": slot_label,
                    "trait": name,
                    "reason": f"slot_schema.json marks on_disk=false for file "
                    f"{variant.get('file')!r} -- cannot derive from a missing asset",
                }
            )
            continue

        rel_path = variant.get("resolved_path") or variant.get("file")
        rel_path = str(rel_path).replace("\\", "/")
        resolved, error = verify_source_png(rel_path, variant, manifest_hashes)
        if error:
            flags.append({"slot": slot_label, "trait": name, "reason": error})
            continue

        try:
            regions[name] = alpha_coords(resolved)
        except ValueError as exc:
            flags.append({"slot": slot_label, "trait": name, "reason": str(exc)})

    return regions


def load_eyes_trait_names() -> list[str]:
    table = load_json(ON_CHAIN_TRAIT_BYTES)
    eyes_slot = table.get("slots", {}).get("eyes")
    if eyes_slot is None:
        raise SystemExit(
            "on_chain_trait_bytes.json has no 'eyes' slot -- compiled eyes byte table is missing "
            "or the schema changed; refusing to guess trait names."
        )
    return list(eyes_slot["bytes"].keys())


def compile_face_regions() -> tuple[dict[str, Any], list[dict[str, str]]]:
    manifest_hashes = load_manifest_hashes()
    slot_schema = load_json(SLOT_SCHEMA)

    flags: list[dict[str, str]] = []

    eyes_names = load_eyes_trait_names()
    eyes_variants = merged_slot_variants(slot_schema, "eyes")
    eyes_regions = build_region_table(eyes_names, eyes_variants, manifest_hashes, "eyes", flags)

    mouth_variants = merged_slot_variants(slot_schema, "expression")
    mouth_names = [
        name
        for name, v in mouth_variants.items()
        if not v.get("excluded_normie", False)
    ]
    mouth_regions = build_region_table(mouth_names, mouth_variants, manifest_hashes, "mouths", flags)

    face_regions = {
        "_meta": {
            "schema_version": "1.0.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "grid": GRID,
            "eyes_trait_source": "chromies-engine/engine_data/on_chain_trait_bytes.json "
            "(slots.eyes.bytes) -- real on-chain compiled byte table",
            "mouths_trait_source": "chromies-engine/engine_data/slot_schema.json "
            "(slots.expression + side_profile_pipeline.slots.expression) -- compiled from "
            "art-pipeline/traits.json by chromies-engine/export_traits_from_art_pipeline.py",
            "mouth_slot_flag": "No 'mouth' slot exists anywhere in the trait system (on-chain or "
            "compositor). Mouth-like art is the compositor's 'expression' slot, which is NOT "
            "on-chain encoded (absent from on_chain_trait_bytes.json). 'mouths' below is "
            "'expression' under the name this task asked for -- flagging the substitution rather "
            "than inventing a 'mouth' slot that does not exist.",
            "pixel_rule": "alpha > 0 on the real component PNG under art-pipeline/components/, "
            "sha256-verified against slot_schema.json and COMPONENTS_MANIFEST.json before use. "
            "Never a bounding box; never hand-typed.",
        },
        "eyes": eyes_regions,
        "mouths": mouth_regions,
        "_flags": flags,
    }
    return face_regions, flags


# ---------------------------------------------------------------------------
# Sanity check: real tokens, real compositor, coordinate overlay for review.
# ---------------------------------------------------------------------------


def _label_font() -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=14)
    except TypeError:
        return ImageFont.load_default()


def find_sample_tokens(scan_limit: int, want: int) -> list[dict[str, Any]]:
    """Scan token_ids 1..scan_limit for up to `want` tokens with distinct real
    "expression" (mouth) traits (scripts/anim/_expression_swap_source.py --
    self-verified against public/data/mint-data.json before being trusted), and
    decode each one's base sprite straight from its committed pixelsHex/traitsHex
    (scripts/anim/_canonical_token_source.py -- no compositing, no RNG)."""
    mint_records = load_mint_records()
    found, scan_flags = find_canonical_tokens_by_expression(
        list(range(1, scan_limit + 1)), mint_records, want_count=want
    )

    if scan_flags:
        print(f"[compile-face-regions] sanity scan flags ({len(scan_flags)}):")
        for f in scan_flags[:10]:
            print(f"  token {f['token_id']}: {f['reason']}")

    return [
        {
            "token_id": token_id,
            "mouth_trait": trait,
            "image_rgba": canonical_grid_for_token(token_id, mint_records),
        }
        for trait, token_id in found.items()
    ]


def render_sanity_overlay(
    token_id: int,
    mouth_trait: str,
    image_rgba: np.ndarray,
    coords: list[list[int]],
    out_dir: Path,
) -> Path:
    rgb = image_rgba[:, :, :3].astype(np.uint8)
    upscaled = np.repeat(np.repeat(rgb, SANITY_SCALE, axis=0), SANITY_SCALE, axis=1)
    img = Image.fromarray(upscaled, mode="RGB").convert("RGBA")

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    marker_color = (255, 0, 200, 220)
    for x, y in coords:
        x0, y0 = x * SANITY_SCALE, y * SANITY_SCALE
        draw.rectangle([x0, y0, x0 + SANITY_SCALE - 1, y0 + SANITY_SCALE - 1], outline=marker_color, width=2)

    font = _label_font()
    draw.text((4, 4), f"token {token_id} -- mouth={mouth_trait} ({len(coords)} px)", fill=(0, 0, 0, 255), font=font)

    composited = Image.alpha_composite(img, overlay).convert("RGB")
    out_path = out_dir / f"token_{token_id:04d}_{mouth_trait}.png"
    out_dir.mkdir(parents=True, exist_ok=True)
    composited.save(out_path)
    return out_path


def run_parity_check(parity_start: int, parity_end: int) -> None:
    """Optional, off-by-default: shells out to the permanent, standalone parity
    harness (scripts/verify/pipeline-parity-check.py) -- see that script's
    docstring for what it compares and why this compile step no longer gates on
    it. Report-only; never affects this script's own exit status."""
    if not PARITY_CHECK_SCRIPT.exists():
        print(f"[compile-face-regions] --parity-check requested but {PARITY_CHECK_SCRIPT} is missing")
        return
    print(f"\n[compile-face-regions] --parity-check: running scripts/verify/pipeline-parity-check.py "
          f"for tokens {parity_start}..{parity_end} (report-only; see that script's own report file)")
    proc = subprocess.run(
        [sys.executable, str(PARITY_CHECK_SCRIPT), "--start", str(parity_start), "--end", str(parity_end)],
        cwd=str(REPO_ROOT),
    )
    if proc.returncode != 0:
        print(f"[compile-face-regions] pipeline-parity-check.py exited {proc.returncode} "
              f"(non-fatal here -- it is report-only and never gates this script)")


def run_sanity_check(face_regions: dict[str, Any], sanity_tokens: int, scan_limit: int) -> None:
    samples = find_sample_tokens(scan_limit, sanity_tokens)
    if not samples:
        print(f"[compile-face-regions] sanity check: no verified sample tokens found in first {scan_limit} ids")
        return

    print(f"[compile-face-regions] sanity check: {len(samples)} token(s) with distinct mouth traits")
    for sample in samples:
        mouth_trait = sample["mouth_trait"]
        coords = face_regions["mouths"].get(mouth_trait)
        if coords is None:
            print(f"  token {sample['token_id']}: mouth trait {mouth_trait!r} has no derived region (flagged) -- skipping overlay")
            continue
        out_path = render_sanity_overlay(
            sample["token_id"], mouth_trait, sample["image_rgba"], coords, SANITY_OUT_DIR
        )
        print(f"  token {sample['token_id']} (mouth={mouth_trait}, {len(coords)} px): {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sanity-tokens", type=int, default=3)
    parser.add_argument("--scan-limit", type=int, default=200, help="Max token_id to scan for sanity-check samples.")
    parser.add_argument("--skip-sanity", action="store_true")
    parser.add_argument(
        "--parity-check", action="store_true",
        help="Also run the optional, off-by-default chromies-engine-vs-JS-vs-mint-data.json parity "
        "harness (scripts/verify/pipeline-parity-check.py). Report-only; never gates this script.",
    )
    parser.add_argument("--parity-start", type=int, default=1)
    parser.add_argument("--parity-end", type=int, default=200)
    args = parser.parse_args()

    face_regions, flags = compile_face_regions()

    OUT_PATH.write_text(json.dumps(face_regions, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(f"  eyes traits derived: {len(face_regions['eyes'])}")
    print(f"  mouth traits derived: {len(face_regions['mouths'])}")
    print(f"  flags: {len(flags)}")
    for f in flags:
        print(f"    [{f['slot']}] {f['trait']}: {f['reason']}")

    if not args.skip_sanity:
        run_sanity_check(face_regions, args.sanity_tokens, args.scan_limit)

    if args.parity_check:
        run_parity_check(args.parity_start, args.parity_end)


if __name__ == "__main__":
    main()
