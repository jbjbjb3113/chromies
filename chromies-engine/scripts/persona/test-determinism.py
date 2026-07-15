"""Determinism test for the persona seed compiler.

Runs compile-persona-seeds.py twice into separate temp files and asserts the
outputs are byte-identical. Exits non-zero on any divergence.

Usage:
    python test-determinism.py
"""

from __future__ import annotations

import hashlib
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
COMPILER = HERE / "compile-persona-seeds.py"


def run_compiler(out_path: Path) -> None:
    result = subprocess.run(
        [sys.executable, str(COMPILER), "--out", str(out_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
        sys.exit(f"compiler run failed (exit {result.returncode})")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="persona-determinism-") as tmp:
        out_a = Path(tmp) / "persona-seeds-run-a.json"
        out_b = Path(tmp) / "persona-seeds-run-b.json"

        run_compiler(out_a)
        run_compiler(out_b)

        bytes_a = out_a.read_bytes()
        bytes_b = out_b.read_bytes()
        sha_a = hashlib.sha256(bytes_a).hexdigest()
        sha_b = hashlib.sha256(bytes_b).hexdigest()

        print(f"run A: {len(bytes_a)} bytes  sha256={sha_a}")
        print(f"run B: {len(bytes_b)} bytes  sha256={sha_b}")

        if bytes_a != bytes_b:
            sys.exit("FAIL: compiler output is not byte-identical across runs")

        print("PASS: byte-identical output across two runs")


if __name__ == "__main__":
    main()
