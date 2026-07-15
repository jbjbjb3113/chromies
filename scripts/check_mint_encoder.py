#!/usr/bin/env python3
"""Regenerate mint encoder artifacts and fail if committed outputs drift."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
COMPILE = REPO / "scripts" / "compile_palette_registry.py"
TRACKED = [
    REPO / "contracts" / "generated" / "ChromaPaletteData.sol",
    REPO / "contracts" / "generated" / "ChromaTraitLabels.sol",
    REPO / "test" / "size" / "InlinePaletteProbe.sol",
    REPO / "art-pipeline" / "generated" / "on-chain-palette-bytes.js",
    REPO / "art-pipeline" / "generated" / "on-chain-bg-colors.js",
    REPO / "art-pipeline" / "generated" / "on-chain-character-bytes.js",
    REPO / "art-pipeline" / "generated" / "on-chain-trait-bytes.js",
    REPO / "art-pipeline" / "on-chain-character-bytes.js",
    REPO / "art-pipeline" / "trait-byte-registry.json",
    REPO / "chromies-engine" / "engine_data" / "on_chain_palette_bytes.json",
    REPO / "chromies-engine" / "engine_data" / "on_chain_trait_bytes.json",
    REPO / "chromies-engine" / "engine_data" / "palette_colors_expanded.json",
    REPO / "chromies-engine" / "engine_data" / "bg_colors.json",
]


def _python() -> str:
    venv = REPO / "chromies-engine" / ".venv" / "Scripts" / "python.exe"
    return str(venv) if venv.is_file() else sys.executable


def main() -> int:
    subprocess.run([_python(), str(COMPILE)], cwd=REPO, check=True)
    diff = subprocess.run(
        ["git", "diff", "--exit-code", "--"] + [str(p) for p in TRACKED],
        cwd=REPO,
    )
    if diff.returncode != 0:
        print(
            "Mint encoder outputs are stale. Run: py -3 scripts/compile_palette_registry.py\n"
            "  (authoritative generator for ChromaTraitLabels.sol, on-chain-trait-bytes.js, "
            "ChromaPaletteData.sol, and related artifacts — then commit).",
            file=sys.stderr,
        )
        return 1
    print("Mint encoder artifacts match compiler output.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
