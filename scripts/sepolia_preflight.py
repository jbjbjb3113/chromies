#!/usr/bin/env python3
"""Print Sepolia deploy preflight (no secrets)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ENV = REPO / ".env"


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
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


def main() -> int:
    env = load_env(ENV)
    pk = env.get("PRIVATE_KEY", "")
    rpc = env.get("SEPOLIA_RPC_URL", "")
    if not pk or not rpc:
        print("Missing PRIVATE_KEY or SEPOLIA_RPC_URL in .env", file=sys.stderr)
        return 1

    deployer = cast("wallet", "address", "--private-key", pk)
    chain_id = int(cast("chain-id", "--rpc-url", rpc))
    balance_wei = int(cast("balance", deployer, "--rpc-url", rpc))
    balance_eth = balance_wei / 10**18

    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True, cwd=REPO).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], text=True, cwd=REPO).strip())

    print(json.dumps(
        {
            "deployer": deployer,
            "balance_eth": round(balance_eth, 6),
            "chain_id": chain_id,
            "chain_name": "Sepolia" if chain_id == 11155111 else "UNKNOWN",
            "rpc_alias": "sepolia (foundry.toml → SEPOLIA_RPC_URL)",
            "git_commit": commit,
            "working_tree_dirty": dirty,
            "sepolia_confirmed": chain_id == 11155111,
        },
        indent=2,
    ))
    return 0 if chain_id == 11155111 else 2


if __name__ == "__main__":
    raise SystemExit(main())
