#!/usr/bin/env python3
"""Task 3 compile step: derive a real neutral -> smile expression-delta transition
for one mouth trait, and write scripts/anim/expression-transitions.json.

Reworked per "Rework Prototype onto Canonical Bytes + JS Compositor" (Task 2) to
eliminate chromies-engine's Python compositor from this path entirely -- it is
known to diverge from public/data/mint-data.json (see
scripts/verify/pipeline-parity-check.py). This script now only ever touches:
  - the token's own committed bytes (scripts/anim/_canonical_token_source.py --
    pure pixelsHex/traitsHex decode, no compositing, no RNG), for the BASE
    (neutral) frame, and
  - the REAL JS art-pipeline pipeline (scripts/anim/_expression_swap_source.py,
    which shells out to art-pipeline/_verify_single_token.cjs -- calls the real
    bridge-mint-data.js/generate.js functions verbatim via Node), for the TARGET
    (smile) frame.

Variant-aware matching fix: "expression" is not one name per role across the
whole collection -- each character family (art-pipeline/chromies-config.js
CHARACTERS[*].slotVariantPool.expression) has its own eligible pool
(Female_Neutral/Female_Smile/..., Chubby_Neutral/Chubby_Smile/..., Zombie/Agent
forced None, SideProfile Smile/Smirk only with no Neutral at all, Alien falling
through to the bare generic Neutral/Smile/Frown/None). Both the base ("Neutral"
role) and target ("Smile" role) variant names are resolved per-token, from that
token's own actual rolled character, via the real getEligibleVariants() (see
scripts/anim/_expression_swap_source.py::find_neutral_smile_candidate and
art-pipeline/_verify_single_token.cjs::expressionRoleVariants) -- never by
constructing a candidate name like f"{family}_Smile". A family with no
Smile-role variant is skipped, never forced onto some other family's art.
Legendary tokens are excluded before any per-token call (they route through
legendary-finals.js and have no render_picks to swap).

How the transition is derived (never hand-drawn pixels):

  1. Find a real token whose committed record's real "expression" render-pick IS
     its own character family's Neutral-role variant, where that same family also
     has a Smile-role variant -- read from the data (an isolated real-JS-pipeline
     call, self-verified byte-for-byte against that token's own committed
     pixelsHex/traitsHex before being trusted), never rerolled/guessed. Token 2
     (Female_Neutral, already self-verified in the earlier sanity pass) is tried
     first as the known-good, cheapest candidate -- see
     scripts/anim/_expression_swap_source.py::find_neutral_smile_candidate.
  2. Decode that *exact* token's real base frame straight from its committed bytes
     (scripts/anim/_canonical_token_source.py::canonical_grid_for_token).
  3. Re-verify that same token's isolated-JS fidelity one more time, then render it
     again through the real JS pipeline with ONLY its "expression" render-pick
     swapped to its family's real Smile-role variant name -- i.e. "this token, if
     it had rolled Smile instead of Neutral" -- via
     scripts/anim/_expression_swap_source.py::swap_expression. Every pixel in that
     render comes from the real Smile component asset for that family, composited
     through the token's own real palette by the real JS compositeChromie().
     Nothing is synthesized.
  4. Diff the real Neutral render against the real Smile render, restricted to the
     union of both variants' face-region coordinates (scripts/anim/face-regions.json,
     Task 1's output) -- see scripts/anim/expression_deltas.py::diff_to_delta.
  5. Split that diff into 3 cumulative steps (linear pixel reveal, ordered
     top-to-bottom/left-to-right) via expression_deltas.split_delta_into_steps.
     Step 3 is exactly the full diff (the target/smile state) -- not an
     approximation of it.

Placeholder-art flag: step 5's reveal *order* (which pixels appear in step 1 vs 2 vs
3) is a rule-derived pacing choice, not authored art -- every pixel and color is
real, but WHICH sub-set of real pixels appears at which intermediate step is an
arbitrary-but-deterministic split. This is exactly the kind of thing flagged in the
task as placeholder pacing pending JB's sign-off on final motion -- the pixels
themselves are not placeholder, only the reveal choreography is.

Usage:
    python scripts/anim/build-smile-transition.py
    python scripts/anim/build-smile-transition.py --scan-limit 500
    python scripts/anim/build-smile-transition.py --prefer-token-id 0   # disable the token-2 shortcut
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

from anim._canonical_token_source import canonical_grid_for_token, decode_grid, load_mint_records  # noqa: E402
from anim._expression_swap_source import find_neutral_smile_candidate, swap_expression  # noqa: E402
from anim.expression_deltas import diff_to_delta, pack_delta, split_delta_into_steps  # noqa: E402

FACE_REGIONS_PATH = SCRIPTS_ROOT / "anim" / "face-regions.json"
OUT_PATH = SCRIPTS_ROOT / "anim" / "expression-transitions.json"

N_STEPS = 3
DEFAULT_PREFER_TOKEN_ID = 2  # Female_Neutral, already self-verified in the earlier sanity pass.


def load_face_regions() -> dict:
    if not FACE_REGIONS_PATH.exists():
        raise SystemExit(
            f"{FACE_REGIONS_PATH} not found -- run scripts/anim/compile-face-regions.py first "
            f"(Task 1 must produce face-regions.json before a transition can be derived from it)."
        )
    return json.loads(FACE_REGIONS_PATH.read_text(encoding="utf-8"))


def region_union(face_regions: dict, trait_a: str, trait_b: str) -> list[list[int]]:
    coords_a = face_regions["mouths"].get(trait_a)
    coords_b = face_regions["mouths"].get(trait_b)
    if coords_a is None:
        raise SystemExit(f"mouth trait {trait_a!r} has no derived region in face-regions.json (flagged/missing)")
    if coords_b is None:
        raise SystemExit(f"mouth trait {trait_b!r} has no derived region in face-regions.json (flagged/missing)")
    seen = {tuple(p) for p in coords_a} | {tuple(p) for p in coords_b}
    return sorted([list(p) for p in seen], key=lambda p: (p[1], p[0]))


def build_transition(scan_limit: int, prefer_token_id: int | None) -> dict:
    face_regions = load_face_regions()
    mint_records = load_mint_records()

    candidate, flags = find_neutral_smile_candidate(
        list(range(1, scan_limit + 1)), mint_records, prefer_token_id=prefer_token_id
    )
    if flags:
        print(f"[build-smile-transition] scan flags ({len(flags)}):")
        for f in flags[:10]:
            print(f"  token {f['token_id']}: {f['reason']}")
    if candidate is None:
        raise SystemExit(
            f"No token found (within the first {scan_limit} ids, legendaries excluded) whose real "
            f"expression is its own character family's Neutral-role variant with a Smile-role "
            f"counterpart available -- increase --scan-limit."
        )

    token_id = candidate["token_id"]
    base_trait = candidate["neutral_variant"]
    target_trait = candidate["smile_variant"]

    region_coords = region_union(face_regions, base_trait, target_trait)

    base_grid = canonical_grid_for_token(token_id, mint_records)
    swapped = swap_expression(token_id, mint_records[token_id], target_trait)
    target_grid = decode_grid(swapped["pixelsHex"], swapped["traitsHex"])

    delta, palette = diff_to_delta(base_grid, target_grid, region_coords)
    if not delta:
        raise SystemExit(
            f"Diff between {base_trait!r} and {target_trait!r} on token {token_id} is empty -- "
            f"these two variants render identically in the derived region; refusing to fabricate a delta."
        )
    steps = split_delta_into_steps(delta, N_STEPS)

    packed_sizes = [len(pack_delta(step)) for step in steps]

    return {
        "_meta": {
            "schema_version": "1.0.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "base_trait": base_trait,
            "target_trait": target_trait,
            "derived_from_token_id": token_id,
            "derivation": "Real diff between the token's actual canonical-byte-decoded Neutral-role "
            "render (public/data/mint-data.json, pure decode) and the same token re-rendered with its "
            "own character family's Smile-role variant through the real JS art-pipeline compositor "
            "(self-verified isolated-JS fidelity check before the swap). base_trait/target_trait are "
            "the family-specific variant names actually resolved for this token (e.g. Female_Neutral/"
            "Female_Smile), via getEligibleVariants() -- never string-constructed. See "
            "build-smile-transition.py docstring.",
            "placeholder_flag": "Reveal choreography (which pixels land in step1/step2/step3) is a "
            "rule-derived linear top-to-bottom pixel reveal, NOT authored art -- pending JB sign-off "
            "on final motion. Every pixel color is real (sampled from the real Smile component asset "
            "through the token's own palette), only the step ORDER is a placeholder pacing choice.",
            "grid": 64,
            "n_steps": N_STEPS,
            "total_delta_pixels": len(delta),
            "packed_bytes_per_step": packed_sizes,
        },
        base_trait: {
            "target_trait": target_trait,
            "palette": [list(c) for c in palette],
            "steps": [[list(p) for p in step] for step in steps],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scan-limit", type=int, default=200)
    parser.add_argument(
        "--prefer-token-id", type=int, default=DEFAULT_PREFER_TOKEN_ID,
        help=f"Tried first, before falling back to scanning from token 1 (default: "
        f"{DEFAULT_PREFER_TOKEN_ID}, a known-good Female_Neutral candidate from the earlier sanity "
        f"pass). Pass 0 to disable and scan from token 1 only.",
    )
    args = parser.parse_args()
    prefer_token_id = args.prefer_token_id if args.prefer_token_id > 0 else None

    transitions = build_transition(args.scan_limit, prefer_token_id)
    OUT_PATH.write_text(json.dumps(transitions, indent=2) + "\n", encoding="utf-8")

    meta = transitions["_meta"]
    print(f"Wrote {OUT_PATH}")
    print(f"  {meta['base_trait']} -> {meta['target_trait']} (token {meta['derived_from_token_id']})")
    print(f"  total delta pixels: {meta['total_delta_pixels']}")
    print(f"  packed bytes per step: {meta['packed_bytes_per_step']}")


if __name__ == "__main__":
    main()
