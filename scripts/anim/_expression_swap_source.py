"""Task 2 of "Rework Prototype onto Canonical Bytes + JS Compositor": determine a
real token's "expression" (mouth) render-pick, and render an expression-swapped
variant of that same token -- both via the REAL art-pipeline JS pipeline
(bridge-mint-data.js / generate.js, called through Node in
art-pipeline/_verify_single_token.cjs, never reimplemented/transcribed here),
never chromies-engine's Python compositor (known to diverge from
public/data/mint-data.json -- see scripts/verify/pipeline-parity-check.py).

Why this has to shell out to real JS at all: "expression" is deliberately NOT
on-chain encoded (absent from traitsHex/TRAIT_SLOTS entirely -- confirmed by
inspection in compile-face-regions.py's docstring), so a token's expression can
never be read directly out of public/data/mint-data.json's committed bytes.
The only way to know what a real token's expression *was* is to ask the real
trait-rolling code what it picked. This module does that via an ISOLATED
(fresh-guard) call to the real JS resolveUniqueTokenTraits, and -- critically --
self-verifies that isolated call against the token's actual committed
pixelsHex/traitsHex before trusting anything it says (a token whose real roll
was altered by a sequential dedupe-reroll or combo-cap-reroll in the full
5,150-token production run will fail this check; such tokens are skipped, never
guessed at). This is "reading the data", not "rerolling" -- the isolated call is
discarded unless it's proven, byte-for-byte, to be what actually happened for
that specific token.

Legendary tokens (art-pipeline/legendary-token-ids.js) are excluded from every
scan in this module BEFORE the node helper is ever invoked: they route through
legendary-finals.js's fixed final-buffer images, have no per-slot render_picks
at all, and therefore cannot be expression-swapped. The exclusion set is derived
LIVE from the real legendary-token-ids.js (via the same
art-pipeline/_verify_canonical_merkle.cjs "legendary-ids" mode
scripts/verify/determine-canonical-dataset.py uses) -- never hardcoded here.
(Separately logged, no action taken here: legendary-finals/0045.png fails its
NORMIE_SNOWFRO palette gate at (0,0) -- consistent with draft status, parked
for JB's legendary-finals work. Moot for this module either way, since
legendaries are excluded before any per-token call regardless.)

"Expression" is not one name per role across the whole collection -- each
character family (art-pipeline/chromies-config.js CHARACTERS[*].
slotVariantPool.expression) has its own eligible variant pool (e.g.
Female_Neutral/Female_Smile/..., Chubby_Neutral/Chubby_Smile/..., Zombie/Agent
forced to None, SideProfile limited to Smile/Smirk with no Neutral at all,
Alien falling through to the bare generic Neutral/Smile/Frown/None since it has
no override). Matching and swapping MUST be family-aware: a token's real
"Neutral" and "Smile" variant names are resolved per-token from its own actual
rolled character via the real getEligibleVariants() (art-pipeline/
_verify_single_token.cjs::expressionRoleVariants), never by constructing a
candidate name like f"{family}_Smile". If a token's family has no Smile-role
variant at all, that token is skipped, never forced onto some other family's
Smile art.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_ROOT.parent
ART_PIPELINE = REPO_ROOT / "art-pipeline"
SINGLE_TOKEN_HELPER = ART_PIPELINE / "_verify_single_token.cjs"
MERKLE_HELPER = ART_PIPELINE / "_verify_canonical_merkle.cjs"

_legendary_ids_cache: set[int] | None = None


def _run_node(args: list[str]) -> tuple[dict[str, Any] | None, str | None]:
    if not SINGLE_TOKEN_HELPER.exists():
        return None, f"{SINGLE_TOKEN_HELPER} is missing"
    try:
        proc = subprocess.run(
            ["node", str(SINGLE_TOKEN_HELPER), *args],
            cwd=str(ART_PIPELINE), capture_output=True, text=True, timeout=120,
        )
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


def get_legendary_token_ids() -> tuple[set[int] | None, str | None]:
    """Derives the legendary token-ID set LIVE from art-pipeline/legendary-token-ids.js
    -- the same mechanism scripts/verify/determine-canonical-dataset.py uses (via
    art-pipeline/_verify_canonical_merkle.cjs's "legendary-ids" mode) -- never
    hardcoded. No fallback list here: if this can't be determined, callers halt
    rather than scan/swap without knowing which IDs must be excluded. Cached for
    the lifetime of this process (the set doesn't change mid-run)."""
    global _legendary_ids_cache
    if _legendary_ids_cache is not None:
        return _legendary_ids_cache, None

    if not MERKLE_HELPER.exists():
        return None, f"{MERKLE_HELPER} is missing"
    try:
        proc = subprocess.run(
            ["node", str(MERKLE_HELPER), "legendary-ids"],
            cwd=str(ART_PIPELINE), capture_output=True, text=True, timeout=60,
        )
    except FileNotFoundError:
        return None, "`node` executable not found on PATH"
    except subprocess.TimeoutExpired:
        return None, "node helper timed out after 60s"
    if proc.returncode != 0:
        return None, f"node helper exited {proc.returncode}: {proc.stderr.strip()[:2000]}"
    try:
        ids = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        return None, f"node helper produced non-JSON stdout: {exc}; stdout={proc.stdout[:500]!r}"

    _legendary_ids_cache = {int(x) for x in ids}
    return _legendary_ids_cache, None


def js_isolated_record(token_id: int) -> tuple[dict[str, Any] | None, str | None]:
    """Real JS buildMintRecord (bridge-mint-data.js), fresh isolated guards --
    includes the real "expression" render-pick name (read via an independently
    fresh-guarded call inside the node helper; never perturbs the guards used for
    pixelsHex/traitsHex). Returns (record, None) or (None, error)."""
    return _run_node([str(token_id)])


def verify_fidelity(record: dict[str, Any], mint_record: dict[str, Any]) -> tuple[bool, str]:
    """True iff the isolated-JS record's pixelsHex/traitsHex are byte-identical to
    the token's committed public/data/mint-data.json record. False is EXPECTED for
    any token whose real roll hit a dedupe/comboCap reroll in the full production
    sequence -- see module docstring -- not itself evidence of a bug."""
    if record["pixelsHex"].lower() != mint_record["pixelsHex"].lower():
        return False, (
            "pixelsHex differs from public/data/mint-data.json (real roll likely hit a "
            "dedupe/comboCap reroll during the full 5,150-token production run -- an isolated "
            "single-token call can't see that sequential guard state)"
        )
    if record["traitsHex"].lower() != mint_record["traitsHex"].lower():
        return False, "traitsHex differs from public/data/mint-data.json"
    return True, "isolated JS output is byte-identical to the committed record"


def find_canonical_tokens_by_expression(
    token_ids: list[int],
    mint_records: dict[int, dict[str, Any]],
    *,
    want_traits: set[str] | None = None,
    want_count: int | None = None,
) -> tuple[dict[str, int], list[dict[str, str]]]:
    """Scan `token_ids` in order; for each, call the real JS pipeline in isolation
    and check fidelity against its committed mint-data.json record. Tokens that
    fail fidelity are silently skipped (expected batch-state gap, not flagged as a
    mismatch -- see module docstring), not guessed at. For every token that DOES
    pass, its real "expression" render-pick (now proven correct for that token) is
    recorded as the first match for that trait name.

    Returns (expression_name -> first matching token_id, flags), where `flags`
    only records actual node/helper *errors* (never a plain fidelity miss, which
    is routine)."""
    legendary_ids, error = get_legendary_token_ids()
    if error:
        raise SystemExit(f"cannot determine legendary token IDs (required before any expression scan): {error}")

    found: dict[str, int] = {}
    flags: list[dict[str, str]] = []

    for token_id in token_ids:
        if token_id in legendary_ids:
            continue  # excluded before the node helper is ever invoked -- see module docstring
        mint_record = mint_records.get(token_id)
        if mint_record is None:
            continue

        record, error = js_isolated_record(token_id)
        if error:
            flags.append({"token_id": str(token_id), "reason": f"node helper error: {error}"})
            continue

        ok, _reason = verify_fidelity(record, mint_record)
        if not ok:
            continue

        expression = record.get("expression")
        if not expression or expression in found:
            continue
        if want_traits is not None and expression not in want_traits:
            continue

        found[expression] = token_id

        if want_traits is not None and want_traits.issubset(found.keys()):
            break
        if want_count is not None and len(found) >= want_count:
            break

    return found, flags


def find_neutral_smile_candidate(
    token_ids: list[int],
    mint_records: dict[int, dict[str, Any]],
    *,
    prefer_token_id: int | None = 2,
) -> tuple[dict[str, Any] | None, list[dict[str, str]]]:
    """Family-aware search (the variant-aware matching fix): finds a token whose
    real "expression" render-pick IS its own character family's Neutral-role
    variant (e.g. "Female_Neutral" for a Female-rolled token, "Neutral" for an
    Alien-rolled token that fell through to the generic pool, etc.) AND whose
    family also has a Smile-role variant available -- both roles resolved
    per-token from the real trait tables via
    art-pipeline/_verify_single_token.cjs::expressionRoleVariants, never by
    string-constructing a candidate name. Families with no Smile-role variant at
    all (e.g. SideProfile: Smile/Smirk only, no Neutral either, so such tokens
    never even reach the Neutral check) are skipped, never forced.

    Legendary IDs are excluded before scanning (see module docstring).
    `prefer_token_id`, if given and present in `token_ids`/`mint_records`, is
    tried FIRST -- token 2 (Female_Neutral) is a known-good candidate from the
    earlier sanity pass, so this is the cheapest path when it still holds.

    Returns ({"token_id", "neutral_variant", "smile_variant"} | None, flags)."""
    legendary_ids, error = get_legendary_token_ids()
    if error:
        raise SystemExit(f"cannot determine legendary token IDs (required before any expression scan): {error}")

    ordered_ids = [t for t in token_ids if t not in legendary_ids]
    if prefer_token_id is not None and prefer_token_id in ordered_ids:
        ordered_ids = [prefer_token_id] + [t for t in ordered_ids if t != prefer_token_id]

    flags: list[dict[str, str]] = []
    for token_id in ordered_ids:
        mint_record = mint_records.get(token_id)
        if mint_record is None:
            continue

        record, error = js_isolated_record(token_id)
        if error:
            flags.append({"token_id": str(token_id), "reason": f"node helper error: {error}"})
            continue

        ok, _reason = verify_fidelity(record, mint_record)
        if not ok:
            continue

        neutral_variant = record.get("expressionNeutralVariant")
        smile_variant = record.get("expressionSmileVariant")
        if not neutral_variant or not smile_variant:
            continue  # this family has no Neutral and/or no Smile role -- skip, never force
        if record.get("expression") != neutral_variant:
            continue  # this token's actual pick isn't its own family's Neutral role

        return {
            "token_id": token_id,
            "neutral_variant": neutral_variant,
            "smile_variant": smile_variant,
        }, flags

    return None, flags


def swap_expression(
    token_id: int,
    mint_record: dict[str, Any],
    new_expression_name: str,
) -> dict[str, Any]:
    """Self-verifying expression swap for `token_id` (Task 2): re-verifies the
    isolated-JS-vs-canonical fidelity check first (never trusts an earlier scan's
    cached result), and only if that passes, renders the SAME token through the
    real JS pipeline with ONLY its "expression" render-pick swapped to
    `new_expression_name` -- every other slot (hood, shirt, palette, eyes, hair,
    ...) stays exactly as the token's real roll produced it. Raises SystemExit on
    any fidelity failure or node error; never returns a guessed/partial result."""
    base_record, error = js_isolated_record(token_id)
    if error:
        raise SystemExit(f"token {token_id}: node helper error while re-verifying fidelity before swap: {error}")

    ok, reason = verify_fidelity(base_record, mint_record)
    if not ok:
        raise SystemExit(
            f"token {token_id}: isolated-JS fidelity check FAILED immediately before the expression "
            f"swap ({reason}) -- refusing to use this token. Pick a different token."
        )

    swapped, error = _run_node([str(token_id), "--swap-expression", new_expression_name])
    if error:
        raise SystemExit(f"token {token_id}: node helper error during expression swap: {error}")
    return swapped
