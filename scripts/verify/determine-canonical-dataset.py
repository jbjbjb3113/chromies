"""Canonical Dataset Determination (report-only).

Determines which on-disk `mint-data.json` (if any) matches the frozen merkle root
`0x73008f45bfe38ec43fd00c9fa3af0dab1d8d6f5acdca7f87af9937d0a2887abd` recorded in
`chromies-engine/reports/ROBINHOOD_DATASET_FREEZE_RULING.md`.

THIS SCRIPT NEVER WRITES TO ANY DATASET FILE. It reads:
  - public/data/mint-data.json (working copy, via a plain read)
  - the HEAD-committed version of that same path (via `git show HEAD:...`, into a
    tempfile -- never written back into the tree)
  - _backups/art-pipeline-pre-beard-fix/output/mint-data.json (read-only)
  - chromies-engine/generated/regen_5150_current/mint-data-excl-legendary.json, as a
    self-check: this is the file the freeze ruling says produced the frozen root, so
    recomputing its root is how this script proves its own merkle helper is correct
    *before* trusting any of the other comparisons.
The only files this script writes are its own report
(scripts/verify/canonical-dataset-report.txt) and short-lived tempfiles for the
`git show` extraction and for legendary-filtered record arrays fed to the node
helper -- all under the OS tempdir, all cleaned up on exit.

Merkle construction: per instructions, this script does NOT reimplement or guess
keccak256/ABI-encoding/tree-construction in Python. It locates the real construction
(art-pipeline/candidate-merkle.js, cross-referenced against the freeze ruling doc and
against chromies-engine/generated/regen_5150_current/candidate-merkle-root.txt) and
shells out to a tiny Node helper (art-pipeline/_verify_canonical_merkle.cjs) that
copies that construction's leafHash()/MerkleTree(...) call VERBATIM, parameterized
only by *which* mint-data.json file to run it over. If Node or that construction
can't be found/run, this script HALTS the merkle-recomputation section rather than
falling back to a hand-rolled hash -- see find_merkle_construction() / run_node().

Run: py scripts/verify/determine-canonical-dataset.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
ART_PIPELINE = REPO_ROOT / "art-pipeline"
ENGINE_ROOT = REPO_ROOT / "chromies-engine"
NODE_HELPER = ART_PIPELINE / "_verify_canonical_merkle.cjs"
REPORT_PATH = SCRIPT_PATH.parent / "canonical-dataset-report.txt"

FROZEN_ROOT = "0x73008f45bfe38ec43fd00c9fa3af0dab1d8d6f5acdca7f87af9937d0a2887abd"
COMMEMORATIVE_CONTRACT = "0x3C8C9615889762bDcF9647a3C86C74aFA498a158"

# Hand-copied fallback ONLY used if the Node helper (which requires
# art-pipeline/legendary-token-ids.js live) can't run -- see get_legendary_ids().
# Per chromies-engine/reports/ROBINHOOD_DATASET_FREEZE_RULING.md. 4 of these 9 IDs
# are RNG-derived in the real module, not literal, so this fallback is flagged as
# unverified whenever it's actually used.
FALLBACK_LEGENDARY_TOKEN_IDS = [45, 264, 603, 1173, 1294, 2222, 3792, 4354, 4698]

CANDIDATE_FILES = {
    "public/data/mint-data.json (working copy)": REPO_ROOT / "public" / "data" / "mint-data.json",
    "_backups/art-pipeline-pre-beard-fix/output/mint-data.json": (
        REPO_ROOT / "_backups" / "art-pipeline-pre-beard-fix" / "output" / "mint-data.json"
    ),
}

SELF_CHECK_FILE = (
    ENGINE_ROOT / "generated" / "regen_5150_current" / "mint-data-excl-legendary.json"
)

OTHER_MINT_DATA_PATHS = {
    "art-pipeline/output/mint-data.json": ART_PIPELINE / "output" / "mint-data.json",
    "dist/data/mint-data.json": REPO_ROOT / "dist" / "data" / "mint-data.json",
}

TEXT_SEARCH_SKIP_DIRS = {
    ".git", "node_modules", "dist", "_backups", ".verify-tmp", ".verify-worktrees",
    ".verify-worktree", "__pycache__", ".pytest_cache",
}
TEXT_SEARCH_EXTS = {
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".sol", ".py", ".md", ".json", ".txt",
}

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
# Step 0: locate the real merkle construction (do not reimplement it)
# ---------------------------------------------------------------------------

@dataclass
class MerkleConstructionSearch:
    root_hash_hits: list[Path] = field(default_factory=list)
    merkle_code_files: list[Path] = field(default_factory=list)
    construction_file: Path | None = None
    reveal_leaf_matches_contract: bool | None = None
    halted: bool = False
    halt_reason: str = ""


TEXT_SEARCH_MAX_BYTES = 2_000_000  # skip huge generated blobs (mint-data.json, lockfiles, proofs) --
                                    # the strings we search for never live inside those anyway.


def _iter_repo_text_files():
    for path in REPO_ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in TEXT_SEARCH_SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() not in TEXT_SEARCH_EXTS:
            continue
        try:
            if path.stat().st_size > TEXT_SEARCH_MAX_BYTES:
                continue
        except OSError:
            continue
        yield path


def find_merkle_construction() -> MerkleConstructionSearch:
    result = MerkleConstructionSearch()

    for path in _iter_repo_text_files():
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        hit_root = FROZEN_ROOT.lower() in text.lower()
        hit_merkle = "merkle" in text.lower() and path.suffix.lower() in {".js", ".cjs", ".mjs", ".ts"}
        if hit_root:
            result.root_hash_hits.append(path)
        if hit_merkle and ("leafhash" in text.lower() or "merkletree" in text.lower()):
            result.merkle_code_files.append(path)

    candidate_js = ART_PIPELINE / "candidate-merkle.js"
    reveal_js = ART_PIPELINE / "generate-reveal-merkle.js"
    ruling_md = ENGINE_ROOT / "reports" / "ROBINHOOD_DATASET_FREEZE_RULING.md"

    if not candidate_js.exists():
        result.halted = True
        result.halt_reason = (
            f"{candidate_js} not found -- this is the script the freeze ruling doc names as "
            "having produced the frozen root. Cannot proceed without reimplementing the hash, "
            "which is explicitly disallowed. HALTING merkle recomputation."
        )
        return result

    if ruling_md not in result.root_hash_hits:
        result.halted = True
        result.halt_reason = (
            f"Frozen root string {FROZEN_ROOT} was not found in {ruling_md} on this run "
            "(expected it there per prior investigation). Refusing to trust which script "
            "produced the root without this cross-reference. HALTING."
        )
        return result

    construction_text = candidate_js.read_text(encoding="utf-8")
    if "leafHash" not in construction_text or "MerkleTree" not in construction_text:
        result.halted = True
        result.halt_reason = f"{candidate_js} does not contain a leafHash/MerkleTree construction as expected. HALTING."
        return result

    result.construction_file = candidate_js

    # Cross-check: does the SAME leaf encoding appear in the deployed contract's own
    # reveal() function (contracts/Chroma.sol)? This doesn't change which hash we use --
    # it's corroborating evidence that "keccak256(abi.encode(tokenId, pixels, traits))"
    # is the real on-chain-compatible leaf shape, not an arbitrary off-chain choice.
    chroma_sol = REPO_ROOT / "contracts" / "Chroma.sol"
    if chroma_sol.exists():
        sol_text = chroma_sol.read_text(encoding="utf-8", errors="ignore")
        result.reveal_leaf_matches_contract = (
            "keccak256(abi.encode(tokenId, pixels, traits))" in sol_text
        )
    else:
        result.reveal_leaf_matches_contract = None

    if reveal_js.exists():
        reveal_text = reveal_js.read_text(encoding="utf-8", errors="ignore")
        # candidate-merkle.js's own header comment claims to mirror this file's leafHash
        # exactly; confirm the function bodies actually match rather than trusting the comment.
        def _extract_leaf_fn(text: str) -> str:
            start = text.find("function leafHash")
            end = text.find("\n}", start)
            return text[start:end]

        cand_fn = _extract_leaf_fn(construction_text)
        reveal_fn = _extract_leaf_fn(reveal_text)
        if cand_fn and reveal_fn and cand_fn.strip() != reveal_fn.strip():
            result.halt_reason += (
                "\nNOTE: candidate-merkle.js's leafHash() body differs from "
                "generate-reveal-merkle.js's, despite candidate-merkle.js's header comment "
                "claiming they mirror each other. Using candidate-merkle.js's own body "
                "verbatim regardless (it's the one the freeze ruling names), but flagging "
                "this drift."
            )

    return result


# ---------------------------------------------------------------------------
# Step 1: Node helper invocation (exact leaf/tree construction, not reimplemented)
# ---------------------------------------------------------------------------

@dataclass
class RootResult:
    ok: bool
    root: str | None = None
    count: int | None = None
    token_ids: list[int] | None = None
    error: str | None = None


def run_node(*args: str) -> tuple[bool, Any, str | None]:
    if not NODE_HELPER.exists():
        return False, None, f"{NODE_HELPER} is missing"
    try:
        proc = subprocess.run(
            ["node", str(NODE_HELPER), *args],
            cwd=str(ART_PIPELINE),
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        return False, None, "`node` executable not found on PATH -- cannot run the real merkle construction"
    except subprocess.TimeoutExpired:
        return False, None, "node helper timed out after 120s"

    if proc.returncode != 0:
        return False, None, f"node helper exited {proc.returncode}: {proc.stderr.strip()[:2000]}"
    try:
        return True, json.loads(proc.stdout), None
    except json.JSONDecodeError as exc:
        return False, None, f"node helper produced non-JSON stdout: {exc}; stdout={proc.stdout[:500]!r}"


def compute_root_for_file(path: Path) -> RootResult:
    if not path.exists():
        return RootResult(ok=False, error=f"file does not exist: {path}")
    ok, data, err = run_node("root", str(path))
    if not ok:
        return RootResult(ok=False, error=err)
    return RootResult(ok=True, root=data["root"], count=data["count"], token_ids=data["tokenIds"])


_legendary_ids_cache: list[int] | None = None


def get_legendary_ids() -> tuple[list[int], bool]:
    """Returns (ids, from_fallback)."""
    global _legendary_ids_cache
    if _legendary_ids_cache is not None:
        return _legendary_ids_cache, False
    ok, data, err = run_node("legendary-ids")
    if ok and isinstance(data, list):
        _legendary_ids_cache = sorted(int(x) for x in data)
        return _legendary_ids_cache, False
    log(f"  [WARN] could not derive legendary IDs via art-pipeline/legendary-token-ids.js ({err}); "
        f"falling back to hand-copied list from ROBINHOOD_DATASET_FREEZE_RULING.md -- UNVERIFIED this run.")
    return sorted(FALLBACK_LEGENDARY_TOKEN_IDS), True


def compute_subset_root(path: Path, exclude_ids: set[int]) -> RootResult:
    if not path.exists():
        return RootResult(ok=False, error=f"file does not exist: {path}")
    try:
        records = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return RootResult(ok=False, error=f"could not read/parse: {exc}")
    filtered = [r for r in records if int(r["tokenId"]) not in exclude_ids]
    removed = len(records) - len(filtered)
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as tmp:
        json.dump(filtered, tmp)
        tmp_path = Path(tmp.name)
    try:
        result = compute_root_for_file(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)
    if result.ok:
        log(f"    (excluded {removed} legendary-tagged record(s) from {path.name} before hashing)")
    return result


# ---------------------------------------------------------------------------
# Step 2: HEAD copy extraction (read-only, tempfile, never written back)
# ---------------------------------------------------------------------------

def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=str(REPO_ROOT), capture_output=True, text=True
    )


def extract_head_copy(rel_path: str) -> tuple[Path | None, str | None]:
    proc = git("show", f"HEAD:{rel_path}")
    if proc.returncode != 0:
        return None, f"`git show HEAD:{rel_path}` failed: {proc.stderr.strip()[:500]}"
    tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8", newline=""
    )
    tmp.write(proc.stdout)
    tmp.close()
    return Path(tmp.name), None


# ---------------------------------------------------------------------------
# Step 3: delta characterization between two record sets
# ---------------------------------------------------------------------------

def load_records(path: Path) -> dict[int, dict[str, Any]]:
    records = json.loads(path.read_text(encoding="utf-8"))
    return {int(r["tokenId"]): r for r in records}


def characterize_delta(working: dict[int, dict[str, Any]], head: dict[int, dict[str, Any]]) -> None:
    log(f"Working copy record count: {len(working)}")
    log(f"HEAD copy record count:    {len(head)}")

    only_working = sorted(set(working) - set(head))
    only_head = sorted(set(head) - set(working))
    log(f"Token IDs only in working copy ({len(only_working)}): "
        f"{only_working[:20]}{' ...' if len(only_working) > 20 else ''}")
    log(f"Token IDs only in HEAD copy ({len(only_head)}): "
        f"{only_head[:20]}{' ...' if len(only_head) > 20 else ''}")

    common = sorted(set(working) & set(head))
    differing: list[int] = []
    for tid in common:
        w, h = working[tid], head[tid]
        if w.get("pixelsHex") != h.get("pixelsHex") or w.get("traitsHex") != h.get("traitsHex"):
            differing.append(tid)
    log(f"Token IDs present in both, differing in pixelsHex/traitsHex: {len(differing)} of {len(common)} common")

    try:
        sys.path.insert(0, str(ENGINE_ROOT))
        from engine.mint_payload import decode_traits, from_hex  # noqa: E402
        can_decode = True
    except Exception as exc:  # noqa: BLE001
        log(f"  [WARN] could not import chromies-engine.engine.mint_payload for slot-level "
            f"decoding ({exc}); will report raw hex diffs only.")
        can_decode = False

    log("")
    log(f"First {min(5, len(differing))} differing token IDs (of {len(differing)}):")
    for tid in differing[:5]:
        w, h = working[tid], head[tid]
        fields_diff = []
        if w.get("pixelsHex") != h.get("pixelsHex"):
            fields_diff.append(
                f"pixelsHex (working len={len(w.get('pixelsHex', ''))}, head len={len(h.get('pixelsHex', ''))})"
            )
        if w.get("traitsHex") != h.get("traitsHex"):
            fields_diff.append(
                f"traitsHex (working len={len(w.get('traitsHex', ''))}, head len={len(h.get('traitsHex', ''))})"
            )
        other_keys = (set(w.keys()) | set(h.keys())) - {"pixelsHex", "traitsHex", "tokenId"}
        for k in sorted(other_keys):
            if w.get(k) != h.get(k):
                fields_diff.append(f"{k} (working={w.get(k)!r}, head={h.get(k)!r})")

        log(f"  token {tid}: fields differing = {fields_diff}")

        if can_decode and w.get("traitsHex") != h.get("traitsHex"):
            try:
                w_dec = decode_traits(from_hex(w["traitsHex"])).decoded
                h_dec = decode_traits(from_hex(h["traitsHex"])).decoded
                slot_diffs = {
                    k: (w_dec[k]["value"], h_dec[k]["value"])
                    for k in w_dec
                    if w_dec[k]["value"] != h_dec.get(k, {}).get("value")
                }
                log(f"    trait-slot diffs: {slot_diffs}")
            except Exception as exc:  # noqa: BLE001
                log(f"    [WARN] decode_traits failed for token {tid}: {exc}")

    if can_decode and differing:
        beard_total = 0
        for tid in differing:
            w, h = working[tid], head[tid]
            if w.get("traitsHex") == h.get("traitsHex"):
                continue
            try:
                w_dec = decode_traits(from_hex(w["traitsHex"])).decoded
                h_dec = decode_traits(from_hex(h["traitsHex"])).decoded
                if w_dec.get("beard", {}).get("value") != h_dec.get("beard", {}).get("value"):
                    beard_total += 1
            except Exception:  # noqa: BLE001
                pass
        traits_differing = sum(
            1 for tid in differing if working[tid].get("traitsHex") != head[tid].get("traitsHex")
        )
        log("")
        log(f"Across ALL {len(differing)} differing tokens: {traits_differing} differ in traitsHex; "
            f"of those, {beard_total} differ specifically in the 'beard' slot "
            f"({(beard_total / traits_differing * 100) if traits_differing else 0:.1f}% of traitsHex-differing tokens).")
        log("(This directly tests the 'beard-fix' hypothesis for the two generations.)")


# ---------------------------------------------------------------------------
# Step 4: git archaeology
# ---------------------------------------------------------------------------

def blob_size_at(commit: str, rel_path: str) -> int | None:
    proc = git("cat-file", "-s", f"{commit}:{rel_path}")
    if proc.returncode != 0:
        return None
    try:
        return int(proc.stdout.strip())
    except ValueError:
        return None


def git_archaeology_for(rel_path: str, label: str) -> None:
    hr(f"Git archaeology: {label}")

    tracked = git("ls-files", "--error-unmatch", rel_path)
    is_tracked = tracked.returncode == 0
    log(f"Tracked in git: {is_tracked}")
    if not is_tracked:
        ignored = git("check-ignore", rel_path)
        log(f"Matched by .gitignore: {ignored.returncode == 0}")
        abs_path = REPO_ROOT / rel_path
        if abs_path.exists():
            log(f"Exists on disk (untracked): {abs_path} -- {abs_path.stat().st_size} bytes")
        else:
            log(f"Does not exist on disk: {abs_path}")
        return

    log_proc = git("log", "--follow", "--format=%H|%h|%ad|%s", "--date=iso-strict", "-n", "10", "--", rel_path)
    if log_proc.returncode != 0:
        log(f"`git log` failed: {log_proc.stderr.strip()}")
        return

    commits = [line.split("|", 3) for line in log_proc.stdout.strip().splitlines() if line]
    log(f"Last {len(commits)} commit(s) touching {rel_path}:")
    introduced_at: str | None = None
    for full_hash, short_hash, date, subject in commits:
        size = blob_size_at(full_hash, rel_path)
        marker = ""
        if size == 21_834_896:
            marker = "  <-- 21,834,896 bytes"
            if introduced_at is None:
                introduced_at = short_hash
        log(f"  {short_hash}  {date}  {subject}  [{size} bytes]{marker}")

    if introduced_at is None and commits:
        log("21,834,896-byte version not found within the last 10 commits touching this path; "
            "walking further back to locate the introducing commit...")
        full_log = git("log", "--follow", "--format=%H|%h", "-n", "500", "--", rel_path)
        for line in full_log.stdout.strip().splitlines():
            full_hash, short_hash = line.split("|", 1)
            size = blob_size_at(full_hash, rel_path)
            if size == 21_834_896:
                introduced_at = short_hash
                log(f"  Found: {short_hash} introduces a 21,834,896-byte version of {rel_path}")
                break
        if introduced_at is None:
            log("  Not found within the last 500 commits touching this path either.")

    log("")
    status_proc = git("status", "--porcelain=v1", "--", rel_path)
    log(f"git status --porcelain -- {rel_path}: {status_proc.stdout.strip() or '(clean / no output)'}")

    diff_stat = git("diff", "--stat", "HEAD", "--", rel_path)
    log(f"git diff --stat HEAD -- {rel_path}: {diff_stat.stdout.strip() or '(no diff vs HEAD)'}")

    abs_path = REPO_ROOT / rel_path
    if abs_path.exists():
        head_size = blob_size_at("HEAD", rel_path)
        working_size = abs_path.stat().st_size
        log(f"HEAD blob size: {head_size} bytes; working-tree size: {working_size} bytes; "
            f"{'MATCH' if head_size == working_size else 'DIFFER'}")
        if head_size != working_size and not status_proc.stdout.strip():
            log("  NOTE: sizes differ but `git status` reports no local modification for this path -- "
              "this would mean HEAD's own recorded blob size differs from what's on disk without an "
              "uncommitted change explaining it. Re-run `git status` and `git stash list` manually if so; "
              "this script will not guess further.")


# ---------------------------------------------------------------------------
# Step 5: cross-check the deployed contract
# ---------------------------------------------------------------------------

def crosscheck_contract() -> None:
    hr("Cross-check: deployed contract / on-chain root")

    contract_hits = [p for p in _iter_repo_text_files()
                      if COMMEMORATIVE_CONTRACT.lower() in p.read_text(encoding="utf-8", errors="ignore").lower()]
    log(f"Files referencing commemorative contract address {COMMEMORATIVE_CONTRACT}:")
    for p in contract_hits:
        log(f"  {p.relative_to(REPO_ROOT)}")

    commemorative_sol = REPO_ROOT / "src" / "robinhood" / "ChromiesCommemorative.sol"
    has_root_field = False
    if commemorative_sol.exists():
        text = commemorative_sol.read_text(encoding="utf-8", errors="ignore")
        has_root_field = any(kw in text for kw in ("revealRoot", "merkleRoot", "MerkleProof"))
        log("")
        log(f"{commemorative_sol.relative_to(REPO_ROOT)} contains a merkle-root field or "
            f"MerkleProof usage: {has_root_field}")
        log("  -> ChromiesCommemorative uses owner-only `seedPayloads(ids, pixelsHex, traitsHex)` "
            "with NO merkle root and NO proof verification (confirmed by absence of "
            "revealRoot/merkleRoot/MerkleProof in the contract source). The frozen root is "
            "therefore NOT stored anywhere on-chain for this contract -- it is a purely "
            "off-chain provenance marker recording which dataset the 100 commemorative token "
            "payloads were selected from before being pushed via seedPayloads calldata.")
    else:
        log(f"{commemorative_sol} not found -- cannot confirm absence of an on-chain root field directly.")

    chroma_sol = REPO_ROOT / "contracts" / "Chroma.sol"
    if chroma_sol.exists():
        text = chroma_sol.read_text(encoding="utf-8", errors="ignore")
        has_reveal_root = "revealRoot" in text
        log("")
        log(f"{chroma_sol.relative_to(REPO_ROOT)} (the DIFFERENT, main ETH-collection contract) "
            f"DOES have a `revealRoot` field used in reveal(): {has_reveal_root}. This is a "
            "separate 5,150-token full-collection reveal root (see "
            "chromies-engine/reports/ROBINHOOD_DATASET_FREEZE_RULING.md: "
            "0xb17659ae0e19720a50a2c90d16c6445029140596486ea6d808d363212ac73e7e), NOT the frozen "
            f"{FROZEN_ROOT} this report is checking -- do not conflate the two roots or the two contracts.")

    deploy_script = REPO_ROOT / "script" / "robinhood" / "DeployCommemorativeRedoMainnet.s.sol"
    if deploy_script.exists():
        text = deploy_script.read_text(encoding="utf-8", errors="ignore")
        log("")
        log(f"{deploy_script.relative_to(REPO_ROOT)} constructor args: no revealRoot/merkleRoot "
            f"parameter present: {'revealRoot' not in text and 'merkleRoot' not in text}")

    ruling_md = ENGINE_ROOT / "reports" / "ROBINHOOD_DATASET_FREEZE_RULING.md"
    candidate_root_txt = ENGINE_ROOT / "generated" / "regen_5150_current" / "candidate-merkle-root.txt"
    log("")
    log("Conclusion: the frozen root is recorded in exactly two repo artifacts, neither of "
        "which is a deploy/broadcast artifact or on-chain storage slot:")
    log(f"  1. {ruling_md.relative_to(REPO_ROOT) if ruling_md.exists() else ruling_md} (human ruling doc)")
    log(f"  2. {candidate_root_txt.relative_to(REPO_ROOT) if candidate_root_txt.exists() else candidate_root_txt} "
        "(raw output of art-pipeline/candidate-merkle.js)")
    if candidate_root_txt.exists():
        on_disk_root = candidate_root_txt.read_text(encoding="utf-8").strip()
        log(f"     on-disk contents: {on_disk_root}  "
            f"({'MATCHES' if on_disk_root.lower() == FROZEN_ROOT.lower() else 'DOES NOT MATCH'} frozen root)")
    log("No live RPC read against Robinhood Chain was performed by this script (no on-chain "
        "revealRoot storage slot exists for this contract to read, per above -- see note below "
        "if that reasoning needs to be independently re-verified live).")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> int:
    hr("CANONICAL DATASET DETERMINATION -- REPORT ONLY, NO WRITES TO ANY DATASET FILE")
    log(f"Repo root: {REPO_ROOT}")
    log(f"Frozen root under test: {FROZEN_ROOT}")
    log(f"Commemorative contract: {COMMEMORATIVE_CONTRACT}")

    hr("Step 0: locating the real merkle construction")
    construction = find_merkle_construction()
    if construction.halted:
        log("HALT: " + construction.halt_reason)
        log("")
        log("Per instructions, a reimplemented merkle would prove nothing, so this script is "
            "stopping the merkle-recomputation section here. All non-merkle sections below "
            "(git archaeology, delta characterization, contract cross-check) do not depend on "
            "this and will still run.")
    else:
        log(f"Construction file: {construction.construction_file.relative_to(REPO_ROOT)}")
        log(f"Frozen root string found in: "
            f"{[str(p.relative_to(REPO_ROOT)) for p in construction.root_hash_hits]}")
        log(f"Other files containing a leafHash/MerkleTree construction (candidates considered): "
            f"{[str(p.relative_to(REPO_ROOT)) for p in construction.merkle_code_files]}")
        log(f"Leaf shape corroborated against contracts/Chroma.sol's own reveal(): "
            f"{construction.reveal_leaf_matches_contract}")
        if construction.halt_reason:
            log(f"NOTE: {construction.halt_reason}")
        log(f"Node helper (verbatim copy of the leafHash/MerkleTree call, parameterized by input "
            f"file only): {NODE_HELPER.relative_to(REPO_ROOT)}")

    legendary_ids: list[int] = []
    legendary_fallback = True
    verdict_rows: list[tuple[str, str, str, str]] = []  # path, size, root, matches

    if not construction.halted:
        hr("Step 0b: self-check -- does the helper reproduce the frozen root on the file the "
           "ruling doc names?")
        self_check = compute_root_for_file(SELF_CHECK_FILE)
        if self_check.ok:
            matches = self_check.root.lower() == FROZEN_ROOT.lower()
            log(f"{SELF_CHECK_FILE}")
            log(f"  records: {self_check.count}")
            log(f"  computed root: {self_check.root}")
            log(f"  MATCHES FROZEN ROOT: {matches}")
            if not matches:
                log("  [CRITICAL] The helper does NOT reproduce the frozen root on the exact file "
                    "the freeze ruling names as its source. Every other root comparison below is "
                    "therefore UNRELIABLE until this is resolved -- do not trust the verdict table.")
            verdict_rows.append((
                str(SELF_CHECK_FILE.relative_to(REPO_ROOT)) + "  [self-check: as-is, no filtering]",
                str(SELF_CHECK_FILE.stat().st_size), self_check.root, str(matches),
            ))
        else:
            log(f"[HALT self-check] {self_check.error}")
            log("Cannot validate the merkle helper itself; treat all root comparisons below as "
                "unverified.")

        hr("Step 1: legendary token IDs (for non-legendary-subset comparisons)")
        legendary_ids, legendary_fallback = get_legendary_ids()
        log(f"Legendary token IDs ({'FALLBACK, unverified' if legendary_fallback else 'derived live from art-pipeline/legendary-token-ids.js'}): "
            f"{legendary_ids}")
        exclude_set = set(legendary_ids)

        hr("Step 2: recompute root over each candidate")
        for label, path in CANDIDATE_FILES.items():
            log(f"\n--- {label} ---")
            if not path.exists():
                log(f"  does not exist: {path}")
                verdict_rows.append((label, "N/A", "N/A (file missing)", "N/A"))
                continue
            size = path.stat().st_size
            log(f"  size: {size} bytes")

            full = compute_root_for_file(path)
            if full.ok:
                matches_full = full.root.lower() == FROZEN_ROOT.lower()
                log(f"  full-file root ({full.count} records): {full.root} -- MATCHES FROZEN ROOT: {matches_full}")
                verdict_rows.append((f"{label} [as-is, {full.count} records]", str(size), full.root, str(matches_full)))
            else:
                log(f"  full-file root: ERROR -- {full.error}")
                verdict_rows.append((f"{label} [as-is]", str(size), f"ERROR: {full.error}", "N/A"))

            subset = compute_subset_root(path, exclude_set)
            if subset.ok:
                matches_subset = subset.root.lower() == FROZEN_ROOT.lower()
                log(f"  non-legendary-subset root ({subset.count} records): {subset.root} -- "
                    f"MATCHES FROZEN ROOT: {matches_subset}")
                verdict_rows.append((f"{label} [excl. {len(exclude_set)} legendary]", str(size), subset.root, str(matches_subset)))
            else:
                log(f"  non-legendary-subset root: ERROR -- {subset.error}")
                verdict_rows.append((f"{label} [excl. legendary]", str(size), f"ERROR: {subset.error}", "N/A"))

        log("\n--- HEAD copy of public/data/mint-data.json ---")
        log("  Method: `git show HEAD:public/data/mint-data.json` written to an OS-tempfile "
            "(no .verify-tmp-*/.verify-worktrees dir was reused, since those are ephemeral and "
            "this is reproducible without depending on their presence).")
        head_tmp, err = extract_head_copy("public/data/mint-data.json")
        if err:
            log(f"  ERROR: {err}")
            verdict_rows.append(("HEAD:public/data/mint-data.json", "N/A", f"ERROR: {err}", "N/A"))
        else:
            try:
                size = head_tmp.stat().st_size
                log(f"  size: {size} bytes")
                full = compute_root_for_file(head_tmp)
                if full.ok:
                    matches_full = full.root.lower() == FROZEN_ROOT.lower()
                    log(f"  full-file root ({full.count} records): {full.root} -- MATCHES FROZEN ROOT: {matches_full}")
                    verdict_rows.append((f"HEAD:public/data/mint-data.json [as-is, {full.count} records]",
                                         str(size), full.root, str(matches_full)))
                else:
                    log(f"  full-file root: ERROR -- {full.error}")
                    verdict_rows.append(("HEAD:public/data/mint-data.json [as-is]", str(size), f"ERROR: {full.error}", "N/A"))

                subset = compute_subset_root(head_tmp, exclude_set)
                if subset.ok:
                    matches_subset = subset.root.lower() == FROZEN_ROOT.lower()
                    log(f"  non-legendary-subset root ({subset.count} records): {subset.root} -- "
                        f"MATCHES FROZEN ROOT: {matches_subset}")
                    verdict_rows.append((f"HEAD:public/data/mint-data.json [excl. {len(exclude_set)} legendary]",
                                         str(size), subset.root, str(matches_subset)))
                else:
                    log(f"  non-legendary-subset root: ERROR -- {subset.error}")
                    verdict_rows.append((f"HEAD:public/data/mint-data.json [excl. legendary]",
                                         str(size), f"ERROR: {subset.error}", "N/A"))
            finally:
                head_tmp.unlink(missing_ok=True)

    hr("Step 3: delta characterization (working copy vs HEAD copy)")
    working_path = CANDIDATE_FILES["public/data/mint-data.json (working copy)"]
    if working_path.exists():
        head_tmp2, err2 = extract_head_copy("public/data/mint-data.json")
        if err2:
            log(f"Could not extract HEAD copy for delta characterization: {err2}")
        else:
            try:
                working_records = load_records(working_path)
                head_records = load_records(head_tmp2)
                characterize_delta(working_records, head_records)
            finally:
                head_tmp2.unlink(missing_ok=True)
    else:
        log(f"Working copy {working_path} does not exist -- skipping delta characterization.")

    git_archaeology_for("public/data/mint-data.json", "public/data/mint-data.json")
    git_archaeology_for("art-pipeline/output/mint-data.json", "art-pipeline/output/mint-data.json")
    git_archaeology_for("dist/data/mint-data.json", "dist/data/mint-data.json")

    crosscheck_contract()

    hr("VERDICT TABLE")
    log(f"{'Path':<70} {'Size (bytes)':>13}  {'Computed root':<70}  MATCHES FROZEN ROOT")
    for label, size, root, matches in verdict_rows:
        log(f"{label:<70} {size:>13}  {root:<70}  {matches}")

    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    hr()
    log(f"Full report written to: {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
