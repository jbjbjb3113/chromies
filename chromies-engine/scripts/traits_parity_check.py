#!/usr/bin/env python3
"""
Traits-level parity gate — baseline seeds.

For each seed: rolled trait vector → encode → traitsHex → decode must round-trip
to the same semantic values (palette_key, variant names, character key).

This is the regression net the pixel parity harness was missing.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine.batch_guards import character_key
from engine.mint_payload import TRAIT_SLOT_SPECS, _pick_variant_name, decode_traits, encode_traits
from engine.payload_pipeline import generate_chromie_payload


def expected_trait_values(result) -> dict[str, str]:
    out: dict[str, str] = {}
    for slot in TRAIT_SLOT_SPECS:
        key = slot["key"]
        if slot["source"] == "retired":
            continue
        if slot["source"] == "character":
            out[key] = character_key(result.character)
        elif slot["source"] == "palette":
            out[key] = str(result.palette_key or "SIGNAL").upper()
        else:
            out[key] = _pick_variant_name(result.render_picks, key)
    return out


def check_seed(seed: int) -> list[str]:
    result = generate_chromie_payload(seed, seed)
    expected = expected_trait_values(result)
    traits_hex = result.traits_hex
    decoded = decode_traits(result.payload.traits_packed)

    errors: list[str] = []
    if result.encode_warnings:
        errors.append(f"encode warnings: {result.encode_warnings}")

    reencoded = encode_traits(
        character=result.character,
        palette_key=result.palette_key,
        render_picks=result.render_picks,
    )
    if reencoded.bytes != result.payload.traits_packed[:32]:
        # total_pixels bytes [17:19] may differ if we only compare trait slots — compare slots 0-16
        for slot in TRAIT_SLOT_SPECS:
            idx = slot["index"]
            if idx > 16:
                continue
            if reencoded.bytes[idx] != result.payload.traits_packed[idx]:
                errors.append(
                    f"slot {slot['key']}[{idx}] reencode {reencoded.bytes[idx]} != payload {result.payload.traits_packed[idx]}"
                )

    for key, exp in expected.items():
        got = decoded.decoded.get(key, {}).get("value")
        if got != exp:
            errors.append(f"{key}: decoded {got!r} != rolled {exp!r}")

    roundtrip = decode_traits(reencoded.bytes)
    for key, exp in expected.items():
        got = roundtrip.decoded.get(key, {}).get("value")
        if got != exp:
            errors.append(f"{key}: roundtrip {got!r} != rolled {exp!r}")

    if errors:
        return [f"seed {seed} traitsHex={traits_hex}"] + errors
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description="TraitsHex semantic round-trip parity")
    parser.add_argument("--seed-start", type=int, default=1)
    parser.add_argument("--count", type=int, default=1011)
    args = parser.parse_args()

    failures: list[str] = []
    for i in range(args.count):
        seed = args.seed_start + i
        failures.extend(check_seed(seed))

    if failures:
        print(f"FAIL — {len(failures)} issue(s) in traits parity check:", file=sys.stderr)
        for line in failures[:40]:
            print(f"  {line}", file=sys.stderr)
        if len(failures) > 40:
            print(f"  … and {len(failures) - 40} more", file=sys.stderr)
        return 1

    print(f"PASS — traits parity {args.count}/{args.count} (seeds {args.seed_start}–{args.seed_start + args.count - 1})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
