"""Pipeline Parity Check (report-only, permanent artifact).

Standing guard for the parked Track 2 ruling ("does chromies-engine's Python
compositor need to match the real JS art-pipeline trait-rolling, and if so how")
and for any future engine work: for a parameterized range of token ids, 3-way
compares:

  1. public/data/mint-data.json      -- the committed, authoritative record.
  2. chromies-engine (Python), isolated (batch=None -- no dedupe/comboCap reroll
     state; engine.payload_pipeline.generate_chromie_payload(seed=token_id,
     token_id=token_id)).
  3. The REAL JS art-pipeline/bridge-mint-data.js::buildMintRecord(), also run in
     isolation (fresh guards; art-pipeline/_verify_single_token.cjs -- calls the
     real function verbatim via Node, nothing reimplemented in Python).

History: this 3-way comparison started as a bulk 200-token verification scan
inside scripts/anim/compile-face-regions.py / _engine_token_source.py, built to
diagnose a "sanity scan failed 200/200" report. The finding (see
chromies-engine's own seed-derivation docstring, ported into this file's
docstring below) was that chromies-engine's isolated regeneration and
mint-data.json's real (sequential, guarded) production run are NOT expected to
match for every token, by design -- so the scan is not a pass/fail gate for the
anim prototype's compile steps any more (Task 1 of "Rework Prototype onto
Canonical Bytes + JS Compositor" moved those compile steps onto direct
mint-data.json byte-decoding instead -- see scripts/anim/_canonical_token_source.py
and scripts/anim/_expression_swap_source.py). This script is that comparison's
permanent, parameterized, standalone home -- it is not on the critical path of
any render/build script; run it manually to characterize the Python-vs-JS
divergence over any token range.

Roll-id / seed convention (VERIFIED, not hypothesized): the real batch/regen
script for public/data/mint-data.json is art-pipeline/bridge-mint-data.js's
buildMintRecord()/buildMintRecordOnce(), which sets `rollId = rollTokenId ||
tokenId` (bridge-mint-data.js:199) -- i.e. plain `tokenId` for every
non-legendary, non-payload-dedupe-reroll token -- and art-pipeline/generate.js
rolls each slot as `mulberry32(seedFromStr(\`${rollId}:${slot}${seedSuffix}\`))`
(generate.js:1595, same convention for character/palette). chromies-engine's
compositor.py already threads this identically: `generate_chromie(seed,
token_id, ...)` sets `roll_id = seed` and rolls each slot as
`mulberry32(seed_from_str(f"{roll_id}:{slot}{seed_suffix}"))`. So
`generate_chromie_payload(seed=token_id, token_id=token_id, ...)` below already
reproduces the real seed convention exactly -- there is no bare-int-vs-suffixed-
string divergence left to find.

Known, VERIFIED (not guessed) reason chromies-engine can still diverge from
public/data/mint-data.json for a given token even with the seed convention
right: engine/batch_guards.py::resolve_unique_traits() takes a `batch` argument,
and generate_chromie_payload/generate_chromie always call it with `batch=None`
(chromies-engine never constructs a BatchGuardContext for a single-token
regeneration) -- and resolve_unique_traits explicitly short-circuits when
`batch is None`: it returns the token's raw first-roll picks with *no*
dedupe-reroll or combo-cap-reroll applied at all. The real production path
(bridge-mint-data.js's buildMintRecord, called by regen-5150-excl-legendary.js
and by the canonical mint-data batch write) always runs with live
TraitDedupeGuard/ComboCapGuard state accumulated sequentially across the entire
5,150-token run -- so any token whose real roll got rerolled by dedupe or
combo-cap will never match an isolated (batch=None) regeneration, regardless of
seed. This is a batch-state gap, not a seed bug. diagnose_mismatch() below tells
the two apart on an actual mismatch (does isolated-JS also fail to match
mint-data.json?) rather than guessing.

Usage:
    py scripts/verify/pipeline-parity-check.py
    py scripts/verify/pipeline-parity-check.py --start 1 --end 200
    py scripts/verify/pipeline-parity-check.py --start 4000 --end 4050 --diagnose-first-n-failures 5
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
ENGINE_ROOT = REPO_ROOT / "chromies-engine"
ART_PIPELINE = REPO_ROOT / "art-pipeline"
SINGLE_TOKEN_HELPER = ART_PIPELINE / "_verify_single_token.cjs"
REPORT_PATH = SCRIPT_PATH.parent / "pipeline-parity-check-report.txt"
MINT_DATA = REPO_ROOT / "public" / "data" / "mint-data.json"

if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from engine.art_schema_loader import ArtSchemaBundle, load_art_schema_bundle  # noqa: E402
from engine.mint_payload import decode_traits, from_hex  # noqa: E402
from engine.payload_pipeline import PayloadGenerationResult, generate_chromie_payload  # noqa: E402

report_lines: list[str] = []


def log(line: str = "") -> None:
    print(line)
    report_lines.append(line)


def hr(title: str = "") -> None:
    log("")
    log("=" * 88)
    if title:
        log(title)
        log("=" * 88)


# ---------------------------------------------------------------------------
# Data loading + single-token comparisons
# ---------------------------------------------------------------------------


def load_mint_records() -> dict[int, dict[str, Any]]:
    records = json.loads(MINT_DATA.read_text(encoding="utf-8"))
    return {r["tokenId"]: r for r in records}


def verified_token(
    token_id: int,
    schema: ArtSchemaBundle,
    mint_records: dict[int, dict[str, Any]],
) -> tuple[PayloadGenerationResult | None, str | None]:
    """Regenerate `token_id` via chromies-engine's real compositor (seed ==
    token_id) and compare against public/data/mint-data.json byte-for-byte.
    Returns (result, None) on match, (None, reason) on any mismatch or missing
    record."""
    record = mint_records.get(token_id)
    if record is None:
        return None, f"token {token_id} has no record in public/data/mint-data.json"

    result = generate_chromie_payload(seed=token_id, token_id=token_id, schema=schema)
    if result.pixels_hex != record["pixelsHex"] or result.traits_hex != record["traitsHex"]:
        return None, (
            f"token {token_id}: chromies-engine (Python, isolated) regeneration does not match "
            f"public/data/mint-data.json byte-for-byte"
        )
    return result, None


def real_js_payload_for_token(
    token_id: int, *, sequential_through: bool = False
) -> tuple[dict[str, Any] | None, str | None]:
    """Calls the REAL art-pipeline/bridge-mint-data.js::buildMintRecord() for
    `token_id` (required verbatim inside _verify_single_token.cjs). By default
    uses fresh, isolated guards (same isolation chromies-engine's batch=None call
    has); pass sequential_through=True to replay tokens 1..token_id in order with
    shared guards (slow -- reflects the real cumulative dedupe/comboCap state, at
    the cost of O(token_id) work)."""
    if not SINGLE_TOKEN_HELPER.exists():
        return None, f"{SINGLE_TOKEN_HELPER} is missing"
    args = ["node", str(SINGLE_TOKEN_HELPER), str(token_id)]
    if sequential_through:
        args.append("--sequential-through")
    try:
        proc = subprocess.run(args, cwd=str(ART_PIPELINE), capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        return None, "`node` executable not found on PATH"
    except subprocess.TimeoutExpired:
        return None, "node helper timed out after 120s"
    if proc.returncode != 0:
        return None, f"node helper exited {proc.returncode}: {proc.stderr.strip()[:2000]}"
    try:
        return json.loads(proc.stdout), None
    except json.JSONDecodeError as exc:
        return None, f"node helper produced non-JSON stdout: {exc}; stdout={proc.stdout[:500]!r}"


def _first_differing_byte(hex_a: str, hex_b: str) -> str:
    a = from_hex(hex_a) if hex_a else b""
    b = from_hex(hex_b) if hex_b else b""
    if a == b:
        return "identical"
    if len(a) != len(b):
        return f"length differs: {len(a)} vs {len(b)} bytes"
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return f"first differing byte at offset {i}: 0x{x:02x} vs 0x{y:02x} (of {len(a)} bytes)"
    return "identical"  # unreachable if a != b and same length, but keep honest


def _slot_diff(hex_a: str, hex_b: str) -> dict[str, tuple[Any, Any]]:
    try:
        dec_a = decode_traits(from_hex(hex_a)).decoded
        dec_b = decode_traits(from_hex(hex_b)).decoded
    except Exception as exc:  # noqa: BLE001
        return {"_decode_error": (str(exc), None)}
    return {
        k: (dec_a[k]["value"], dec_b.get(k, {}).get("value"))
        for k in dec_a
        if dec_a[k]["value"] != dec_b.get(k, {}).get("value")
    }


@dataclass
class MismatchDiagnostic:
    token_id: int
    mint_data_pixels_hex: str
    mint_data_traits_hex: str
    python_pixels_hex: str | None = None
    python_traits_hex: str | None = None
    python_error: str | None = None
    python_vs_mintdata_pixels_diff: str = ""
    python_vs_mintdata_traits_diff: str = ""
    python_vs_mintdata_slot_diff: dict[str, Any] = field(default_factory=dict)
    js_isolated_pixels_hex: str | None = None
    js_isolated_traits_hex: str | None = None
    js_isolated_error: str | None = None
    js_isolated_vs_mintdata_pixels_diff: str = ""
    js_isolated_vs_mintdata_traits_diff: str = ""
    js_isolated_vs_mintdata_slot_diff: dict[str, Any] = field(default_factory=dict)
    verdict: str = ""

    def format(self) -> str:
        lines = [
            f"--- token {self.token_id} mismatch diagnostic ---",
            f"  mint-data.json: pixelsHex len={len(self.mint_data_pixels_hex)} traitsHex={self.mint_data_traits_hex}",
        ]
        if self.python_error:
            lines.append(f"  chromies-engine (Python, isolated): ERROR -- {self.python_error}")
        else:
            lines.append("  chromies-engine (Python, isolated) vs mint-data.json:")
            lines.append(f"    pixelsHex: {self.python_vs_mintdata_pixels_diff}")
            lines.append(f"    traitsHex: {self.python_vs_mintdata_traits_diff}")
            lines.append(f"    trait-slot diffs: {self.python_vs_mintdata_slot_diff}")
        if self.js_isolated_error:
            lines.append(f"  real JS buildMintRecord (isolated guards): ERROR -- {self.js_isolated_error}")
        else:
            lines.append("  real JS buildMintRecord (isolated guards) vs mint-data.json:")
            lines.append(f"    pixelsHex: {self.js_isolated_vs_mintdata_pixels_diff}")
            lines.append(f"    traitsHex: {self.js_isolated_vs_mintdata_traits_diff}")
            lines.append(f"    trait-slot diffs: {self.js_isolated_vs_mintdata_slot_diff}")
        lines.append(f"  verdict: {self.verdict}")
        return "\n".join(lines)


def diagnose_mismatch(
    token_id: int,
    schema: ArtSchemaBundle,
    mint_records: dict[int, dict[str, Any]],
) -> MismatchDiagnostic:
    """3-way comparison for a token that failed verified_token(): mint-data.json
    (ground truth) vs chromies-engine's Python regeneration vs the REAL
    art-pipeline/bridge-mint-data.js::buildMintRecord() run in isolation. Does not
    guess which side is 'right' -- reports both diffs and lets the pattern speak
    for itself."""
    record = mint_records[token_id]
    diag = MismatchDiagnostic(
        token_id=token_id,
        mint_data_pixels_hex=record["pixelsHex"],
        mint_data_traits_hex=record["traitsHex"],
    )

    try:
        result = generate_chromie_payload(seed=token_id, token_id=token_id, schema=schema)
        diag.python_pixels_hex = result.pixels_hex
        diag.python_traits_hex = result.traits_hex
        diag.python_vs_mintdata_pixels_diff = _first_differing_byte(result.pixels_hex, record["pixelsHex"])
        diag.python_vs_mintdata_traits_diff = _first_differing_byte(result.traits_hex, record["traitsHex"])
        diag.python_vs_mintdata_slot_diff = _slot_diff(result.traits_hex, record["traitsHex"])
    except Exception as exc:  # noqa: BLE001
        diag.python_error = str(exc)

    js_result, js_error = real_js_payload_for_token(token_id)
    if js_error:
        diag.js_isolated_error = js_error
    else:
        diag.js_isolated_pixels_hex = js_result["pixelsHex"]
        diag.js_isolated_traits_hex = js_result["traitsHex"]
        diag.js_isolated_vs_mintdata_pixels_diff = _first_differing_byte(js_result["pixelsHex"], record["pixelsHex"])
        diag.js_isolated_vs_mintdata_traits_diff = _first_differing_byte(js_result["traitsHex"], record["traitsHex"])
        diag.js_isolated_vs_mintdata_slot_diff = _slot_diff(js_result["traitsHex"], record["traitsHex"])

    js_matches_mintdata = (
        js_result is not None
        and js_result["pixelsHex"] == record["pixelsHex"]
        and js_result["traitsHex"] == record["traitsHex"]
    )
    python_matches_js = (
        diag.python_pixels_hex == diag.js_isolated_pixels_hex
        and diag.python_traits_hex == diag.js_isolated_traits_hex
        and diag.python_error is None
        and diag.js_isolated_error is None
    )
    if js_matches_mintdata:
        diag.verdict = (
            "real JS buildMintRecord matches mint-data.json in isolation -- this token's real roll "
            "did NOT hit a dedupe/comboCap reroll, so chromies-engine's mismatch is a genuine "
            "Python-port divergence, not a batch-state gap."
        )
    elif python_matches_js:
        diag.verdict = (
            "chromies-engine (Python) output is IDENTICAL to real-JS-isolated output, and neither "
            "matches mint-data.json -- consistent with this token's real roll having been altered by "
            "sequential dedupe-reroll or combo-cap-reroll state (batch=None on both sides can't see "
            "that state). Not evidence of a chromies-engine bug; rerun real_js_payload_for_token with "
            "sequential_through=True to confirm the guard state is the cause."
        )
    else:
        diag.verdict = (
            "chromies-engine (Python) and real-JS-isolated DISAGREE with each other (and neither "
            "matches mint-data.json) -- this points to an actual algorithmic divergence in "
            "chromies-engine's compositor, separate from any batch-state question. See the slot-diff "
            "fields above for exactly which slot(s)."
        )
    return diag


def run_parity_scan(
    start: int,
    end: int,
    *,
    diagnose_first_n_failures: int = 3,
) -> tuple[int, int, list[MismatchDiagnostic], list[dict[str, str]]]:
    """Scans token_id `start`..`end` inclusive UNCONDITIONALLY (never stops
    early), verifying each against public/data/mint-data.json. Returns
    (pass_count, total_scanned, diagnostics_for_first_n_failures, all_failure_summaries)."""
    schema = load_art_schema_bundle()
    mint_records = load_mint_records()

    pass_count = 0
    total = 0
    failures: list[dict[str, str]] = []
    diagnostics: list[MismatchDiagnostic] = []

    for token_id in range(start, end + 1):
        if token_id not in mint_records:
            continue  # not part of the committed dataset window; not a pass or a fail
        total += 1
        result, error = verified_token(token_id, schema, mint_records)
        if error is None:
            pass_count += 1
            continue
        failures.append({"token_id": str(token_id), "reason": error})
        if len(diagnostics) < diagnose_first_n_failures:
            diagnostics.append(diagnose_mismatch(token_id, schema, mint_records))

    return pass_count, total, diagnostics, failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", type=int, default=1, help="First token_id to scan (inclusive).")
    parser.add_argument("--end", type=int, default=200, help="Last token_id to scan (inclusive).")
    parser.add_argument("--diagnose-first-n-failures", type=int, default=3)
    args = parser.parse_args()

    hr(f"Pipeline Parity Check (report-only): tokens {args.start}..{args.end}")
    log(f"public/data/mint-data.json: {MINT_DATA}")
    log("Comparing: mint-data.json  vs  chromies-engine (Python, isolated)  vs  real JS buildMintRecord (isolated)")

    pass_count, total, diagnostics, failures = run_parity_scan(
        args.start, args.end, diagnose_first_n_failures=args.diagnose_first_n_failures
    )

    hr("RESULT")
    log(f"chromies-engine (Python, isolated) matched mint-data.json byte-for-byte "
        f"(pixelsHex AND traitsHex) for {pass_count}/{total} scanned tokens.")

    if failures:
        log(f"\n{len(failures)} failing token id(s): {[f['token_id'] for f in failures]}")
        log(f"\nDiagnostics for the first {len(diagnostics)} failure(s):")
        for diag in diagnostics:
            log(diag.format())
    else:
        log("\nNo failures in this range.")

    log("\nNo files modified. Report-only, per instruction.")

    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    hr()
    log(f"Full report written to: {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
