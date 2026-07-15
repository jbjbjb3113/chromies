#!/usr/bin/env python3
"""Verify deployed ChromaTraitLabels + linked ChromaRendererRobinhood bytecode."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "reports" / "robinhood" / "deploy-label-fix"
RENDERER_ARTIFACT = REPO / "out" / "ChromaRendererRobinhood.sol" / "ChromaRendererRobinhood.json"
LABELS_TARGET = "contracts/generated/ChromaTraitLabels.sol:ChromaTraitLabels"
RENDERER_TARGET = "contracts/robinhood/ChromaRendererRobinhood.sol:ChromaRendererRobinhood"


def keccak_hex(raw: bytes) -> str:
    return "0x" + hashlib.sha3_256(raw).hexdigest()


def normalize_hex(hex_str: str) -> str:
    h = hex_str.strip().lower()
    if h.startswith("0x"):
        h = h[2:]
    return h


def pad_address(addr: str) -> bytes:
    a = normalize_hex(addr)
    return bytes.fromhex("0" * 24 + a)


def cast_code(address: str, rpc: str) -> str:
    cast = REPO / ".foundry-bin" / "cast.exe"
    cast_cmd = str(cast) if cast.is_file() else "cast"
    return subprocess.check_output(
        [cast_cmd, "code", address, "--rpc-url", rpc],
        text=True,
        cwd=REPO,
    ).strip()


def forge_runtime(target: str, *, libraries: str | None = None) -> str:
    forge = REPO / ".foundry-bin" / "forge.exe"
    forge_cmd = str(forge) if forge.is_file() else "forge"
    cmd = [forge_cmd, "inspect", target, "deployedBytecode"]
    if libraries:
        cmd.extend(["--libraries", libraries])
    return subprocess.check_output(cmd, text=True, cwd=REPO).strip()


def patch_immutables(hex_str: str, imm_refs: dict, imm_values: dict[str, str]) -> str:
    raw = bytearray(bytes.fromhex(normalize_hex(hex_str)))
    for imm_id, slots in imm_refs.items():
        value = pad_address(imm_values[imm_id])
        for slot in slots:
            start = slot["start"]
            length = slot["length"]
            raw[start : start + length] = value[:length]
    return "0x" + raw.hex()


def load_renderer_immutable_ids() -> tuple[dict, dict[str, str]]:
    artifact = json.loads(RENDERER_ARTIFACT.read_text(encoding="utf-8"))
    imm_refs = artifact["deployedBytecode"]["immutableReferences"]
    # immutables are declared in ChromaRenderer in source order: chromaStorage, paletteData
    # solc assigns numeric ids; map via artifact metadata ordering (36 first, 39 second in this build)
    ids = sorted(imm_refs, key=lambda x: int(x))
    return imm_refs, {ids[0]: "chromaStorage", ids[1]: "paletteData"}


def strip_metadata(hex_str: str) -> str:
    h = normalize_hex(hex_str)
    marker = "a264697066735822"
    idx = h.rfind(marker)
    if idx == -1:
        return h
    return h[:idx]


def compare(name: str, local_hex: str, onchain_hex: str, lines: list[str], *, strip_meta: bool = False) -> bool:
    local_norm = normalize_hex(local_hex)
    on_norm = normalize_hex(onchain_hex)
    if strip_meta:
        local_norm = strip_metadata(local_norm)
        on_norm = strip_metadata(on_norm)
        lines.append(f"{name}_metadata_stripped: true")
    lines.append(f"[{name}]")
    lines.append(f"local_runtime_len_bytes: {len(local_norm) // 2}")
    lines.append(f"onchain_runtime_len_bytes: {len(on_norm) // 2}")
    lines.append(f"local_runtime_keccak256: {keccak_hex(bytes.fromhex(local_norm))}")
    lines.append(f"onchain_runtime_keccak256: {keccak_hex(bytes.fromhex(on_norm))}")
    if local_norm == on_norm:
        lines.append(f"{name}_RESULT: PASS")
        lines.append("")
        return True
    lines.append(f"{name}_RESULT: FAIL")
    min_len = min(len(local_norm), len(on_norm))
    for i in range(0, min_len, 2):
        if local_norm[i : i + 2] != on_norm[i : i + 2]:
            lines.append(f"first_byte_offset: {i // 2}")
            lines.append(f"local_byte: 0x{local_norm[i:i+2]}")
            lines.append(f"onchain_byte: 0x{on_norm[i:i+2]}")
            break
    lines.append("")
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--renderer", required=True)
    parser.add_argument("--labels-lib", required=True)
    parser.add_argument("--chroma-storage", default="0x3C8C9615889762bDcF9647a3C86C74aFA498a158")
    parser.add_argument("--palette-data", default="0xb3ad67d60C44E6db461f8957AF7a2f664c01275a")
    parser.add_argument("--rpc", default="robinhood_mainnet")
    args = parser.parse_args()

    link = f"{LABELS_TARGET}:{args.labels_lib}"
    local_labels = forge_runtime(LABELS_TARGET)
    local_renderer = forge_runtime(RENDERER_TARGET, libraries=link)

    imm_refs, imm_names = load_renderer_immutable_ids()
    imm_values = {
        imm_id: args.chroma_storage if name == "chromaStorage" else args.palette_data
        for imm_id, name in imm_names.items()
    }
    local_renderer_patched = patch_immutables(local_renderer, imm_refs, imm_values)

    onchain_labels = cast_code(args.labels_lib, args.rpc)
    onchain_renderer = cast_code(args.renderer, args.rpc)

    lines = [
        f"renderer_address: {args.renderer}",
        f"labels_lib_address: {args.labels_lib}",
        f"rpc: {args.rpc}",
        f"note: renderer compare patches solc immutable slots (chromaStorage, paletteData)",
        "",
    ]
    ok_labels = compare("ChromaTraitLabels", local_labels, onchain_labels, lines)
    ok_renderer = compare(
        "ChromaRendererRobinhood",
        local_renderer_patched,
        onchain_renderer,
        lines,
        strip_meta=True,
    )
    lines.append(f"OVERALL_RESULT: {'PASS' if ok_labels and ok_renderer else 'FAIL'}")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "bytecode-verify.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (OUT / "local-renderer-runtime-patched.hex").write_text(local_renderer_patched + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if ok_labels and ok_renderer else 1


if __name__ == "__main__":
    sys.exit(main())
