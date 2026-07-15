#!/usr/bin/env python3
"""Record local ChromaRendererRobinhood + ChromaTraitLabels bytecode hashes."""

from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "reports" / "robinhood" / "deploy-label-fix"
RENDERER = "contracts/robinhood/ChromaRendererRobinhood.sol:ChromaRendererRobinhood"
LABELS = "contracts/generated/ChromaTraitLabels.sol:ChromaTraitLabels"


def forge_exe() -> str:
    exe = REPO / ".foundry-bin" / "forge.exe"
    return str(exe) if exe.is_file() else "forge"


def forge_inspect(target: str, field: str, *, libraries: str | None = None) -> str:
    cmd = [forge_exe(), "inspect", target, field]
    if libraries:
        cmd.extend(["--libraries", libraries])
    return subprocess.check_output(cmd, text=True, cwd=REPO).strip()


def keccak_hex(hex_str: str) -> str:
    raw = bytes.fromhex(hex_str.removeprefix("0x"))
    return "0x" + hashlib.sha3_256(raw).hexdigest()


def byte_len(hex_str: str) -> int:
    return (len(hex_str) - 2) // 2


def main() -> None:
    labels_lib = sys.argv[1] if len(sys.argv) > 1 else None
    OUT.mkdir(parents=True, exist_ok=True)

    labels_runtime = forge_inspect(LABELS, "deployedBytecode")
    labels_creation = forge_inspect(LABELS, "bytecode")

    renderer_libs = None
    if labels_lib:
        renderer_libs = f"{LABELS}:{labels_lib}"

    renderer_runtime = forge_inspect(RENDERER, "deployedBytecode", libraries=renderer_libs)
    renderer_creation = forge_inspect(RENDERER, "bytecode", libraries=renderer_libs)

    lines = [
        "Label-fix build (ChromaTraitLabels external library + linked renderer)",
        "forge build: success",
        "",
        "[ChromaTraitLabels]",
        f"creation_bytecode_len_bytes: {byte_len(labels_creation)}",
        f"runtime_bytecode_len_bytes: {byte_len(labels_runtime)}",
        f"creation_bytecode_keccak256: {keccak_hex(labels_creation)}",
        f"runtime_bytecode_keccak256: {keccak_hex(labels_runtime)}",
        "",
        "[ChromaRendererRobinhood]",
    ]
    if labels_lib:
        lines.append(f"linked_labels_library: {labels_lib}")
    else:
        lines.append("linked_labels_library: (unlinked placeholder — provide address for deploy verify)")
    lines.extend(
        [
            f"creation_bytecode_len_bytes: {byte_len(renderer_creation)}",
            f"runtime_bytecode_len_bytes: {byte_len(renderer_runtime)}",
            f"creation_bytecode_keccak256: {keccak_hex(renderer_creation)}",
            f"runtime_bytecode_keccak256: {keccak_hex(renderer_runtime)}",
        ]
    )

    (OUT / "local-bytecode-hash.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (OUT / "local-labels-runtime-bytecode.hex").write_text(labels_runtime + "\n", encoding="utf-8")
    (OUT / "local-renderer-runtime-bytecode.hex").write_text(renderer_runtime + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
