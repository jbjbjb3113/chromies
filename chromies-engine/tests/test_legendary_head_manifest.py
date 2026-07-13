"""Pinned legendary head component manifest must match on-disk PNGs."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECK_SCRIPT = ROOT / "scripts" / "check-legendary-heads.js"


def test_legendary_head_manifest_matches_files() -> None:
    node = shutil.which("node")
    if node is None or not CHECK_SCRIPT.is_file():
        return
    proc = subprocess.run([node, str(CHECK_SCRIPT)], cwd=ROOT, capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
