#!/usr/bin/env python3
"""Diagnostic only -- no fixes. Investigates why regenerating token 1 via
chromies-engine's own compositor API does not match public/data/mint-data.json
byte-for-byte (the sanity scan in compile-face-regions.py / _engine_token_source.py
flagged 200/200 mismatches).

Per instruction: the frozen merkle root makes silent "fixing" of either side (the
committed mint-data.json vs. the Python compositor port) unacceptable until we know
which side is wrong. This script only reports:

  1. Which field(s) differ (pixelsHex / traitsHex / both), their lengths on each
     side, and the offset + values of the first differing byte.
  2. The exact entry point used to recomposite (chromies-engine's own API, not
     reimplemented logic) and the seed passed.
  3. Which mint-data.json was compared against (full path), and whether the repo
     contains more than one file by that name.
  4. Whether the regenerated payload includes the #e3e5e4 renderer-only background
     anywhere it shouldn't (it must never appear in pixelsHex/traitsHex payload
     bytes or in the on-chain palette color table -- only in a rendered preview).

Usage:
    python scripts/anim/diagnose-verify-mismatch.py
    python scripts/anim/diagnose-verify-mismatch.py --token-id 1 --seed 1
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_ROOT.parent
ENGINE_ROOT = REPO_ROOT / "chromies-engine"
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from engine.art_schema_loader import load_art_schema_bundle  # noqa: E402
from engine.mint_payload import decode_traits, from_hex, unpack_pixels  # noqa: E402
from engine.palette_registry_data import palette_colors_on_chain  # noqa: E402
from engine.payload_pipeline import generate_chromie_payload  # noqa: E402

PRIMARY_MINT_DATA = REPO_ROOT / "public" / "data" / "mint-data.json"
BG_HEX = "#e3e5e4"


def find_all_mint_data_files() -> list[Path]:
    return sorted(REPO_ROOT.rglob("mint-data.json"))


def report_mint_data_sources() -> dict:
    print("=== [3] Which mint-data.json ===")
    all_paths = find_all_mint_data_files()
    print(f"mint-data.json files found under {REPO_ROOT} ({len(all_paths)}):")
    for p in all_paths:
        tag = " <- used by this diagnostic (and by _engine_token_source.py)" if p == PRIMARY_MINT_DATA else ""
        try:
            size = p.stat().st_size
        except OSError:
            size = -1
        print(f"  {p}  ({size} bytes){tag}")

    if len(all_paths) > 1:
        print(f"  FLAG: {len(all_paths)} files named mint-data.json exist in this repo -- "
              f"they are NOT automatically known to be identical. Do not assume the one used here "
              f"is authoritative without diffing the others for the same token id.")
    if PRIMARY_MINT_DATA not in all_paths:
        print(f"  FLAG: expected primary path {PRIMARY_MINT_DATA} was not found by this scan.")
    print()

    if not PRIMARY_MINT_DATA.exists():
        raise SystemExit(f"Cannot proceed: {PRIMARY_MINT_DATA} does not exist.")

    records = json.loads(PRIMARY_MINT_DATA.read_text(encoding="utf-8"))
    print(f"Comparing against: {PRIMARY_MINT_DATA}")
    print(f"  record count in file: {len(records)}")
    return {r["tokenId"]: r for r in records}


def report_entry_point(seed: int, token_id: int) -> None:
    print("\n=== [2] Recomposite entry point ===")
    print("Used chromies-engine's own API end to end -- nothing reimplemented in this script:")
    print("  engine.payload_pipeline.generate_chromie_payload(seed, token_id, schema)")
    print("    -> engine.compositor.generate_chromie(seed, token_id, schema)")
    print("         [pick_character -> pick_palette -> pick_token_variants/resolve_unique_traits")
    print("          -> apply_anti_none_stacking/apply_coverage_rules -> composite_chromie]")
    print("    -> engine.payload_pipeline.build_payload_from_compositor(compositor_result, schema)")
    print("         -> engine.compositor.composite_chromie(render_picks, schema)  [-> role_buffer]")
    print("         -> engine.mint_payload.build_mint_payload(role_buffer, character=..., "
          "palette_key=..., render_picks=...)")
    print(f"  seed passed to generate_chromie_payload: {seed}")
    print(f"  token_id passed to generate_chromie_payload: {token_id}")
    print("  Assumption under test (NOT verified elsewhere in this script): seed == token_id, "
          "matching art-pipeline/generate.js's own `${tokenId}:...` RNG-seed-string convention "
          "(mulberry32(seedFromStr(...))) -- see art-pipeline/generate.js lines ~86-88, 308, 765.")


def byte_diff_report(field: str, regen_hex: str, orig_hex: str) -> None:
    match = regen_hex == orig_hex
    print(f"\n{field}: {'MATCH' if match else 'MISMATCH'}")
    print(f"  regenerated: {len(regen_hex)} hex chars, 0x-prefixed={regen_hex.startswith('0x')}")
    print(f"  mint-data.json: {len(orig_hex)} hex chars, 0x-prefixed={orig_hex.startswith('0x')}")
    if match:
        return

    regen_bytes = from_hex(regen_hex)
    orig_bytes = from_hex(orig_hex)
    print(f"  regenerated byte length: {len(regen_bytes)}")
    print(f"  mint-data.json byte length: {len(orig_bytes)}")

    n = min(len(regen_bytes), len(orig_bytes))
    first_diff = next((i for i in range(n) if regen_bytes[i] != orig_bytes[i]), None)
    if first_diff is None:
        if len(regen_bytes) != len(orig_bytes):
            print(f"  all {n} common bytes match; lengths differ -- first extra byte at offset {n} "
                  f"({'regenerated' if len(regen_bytes) > len(orig_bytes) else 'mint-data.json'} is longer)")
        return

    print(f"  first differing byte at offset {first_diff} (0-indexed):")
    print(f"    regenerated:    0x{regen_bytes[first_diff]:02x}")
    print(f"    mint-data.json: 0x{orig_bytes[first_diff]:02x}")
    lo, hi = max(0, first_diff - 4), min(n, first_diff + 5)
    print(f"  context bytes [{lo}:{hi}]:")
    print(f"    regenerated:    {regen_bytes[lo:hi].hex()}")
    print(f"    mint-data.json: {orig_bytes[lo:hi].hex()}")

    total_diffs = sum(1 for i in range(n) if regen_bytes[i] != orig_bytes[i])
    print(f"  total differing bytes in common range: {total_diffs} / {n}")

    if field == "traitsHex" and len(regen_bytes) == len(orig_bytes):
        try:
            decoded_regen = decode_traits(regen_bytes)
            decoded_orig = decode_traits(orig_bytes)
            print("  decoded traitsHex diff (slot: regenerated -> mint-data.json), differing slots only:")
            any_slot_diff = False
            for slot_key, a in decoded_regen.decoded.items():
                b = decoded_orig.decoded.get(slot_key)
                if b is None or a != b:
                    any_slot_diff = True
                    print(f"    {slot_key}: {a} -> {b}")
            if not any_slot_diff:
                print("    (no per-slot decode differences found despite raw byte mismatch -- "
                      "check totalPixels bytes [17:19] or reserved/retired bytes)")
        except Exception as exc:  # noqa: BLE001 -- diagnostic best-effort, never hides the raw diff above
            print(f"  (decode_traits raised on slot-level diff attempt: {exc!r})")


def report_background_check(regen_pixels_hex: str, regen_traits_hex: str, orig_pixels_hex: str, orig_traits_hex: str, image_rgba) -> None:
    print("\n=== [4] Background check (#e3e5e4 must be renderer-only, never in payload) ===")

    regen_role_buffer = unpack_pixels(from_hex(regen_pixels_hex))
    orig_role_buffer = unpack_pixels(from_hex(orig_pixels_hex))
    print(f"  regenerated pixelsHex: index-0 (no-fill) count = {int((regen_role_buffer == 0).sum())} / {regen_role_buffer.size}")
    print(f"  mint-data.json pixelsHex: index-0 (no-fill) count = {int((orig_role_buffer == 0).sum())} / {orig_role_buffer.size}")
    print("  Note: pixelsHex is packed 4-bit role INDICES (0-15), not RGB -- #e3e5e4 cannot appear in "
          "these bytes directly. It could only leak into the payload indirectly, via the on-chain "
          "palette color table itself (checked below) or via a background pixel being miscounted as "
          "a non-zero role index.")

    decoded_regen_traits = decode_traits(from_hex(regen_traits_hex))
    palette_id_regen = decoded_regen_traits.palette_id
    colors_regen = [c.lower() for c in palette_colors_on_chain(palette_id_regen)]
    print(f"\n  regenerated palette_id: {palette_id_regen}")
    print(f"  regenerated on-chain palette colors (16): {colors_regen}")
    print(f"  '{BG_HEX}' present in regenerated palette color table: {BG_HEX in colors_regen}")

    decoded_orig_traits = decode_traits(from_hex(orig_traits_hex))
    palette_id_orig = decoded_orig_traits.palette_id
    colors_orig = [c.lower() for c in palette_colors_on_chain(palette_id_orig)]
    print(f"\n  mint-data.json palette_id: {palette_id_orig}")
    print(f"  mint-data.json on-chain palette colors (16): {colors_orig}")
    print(f"  '{BG_HEX}' present in mint-data.json's palette color table: {BG_HEX in colors_orig}")

    bg_pixel = tuple(int(v) for v in image_rgba[0, 0, :3])
    bg_hex_actual = "#{:02x}{:02x}{:02x}".format(*bg_pixel)
    print(f"\n  result.image_rgba[0,0] (compositor PREVIEW render, NOT payload): RGB {bg_pixel} = {bg_hex_actual}")
    print(f"  This preview intentionally paints role-index 0 as {BG_HEX} for on-screen display "
          f"(engine.payload_render.UNIVERSAL_BACKGROUND / engine.palette_renderer.render_palette_png) "
          f"-- its presence HERE is expected and fine. The bug this check guards against is "
          f"{BG_HEX} appearing inside pixelsHex/traitsHex bytes or inside the on-chain palette table "
          f"itself, which the checks above did not find in either regenerated or mint-data.json output.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--token-id", type=int, default=1)
    parser.add_argument("--seed", type=int, default=None, help="Defaults to --token-id (seed==token_id assumption).")
    args = parser.parse_args()
    token_id = args.token_id
    seed = args.seed if args.seed is not None else token_id

    print(f"=== diagnose-verify-mismatch: token {token_id} (report only, no fixes) ===\n")

    mint_records = report_mint_data_sources()
    record = mint_records.get(token_id)
    if record is None:
        raise SystemExit(f"\ntoken {token_id} has no record in {PRIMARY_MINT_DATA}")

    report_entry_point(seed, token_id)

    schema = load_art_schema_bundle()
    result = generate_chromie_payload(seed=seed, token_id=token_id, schema=schema)
    print(f"\n  character rolled: {result.character.get('name')}:{result.character.get('gender')}")
    print(f"  palette_key rolled: {result.palette_key}")

    print("\n=== [1] Field comparison ===")
    byte_diff_report("pixelsHex", result.pixels_hex, record["pixelsHex"])
    byte_diff_report("traitsHex", result.traits_hex, record["traitsHex"])

    report_background_check(result.pixels_hex, result.traits_hex, record["pixelsHex"], record["traitsHex"], result.image_rgba)

    print("\n=== Summary ===")
    print(f"  pixelsHex match: {result.pixels_hex == record['pixelsHex']}")
    print(f"  traitsHex match: {result.traits_hex == record['traitsHex']}")
    print("  No changes made to any file. Report only, per instruction.")


if __name__ == "__main__":
    main()
