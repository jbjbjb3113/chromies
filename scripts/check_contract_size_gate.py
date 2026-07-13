#!/usr/bin/env python3
"""Fail CI if deployed contract runtime bytecode exceeds size gate (22,000 bytes)."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
GATE_BYTES = 22_000
WATCH = ("ChromaRenderer", "ChromaPaletteData")


def _forge() -> str:
    local = REPO / ".foundry-bin" / "forge.exe"
    return str(local) if local.is_file() else "forge"


def main() -> int:
    proc = subprocess.run(
        [_forge(), "build", "--sizes"],
        cwd=REPO,
        text=True,
        capture_output=True,
    )
    output = proc.stdout + proc.stderr
    if proc.returncode not in (0, 1):
        print(output, file=sys.stderr)
        return proc.returncode

    failures: list[str] = []
    for line in output.splitlines():
        for name in WATCH:
            if line.strip().startswith(f"| {name}"):
                parts = [p.strip() for p in line.split("|") if p.strip()]
                if len(parts) >= 2 and parts[1].replace(",", "").isdigit():
                    runtime = int(parts[1].replace(",", ""))
                    if runtime > GATE_BYTES:
                        failures.append(f"{name}: {runtime} B > gate {GATE_BYTES} B")

    if failures:
        print("Contract size gate FAILED:", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        return 1
    print(f"Contract size gate OK ({', '.join(WATCH)} <= {GATE_BYTES} B)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
