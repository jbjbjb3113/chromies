#!/usr/bin/env python3
"""Verify deployed ChromaRenderer + ChromaPaletteData by construction (no txs).

Proof A — logic: eth_getCode runtime bytecode matches locally compiled artifact
  (CBOR metadata suffix stripped; ChromaRenderer immutable address slots masked).
  ChromaPaletteData bytecode compare is skipped while KNOWN_DRIFT waivers are active.

Proof B — data: all 80 palettes × 16 color slots read from live ChromaPaletteData
  match registry-compiled values. IDs on the KNOWN_DRIFT waiver list may differ
  (PASS-WITH-WAIVER); any other divergence is a hard FAIL.

Usage:
  python scripts/verify_deployed_artifacts.py
  python scripts/verify_deployed_artifacts.py --json-out chromies-engine/generated/verify_deployed_artifacts.json
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ENV = REPO / ".env"
REGISTRY = REPO / "chromies-engine" / "engine_data" / "palette_colors_expanded.json"
RENDERER_ARTIFACT = REPO / "out" / "ChromaRenderer.sol" / "ChromaRenderer.json"
PALETTE_ARTIFACT = REPO / "out" / "ChromaPaletteData.sol" / "ChromaPaletteData.json"
KNOWN_DRIFT_JSON = REPO / "chromies-engine" / "reports" / "known_drift.json"
KNOWN_DRIFT_DOC = REPO / "chromies-engine" / "reports" / "KNOWN_DRIFT.md"

DEFAULTS = {
    "CHROMA_STORAGE_ADDRESS": "0x557933b09005C6254d3884A1F93a03e740920A42",
    "CHROMA_RENDERER_ADDRESS": "0x7680D210ed242330877b31D9749a92307484Aae1",
    "CHROMA_PALETTE_DATA_ADDRESS": "0x4Ff9Ef71A403579DdfCaC5294792306ebD38F0a7",
}

# Wraparound-fix / special-coverage palette IDs (full table still audited 0–79).
COVERAGE_IDS = [24, 27, *range(28, 37)]

CBOR_MARKER = bytes.fromhex("a264697066735822")
MAX_PALETTE_ID = 79
SLOTS_PER_PALETTE = 16


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def cast(*args: str) -> str:
    exe = REPO / ".foundry-bin" / "cast.exe"
    cmd = [str(exe) if exe.is_file() else "cast", *args]
    return subprocess.check_output(cmd, text=True, cwd=REPO).strip()


def forge(*args: str) -> None:
    exe = REPO / ".foundry-bin" / "forge.exe"
    cmd = [str(exe) if exe.is_file() else "forge", *args]
    subprocess.run(cmd, cwd=REPO, check=True, capture_output=True)


def git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, cwd=REPO
        ).strip()
    except subprocess.CalledProcessError:
        return "unknown"


def hex_to_bytes(raw: str) -> bytes:
    h = raw.strip().lower()
    if h.startswith("0x"):
        h = h[2:]
    if len(h) % 2:
        h = "0" + h
    return bytes.fromhex(h)


def strip_cbor_metadata(code: bytes) -> tuple[bytes, int]:
    idx = code.find(CBOR_MARKER)
    if idx == -1:
        return code, 0
    return code[:idx], len(code) - idx


def load_artifact_bytecode(path: Path) -> bytes:
    data = json.loads(path.read_text(encoding="utf-8"))
    obj = data["deployedBytecode"]["object"]
    return hex_to_bytes(obj)


def immutable_refs(path: Path) -> list[dict[str, int]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    refs = data.get("deployedBytecode", {}).get("immutableReferences") or {}
    out: list[dict[str, int]] = []
    for entries in refs.values():
        out.extend(entries)
    return out


def mask_immutable_slots(code: bytearray, refs: list[dict[str, int]]) -> None:
    for ref in refs:
        start = ref["start"]
        length = ref["length"]
        code[start : start + length] = b"\x00" * length


def compare_bytecode(
    label: str,
    on_chain: bytes,
    local: bytes,
    *,
    immutable_refs_list: list[dict[str, int]] | None = None,
) -> dict:
    on_stripped, on_cbor = strip_cbor_metadata(on_chain)
    local_stripped, local_cbor = strip_cbor_metadata(local)

    on_norm = bytearray(on_stripped)
    local_norm = bytearray(local_stripped)
    masked_ranges: list[dict[str, int]] = []

    if immutable_refs_list:
        mask_immutable_slots(on_norm, immutable_refs_list)
        mask_immutable_slots(local_norm, immutable_refs_list)
        masked_ranges = immutable_refs_list

    ok = on_norm == local_norm
    first_diff: int | None = None
    if not ok:
        limit = min(len(on_norm), len(local_norm))
        for i in range(limit):
            if on_norm[i] != local_norm[i]:
                first_diff = i
                break
        if first_diff is None and len(on_norm) != len(local_norm):
            first_diff = limit

    return {
        "contract": label,
        "pass": ok,
        "on_chain_bytes": len(on_chain),
        "local_bytes": len(local),
        "cbor_suffix_bytes": {"on_chain": on_cbor, "local": local_cbor},
        "compared_logic_bytes": len(on_norm),
        "masked": {
            "cbor_metadata_suffix": "stripped from both sides (Solidity ipfs hash varies by build path)",
            "immutable_slots": masked_ranges or "none",
            "immutable_note": (
                "ChromaRenderer chromaStorage + paletteData immutables zeroed at compiler-reported "
                "offsets; wiring script confirms live values point at deployed storage/paletteData."
            )
            if immutable_refs_list
            else "ChromaPaletteData has no immutables",
        },
        "first_diff_offset": first_diff,
    }


def normalize_hex_color(value: str) -> str:
    v = value.strip().lower()
    if not v.startswith("#"):
        v = f"#{v}"
    return v


def read_live_palette_colors(palette_addr: str, rpc: str, palette_id: int) -> list[str]:
    raw = cast(
        "call",
        palette_addr,
        "paletteColors(uint8)(string[16])",
        str(palette_id),
        "--rpc-url",
        rpc,
    )
    colors = json.loads(raw)
    if len(colors) != SLOTS_PER_PALETTE:
        raise RuntimeError(f"palette {palette_id}: expected 16 colors, got {len(colors)}")
    return [normalize_hex_color(c) for c in colors]


def load_known_drift() -> list[int]:
    """Machine-readable waiver list (human record: chromies-engine/reports/KNOWN_DRIFT.md)."""
    if not KNOWN_DRIFT_JSON.is_file():
        return []
    data = json.loads(KNOWN_DRIFT_JSON.read_text(encoding="utf-8"))
    return sorted(int(pid) for pid in data.get("waived_palette_ids", []))


def audit_palette_data(
    palette_addr: str, rpc: str, registry_path: Path, *, waiver_ids: list[int]
) -> dict:
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    palettes = registry["palettes"]

    mismatches: list[dict] = []
    checked = 0
    coverage_ok: dict[str, bool] = {}
    palette_differs: dict[int, bool] = {}

    for pid in range(MAX_PALETTE_ID + 1):
        key = str(pid)
        expected = [normalize_hex_color(c) for c in palettes[key]["colors"]]
        live = read_live_palette_colors(palette_addr, rpc, pid)
        checked += SLOTS_PER_PALETTE

        palette_ok = live == expected
        palette_differs[pid] = not palette_ok
        if pid in COVERAGE_IDS:
            coverage_ok[str(pid)] = palette_ok

        if not palette_ok:
            for slot, (exp, got) in enumerate(zip(expected, live)):
                if exp != got:
                    mismatches.append(
                        {
                            "palette_id": pid,
                            "name": palettes[key].get("name"),
                            "slot": slot,
                            "expected": exp,
                            "live": got,
                        }
                    )

    differing_ids = sorted(pid for pid, differs in palette_differs.items() if differs)
    waiver_set = set(waiver_ids)
    waived_active = [pid for pid in differing_ids if pid in waiver_set]
    unwaived = [pid for pid in differing_ids if pid not in waiver_set]
    stale_waiver = sorted(pid for pid in waiver_ids if not palette_differs[pid])

    if unwaived:
        status = "FAIL"
        pass_ok = False
    elif waived_active:
        status = "PASS-WITH-WAIVER"
        pass_ok = True
    else:
        status = "PASS"
        pass_ok = True

    return {
        "pass": pass_ok,
        "status": status,
        "slots_checked": checked,
        "slots_expected": (MAX_PALETTE_ID + 1) * SLOTS_PER_PALETTE,
        "palette_count": MAX_PALETTE_ID + 1,
        "coverage_ids": COVERAGE_IDS,
        "coverage_ids_pass": coverage_ok,
        "mismatch_count": len(mismatches),
        "mismatches": mismatches[:20],
        "waiver_ids": waiver_ids,
        "differing_palette_ids": differing_ids,
        "waived_active_ids": waived_active,
        "unwaived_differing_ids": unwaived,
        "stale_waiver_ids": stale_waiver,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Bytecode + palette data deploy verification")
    parser.add_argument("--json-out", type=Path, default=None)
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()

    cfg = {**load_env(ENV), **DEFAULTS}
    rpc = cfg.get("SEPOLIA_RPC_URL", "")
    if not rpc:
        print("Missing SEPOLIA_RPC_URL", file=sys.stderr)
        return 1

    renderer = cfg["CHROMA_RENDERER_ADDRESS"]
    palette = cfg["CHROMA_PALETTE_DATA_ADDRESS"]

    chain_id = int(cast("chain-id", "--rpc-url", rpc))
    if chain_id != 11155111:
        print(f"STOP: chain_id={chain_id}, expected Sepolia 11155111", file=sys.stderr)
        return 2

    if not args.skip_build:
        print("Building local artifacts (forge build)...")
        forge("build")

    for path in (RENDERER_ARTIFACT, PALETTE_ARTIFACT):
        if not path.is_file():
            print(f"Missing artifact: {path}", file=sys.stderr)
            return 1

    commit = git_commit()
    waiver_ids = load_known_drift()
    print("Deployed artifact verification (by construction)")
    print(f"  git commit: {commit[:12]}")
    print(f"  chain_id:   {chain_id}")
    print(f"  renderer:   {renderer}")
    print(f"  palette:    {palette}")
    if waiver_ids:
        print(f"  known drift: {len(waiver_ids)} waived palette ID(s) — see {KNOWN_DRIFT_DOC.relative_to(REPO)}")
    print()

    on_renderer = hex_to_bytes(cast("code", renderer, "--rpc-url", rpc))
    on_palette = hex_to_bytes(cast("code", palette, "--rpc-url", rpc))
    local_renderer = load_artifact_bytecode(RENDERER_ARTIFACT)
    local_palette = load_artifact_bytecode(PALETTE_ARTIFACT)
    renderer_refs = immutable_refs(RENDERER_ARTIFACT)

    proof_a_renderer = compare_bytecode(
        "ChromaRenderer",
        on_renderer,
        local_renderer,
        immutable_refs_list=renderer_refs,
    )
    skip_palette_bytecode = bool(waiver_ids)
    if skip_palette_bytecode:
        proof_a_palette = {
            "contract": "ChromaPaletteData",
            "pass": True,
            "skipped": True,
            "skip_reason": "active KNOWN_DRIFT waivers — local artifact embeds HEAD registry",
            "on_chain_bytes": len(on_palette),
            "local_bytes": len(local_palette),
        }
    else:
        proof_a_palette = compare_bytecode(
            "ChromaPaletteData",
            on_palette,
            local_palette,
        )

    print("Proof A — runtime bytecode")
    renderer_status = "PASS" if proof_a_renderer["pass"] else "FAIL"
    print(
        f"  [{renderer_status}] {proof_a_renderer['contract']}: "
        f"{proof_a_renderer['compared_logic_bytes']} logic bytes compared "
        f"(cbor stripped: on-chain {proof_a_renderer['cbor_suffix_bytes']['on_chain']} B, "
        f"local {proof_a_renderer['cbor_suffix_bytes']['local']} B)"
    )
    if not proof_a_renderer["pass"]:
        print(
            f"         first diff at byte offset {proof_a_renderer['first_diff_offset']}",
            file=sys.stderr,
        )

    if skip_palette_bytecode:
        print(
            f"  [SKIP-WAIVER] ChromaPaletteData: bytecode compare skipped — "
            f"{proof_a_palette['skip_reason']}"
        )
    else:
        palette_status = "PASS" if proof_a_palette["pass"] else "FAIL"
        print(
            f"  [{palette_status}] {proof_a_palette['contract']}: "
            f"{proof_a_palette['compared_logic_bytes']} logic bytes compared "
            f"(cbor stripped: on-chain {proof_a_palette['cbor_suffix_bytes']['on_chain']} B, "
            f"local {proof_a_palette['cbor_suffix_bytes']['local']} B)"
        )
        if not proof_a_palette["pass"]:
            print(
                f"         first diff at byte offset {proof_a_palette['first_diff_offset']}",
                file=sys.stderr,
            )

    print()
    print("Proof B — palette data read-back (80 palettes × 16 slots)")
    proof_b = audit_palette_data(palette, rpc, REGISTRY, waiver_ids=waiver_ids)
    registry_palettes = json.loads(REGISTRY.read_text(encoding="utf-8"))["palettes"]
    status = proof_b["status"]
    exact_palettes = proof_b["palette_count"] - len(proof_b["differing_palette_ids"])
    slot_summary = (
        f"{exact_palettes}/{proof_b['palette_count']} palettes exact"
        if status == "PASS-WITH-WAIVER"
        else f"{proof_b['slots_checked']}/{proof_b['slots_expected']} slots exact ({proof_b['palette_count']} palettes)"
    )
    print(f"  [{status}] {slot_summary}")
    if status == "PASS-WITH-WAIVER":
        waived_names = [
            f"{pid} ({registry_palettes[str(pid)]['name']})" for pid in proof_b["waived_active_ids"]
        ]
        print(f"  ~~ waived drift (expected until ChromaPaletteData redeploy): {', '.join(waived_names)}")
        print(f"  ~~ human record: {KNOWN_DRIFT_DOC.relative_to(REPO)}")
    if proof_b["stale_waiver_ids"]:
        stale_names = [
            f"{pid} ({registry_palettes[str(pid)]['name']})" for pid in proof_b["stale_waiver_ids"]
        ]
        print(f"  !! stale-waiver — drift resolved, remove from known_drift.json: {', '.join(stale_names)}")
    if proof_b["unwaived_differing_ids"]:
        unwaived_names = [
            f"{pid} ({registry_palettes[str(pid)]['name']})"
            for pid in proof_b["unwaived_differing_ids"]
        ]
        print(f"  !! unwaived divergence: {', '.join(unwaived_names)}", file=sys.stderr)

    coverage_line = "all pass" if all(proof_b["coverage_ids_pass"].values()) else "see per-ID below"
    if status == "PASS-WITH-WAIVER":
        coverage_line = "waived IDs expected to differ"
    print(f"  Coverage IDs {COVERAGE_IDS}: {coverage_line}")
    for pid, ok in sorted(proof_b["coverage_ids_pass"].items(), key=lambda x: int(x[0])):
        pid_int = int(pid)
        name = registry_palettes[pid]["name"]
        if pid_int in proof_b["stale_waiver_ids"]:
            mark = "stale-waiver"
        elif pid_int in proof_b["waived_active_ids"]:
            mark = "WAIVER"
        elif ok:
            mark = "ok"
        else:
            mark = "FAIL"
        print(f"    id {pid:>2} ({name}): {mark}")

    proof_a_pass = proof_a_renderer["pass"] and proof_a_palette["pass"]
    overall_pass = proof_a_pass and proof_b["pass"]

    result = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "git_commit": commit,
        "chain_id": chain_id,
        "addresses": {"renderer": renderer, "paletteData": palette},
        "known_drift": {
            "document": str(KNOWN_DRIFT_DOC.relative_to(REPO)),
            "json": str(KNOWN_DRIFT_JSON.relative_to(REPO)),
            "waived_palette_ids": waiver_ids,
        },
        "proof_a_bytecode": {
            "renderer": proof_a_renderer,
            "paletteData": proof_a_palette,
            "pass": proof_a_pass,
        },
        "proof_b_palette_slots": proof_b,
        "pass": overall_pass,
        "status": "PASS-WITH-WAIVER" if proof_b["status"] == "PASS-WITH-WAIVER" and overall_pass else (
            "PASS" if overall_pass else "FAIL"
        ),
        "transactions": 0,
        "reveal_root_touched": False,
    }

    print()
    if result["status"] == "PASS-WITH-WAIVER":
        print(
            "PASS-WITH-WAIVER — renderer bytecode match; palette drift limited to "
            "KNOWN_DRIFT waiver list."
        )
    elif result["pass"]:
        print("All checks PASS — deployed logic + data match local harness inputs.")
    else:
        print("STOP — verification failed.", file=sys.stderr)

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.json_out}")

    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
