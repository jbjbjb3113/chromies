#!/usr/bin/env python3
"""Repeatable wiring assertions against live Sepolia deployment."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ENV = REPO / ".env"
DEPLOY_LOG = REPO / "chromies-engine" / "reports" / "SEPOLIA_DEPLOY_LOG.md"

# Post-deploy defaults (override via env)
DEFAULTS = {
    "CHROMA_STORAGE_ADDRESS": "0x557933b09005C6254d3884A1F93a03e740920A42",
    "CHROMA_ADDRESS": "0x8162114c056DfC49045c04C66f1E03b761d81eD5",
    "CHROMA_RENDERER_ADDRESS": "0x7680D210ed242330877b31D9749a92307484Aae1",
    "CHROMA_PALETTE_DATA_ADDRESS": "0x4Ff9Ef71A403579DdfCaC5294792306ebD38F0a7",
    "DEPLOYER_ADDRESS": "0xa29A83012CEE23A51ED4B7e087cE5aA0790FB06a",
}


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


def addr_eq(a: str, b: str) -> bool:
    return a.lower().replace("0x", "") == b.lower().replace("0x", "")


def main() -> int:
    env = load_env(ENV)
    # Deploy log addresses win over stale .env contract refs
    cfg = {**env, **DEFAULTS}
    rpc = cfg.get("SEPOLIA_RPC_URL", "")
    if not rpc:
        print("Missing SEPOLIA_RPC_URL", file=sys.stderr)
        return 1

    storage = cfg["CHROMA_STORAGE_ADDRESS"]
    chroma = cfg["CHROMA_ADDRESS"]
    renderer = cfg["CHROMA_RENDERER_ADDRESS"]
    palette = cfg["CHROMA_PALETTE_DATA_ADDRESS"]
    deployer = cfg["DEPLOYER_ADDRESS"]

    chain_id = int(cast("chain-id", "--rpc-url", rpc))
    if chain_id != 11155111:
        print(f"STOP: chain_id={chain_id}, expected Sepolia 11155111", file=sys.stderr)
        return 2

    failures: list[str] = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {label}" + (f" — {detail}" if detail else ""))
        if not ok:
            failures.append(label)

    print("Sepolia wiring verification")
    print(f"  chain_id={chain_id}")
    print(f"  renderer={renderer}")
    print(f"  paletteData={palette}")
    print(f"  storage={storage}")
    print(f"  chroma={chroma}")
    print()

    renderer_palette = cast("call", renderer, "paletteData()(address)", "--rpc-url", rpc)
    renderer_storage = cast("call", renderer, "chromaStorage()(address)", "--rpc-url", rpc)
    renderer_owner = cast("call", renderer, "owner()(address)", "--rpc-url", rpc)
    chroma_renderer = cast("call", chroma, "renderer()(address)", "--rpc-url", rpc)

    check("renderer.paletteData == ChromaPaletteData", addr_eq(renderer_palette, palette), renderer_palette)
    check("renderer.chromaStorage == ChromaStorage", addr_eq(renderer_storage, storage), renderer_storage)
    check("renderer owner == deploy wallet", addr_eq(renderer_owner, deployer), renderer_owner)
    check("Chroma.renderer == ChromaRenderer", addr_eq(chroma_renderer, renderer), chroma_renderer)

    # ChromaPaletteData has no owner — owner() should revert
    try:
        cast("call", palette, "owner()(address)", "--rpc-url", rpc)
        check("ChromaPaletteData has no owner", False, "owner() succeeded unexpectedly")
    except subprocess.CalledProcessError:
        check("ChromaPaletteData has no owner (ownerless)", True)

    result = {
        "chain_id": chain_id,
        "passed": len(failures) == 0,
        "failures": failures,
        "addresses": {
            "storage": storage,
            "chroma": chroma,
            "renderer": renderer,
            "paletteData": palette,
        },
    }
    print()
    if failures:
        print("STOP — wiring assertion failures:", failures, file=sys.stderr)
        return 1
    print("All wiring assertions passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
