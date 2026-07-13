#!/usr/bin/env python3
"""Extract gas-regression fixture rows from parity_fixtures.csv."""

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PARITY_CSV = REPO / "chromies-engine" / "generated" / "parity_fixtures.csv"
OUT_CSV = REPO / "chromies-engine" / "generated" / "gas_regression_fixtures.csv"
SEEDS = (260, 680)


def main() -> int:
    if not PARITY_CSV.is_file():
        print(f"Missing {PARITY_CSV} — run parity_harness.py first.", file=sys.stderr)
        return 1
    lines = PARITY_CSV.read_text(encoding="utf-8").splitlines()
    header = lines[0]
    want = set(SEEDS)
    picked: list[str] = []
    for line in lines[1:]:
        if not line.strip():
            continue
        token_id = int(line.split(",", 1)[0])
        if token_id in want:
            picked.append(line)
            want.discard(token_id)
    if want:
        print(f"Missing seeds in parity csv: {sorted(want)}", file=sys.stderr)
        return 1
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    OUT_CSV.write_text(header + "\n" + "\n".join(sorted(picked, key=lambda r: int(r.split(",", 1)[0]))) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_CSV} ({len(picked)} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
