#!/usr/bin/env python3
"""Export parity + gas-regression fixture CSVs from Python payload pipeline."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "chromies-engine"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine.payload_pipeline import generate_chromie_payload

GENERATED = ROOT / "generated"
PARITY_CSV = GENERATED / "parity_fixtures.csv"
GAS_CSV = GENERATED / "gas_regression_fixtures.csv"


def export_seeds(seeds: list[int], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["token_id", "pixels_hex", "traits_hex"])
        for seed in seeds:
            result = generate_chromie_payload(seed, seed)
            w.writerow([seed, result.pixels_hex, result.traits_hex])
    print(f"Wrote {out} ({len(seeds)} rows)")


def main() -> int:
    baseline = list(range(1, 1012))
    # Supplemental forced-coverage token ids (parity_harness missing palette IDs).
    supplemental = [90_000 + pid for pid in range(11)]
    export_seeds(baseline + supplemental, PARITY_CSV)
    export_seeds([260, 680], GAS_CSV)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
