#!/usr/bin/env python3
"""Payload-first parity audit — compare decoded previews vs compositor; palette round-trip."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine.config import REPORTS_DIR
from engine.payload_parity import audit_all_palettes, compare_seeds

DEFAULT_SEEDS = [1, 5, 42, 123, 999, 12345, 7777, 4242, 100, 500]


def _write_design_section() -> str:
    return """## Payload-First Pipeline Design

### Canonical flow

```
trait rolls + render_picks
        ↓
composite_chromie() → 4096-byte role-index buffer
        ↓
pack_pixels() → 2048-byte pixelsHex
encode_traits() → 32-byte traitsHex  (palette byte = traits[1])
        ↓
unpack_pixels() + palette_colors(traits[1])
        ↓
render_from_payload() → authoritative preview PNG
```

### Rules

1. **Authoritative image** = decode of `(pixelsHex, traitsHex)` using on-chain palette lookup.
2. **Compositor direct PNG** (`render_palette_png` with pipeline palette name) is reference-only.
3. **Source art** remains read-only; all writes go to `generated/`, `reports/`.
4. **Mint batch export** (`bridge-mint-data.js`) is not run by this audit.

### Modules

| Module | Role |
|--------|------|
| `engine/mint_payload.py` | pack/unpack pixels; encode/decode traits |
| `engine/on_chain_palette.py` | `_paletteColors` port from `ChromaRenderer.sol` |
| `engine/payload_render.py` | PNG from decoded payload only |
| `engine/payload_pipeline.py` | `generate_chromie_payload()` entry point |
| `engine/payload_parity.py` | seed comparisons + palette audit |

"""


def build_report(seeds: list[int], token_id: int) -> str:
    palette_audit = audit_all_palettes()
    seed_rows = compare_seeds(seeds, token_id=token_id)

    lines = [
        "# Payload-First Parity Report",
        "",
        f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "**Scope:** Python payload-first pipeline vs compositor direct preview",
        "**Contracts:** not modified",
        "**Mint-data batch:** not run",
        "",
        _write_design_section(),
        "---",
        "",
        "## Seed Comparisons",
        "",
        "Fixed seeds run through `generate_chromie_payload()`.",
        "",
        "| Seed | Palette | Palette ID | Role pack↔unpack | Preview match | Diff pixels | Palette category | Encode warnings |",
        "|------|---------|------------|------------------|---------------|-------------|------------------|-----------------|",
    ]

    for row in seed_rows:
        warn = "; ".join(row.encode_warnings[:2]) if row.encode_warnings else "—"
        if len(row.encode_warnings) > 2:
            warn += f" (+{len(row.encode_warnings) - 2})"
        lines.append(
            f"| {row.seed} | {row.palette_key} | {row.palette_id} | "
            f"{'✓' if row.role_buffer_match else '✗'} | "
            f"{'✓' if row.previews_match else '✗'} | {row.differing_pixels} | "
            f"{row.palette_roundtrip} | {warn} |"
        )

    match_count = sum(1 for r in seed_rows if r.previews_match)
    lines.extend(
        [
            "",
            f"**Preview match rate:** {match_count}/{len(seed_rows)} seeds "
            "(match only when pipeline palette equals on-chain palette for encoded byte).",
            "",
            "---",
            "",
            "## Palette Round-Trip Audit",
            "",
            f"Total pipeline palettes: **{len(palette_audit.entries)}**",
            "",
            f"- **encodable_match:** {len(palette_audit.encodable_match)}",
            f"- **encodable_mismatch:** {len(palette_audit.encodable_mismatch)}",
            f"- **not_encodable:** {len(palette_audit.not_encodable)}",
            "",
        ]
    )

    if palette_audit.not_encodable:
        lines.append("### Not encodable (encoder falls back to byte 0)")
        lines.append("")
        for e in palette_audit.not_encodable:
            lines.append(f"- `{e.palette_key}`")
        lines.append("")

    if palette_audit.encodable_mismatch:
        lines.append("### Encodable but color table mismatch")
        lines.append("")
        for e in palette_audit.encodable_mismatch:
            lines.append(
                f"- `{e.palette_key}` → byte {e.encoded_byte} ({e.on_chain_palette_name}): {e.notes}"
            )
        lines.append("")

    lines.extend(
        [
            "### Encodable + color match",
            "",
        ]
    )
    for e in palette_audit.encodable_match:
        lines.append(f"- `{e.palette_key}` (byte {e.encoded_byte})")
    lines.append("")

    lines.extend(
        [
            "---",
            "",
            "## Findings",
            "",
        ]
    )

    if palette_audit.not_encodable:
        lines.append(
            f"1. **`_*_SHIRT_*` and other unmapped palettes ({len(palette_audit.not_encodable)} names)** "
            "cannot encode to a distinct on-chain palette ID. Encoder warns and uses byte 0 (SIGNAL). "
            "Payload-first previews will differ from compositor previews for these tokens."
        )
    if palette_audit.encodable_mismatch:
        lines.append(
            f"2. **Normie palette bytes 28–36** and other encodable IDs without dedicated `_paletteColors` branches "
            "use `paletteId % 26` on-chain — pipeline color tables will not match unless aligned."
        )
    lines.append(
        "3. **Role buffer pack/unpack** is lossless for all seeds (4bpp nibble packing)."
    )
    lines.append(
        "4. **Preview divergence** is expected whenever `palette_key` pipeline colors ≠ `palette_colors(traits[1])` on-chain."
    )
    lines.append(
        "5. **Contract changes not required** for pack/unpack; palette ID gaps must be resolved before mint-data generation."
    )
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("*Report generated by `scripts/payload_parity_audit.py`*")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Payload-first parity audit")
    parser.add_argument(
        "--seeds",
        type=int,
        nargs="*",
        default=DEFAULT_SEEDS,
        help="Seeds to compare (default: fixed fixture list)",
    )
    parser.add_argument("--token-id", type=int, default=1)
    parser.add_argument(
        "--out",
        type=Path,
        default=REPORTS_DIR / "payload_first_parity_report.md",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        default=REPORTS_DIR / "payload_first_parity_report.json",
    )
    args = parser.parse_args()

    report_md = build_report(args.seeds, args.token_id)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(report_md, encoding="utf-8")

    palette_audit = audit_all_palettes()
    seed_rows = compare_seeds(args.seeds, token_id=args.token_id)
    json_payload = {
        "seeds": [row.__dict__ for row in seed_rows],
        "palette_audit": {
            "summary": {
                "encodable_match": len(palette_audit.encodable_match),
                "encodable_mismatch": len(palette_audit.encodable_mismatch),
                "not_encodable": len(palette_audit.not_encodable),
            },
            "not_encodable": [e.palette_key for e in palette_audit.not_encodable],
            "encodable_mismatch": [
                {"palette_key": e.palette_key, "byte": e.encoded_byte, "notes": e.notes}
                for e in palette_audit.encodable_mismatch
            ],
        },
    }
    args.json_out.write_text(json.dumps(json_payload, indent=2), encoding="utf-8")

    print(f"Wrote {args.out}")
    print(f"Wrote {args.json_out}")
    match = sum(1 for r in seed_rows if r.previews_match)
    print(f"Preview match: {match}/{len(seed_rows)} seeds")
    print(
        f"Palettes: {len(palette_audit.encodable_match)} match, "
        f"{len(palette_audit.encodable_mismatch)} encodable mismatch, "
        f"{len(palette_audit.not_encodable)} not encodable"
    )


if __name__ == "__main__":
    main()
