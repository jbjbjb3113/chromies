#!/usr/bin/env python3
"""Step 5: post-setRenderer live tokenURI readback vs label-parity-100 baselines."""

from __future__ import annotations

import base64
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
COMMEMORATIVE = "0x3C8C9615889762bDcF9647a3C86C74aFA498a158"
NEW_RENDERER = "0x8b6380ca9247D9cA6C8E9a078c2c31E12034e364"
RPC = "robinhood_mainnet"
COMMEMORATIVE_JSON = REPO / "reports" / "robinhood" / "commemorative-100.json"
URI_DIR = REPO / "reports" / "robinhood" / "label-parity-100"
BASELINE_PNG = REPO / "reports" / "robinhood" / "investigate-token1" / "chromie-001-live.png"
OUT = REPO / "reports" / "robinhood" / "deploy-label-fix" / "post-deploy-readback.md"

SHELL_PNG_RE = re.compile(r"data:image/png;base64,([A-Za-z0-9+/=]+)")
EMITTED = (
    "Character",
    "Palette",
    "Hood",
    "Shirt",
    "Body",
    "Bodytattoo",
    "Necklace",
    "Tattoo",
    "Beard",
    "Mustache",
    "Eyes",
    "Earrings",
    "Glasses",
    "Hair",
)


def _cast(*args: str) -> str:
    exe = REPO / ".foundry-bin" / "cast.exe"
    cmd = [str(exe) if exe.is_file() else "cast", *args]
    return subprocess.check_output(cmd, text=True, cwd=REPO).strip()


def parse_uri(uri: str) -> tuple[dict[str, str], bytes]:
    uri = uri.strip().strip('"')
    meta = json.loads(base64.b64decode(uri.split(",", 1)[1]))
    attrs = {
        str(e["trait_type"]): str(e["value"])
        for e in meta.get("attributes", [])
        if e.get("trait_type") in EMITTED
    }
    image = meta.get("image", "")
    shell = base64.b64decode(image.split(",", 1)[1]).decode("utf-8")
    m = SHELL_PNG_RE.search(shell)
    if not m:
        raise ValueError("no embedded PNG")
    return attrs, base64.b64decode(m.group(1))


def trait_byte(traits_hex: str, index: int) -> int:
    raw = bytes.fromhex(traits_hex.removeprefix("0x").lower())
    return raw[index]


def select_tokens(records: list[dict], *, total_supply: int) -> list[int]:
    """Cover pre-fix None/Human/Signal fallback buckets among minted tokens."""
    minted = [r for r in records if int(r["commemorativeTokenId"]) <= total_supply]
    buckets: dict[str, int | None] = {
        "hair_none_fallback": None,
        "eyes_signal_fallback": None,
        "character_human_fallback": None,
        "token_1": 1 if total_supply >= 1 else None,
    }
    extras: list[int] = []
    for rec in minted:
        tid = int(rec["commemorativeTokenId"])
        th = rec["traitsHex"].lower()
        hair = trait_byte(th, 14)
        eyes = trait_byte(th, 11)
        char_b = trait_byte(th, 0)
        if buckets["hair_none_fallback"] is None and hair > 7:
            buckets["hair_none_fallback"] = tid
        if buckets["eyes_signal_fallback"] is None and eyes > 1:
            buckets["eyes_signal_fallback"] = tid
        if buckets["character_human_fallback"] is None and char_b in (5, 6, 7):
            buckets["character_human_fallback"] = tid
        if tid != 1 and len(extras) < 8:
            if hair > 7 or eyes > 1 or char_b in (5, 6, 7):
                extras.append(tid)

    chosen: list[int] = []
    for key in ("token_1", "hair_none_fallback", "eyes_signal_fallback", "character_human_fallback"):
        val = buckets[key]
        if val is not None and val not in chosen:
            chosen.append(val)
    for tid in extras:
        if tid not in chosen:
            chosen.append(tid)
    for rec in minted:
        tid = int(rec["commemorativeTokenId"])
        if tid not in chosen:
            chosen.append(tid)
        if len(chosen) >= min(15, total_supply):
            break
    return sorted(chosen)


def fetch_live_uri(token_id: int) -> str:
    return _cast(
        "call",
        COMMEMORATIVE,
        "tokenURI(uint256)(string)",
        str(token_id),
        "--rpc-url",
        RPC,
    )


def main() -> int:
    records = json.loads(COMMEMORATIVE_JSON.read_text(encoding="utf-8"))["tokens"]
    total_supply = int(_cast("call", COMMEMORATIVE, "totalSupply()(uint256)", "--rpc-url", RPC))
    by_id = {int(r["commemorativeTokenId"]): r for r in records}
    token_ids = select_tokens(records, total_supply=total_supply)
    renderer = _cast("call", COMMEMORATIVE, "renderer()(address)", "--rpc-url", RPC)

    # bucket exemplars for report
    hair_ex = next((t for t in token_ids if trait_byte(by_id[t]["traitsHex"], 14) > 7), None)
    eyes_ex = next((t for t in token_ids if trait_byte(by_id[t]["traitsHex"], 11) > 1), None)
    char_ex = next((t for t in token_ids if trait_byte(by_id[t]["traitsHex"], 0) in (5, 6, 7)), None)

    divergences: list[dict] = []
    rows: list[str] = []
    png_checks: list[dict] = []

    for tid in token_ids:
        local_uri = (URI_DIR / f"uri-{tid}.txt").read_text(encoding="utf-8")
        live_uri = fetch_live_uri(tid)
        local_attrs, local_png = parse_uri(local_uri)
        live_attrs, live_png = parse_uri(live_uri)
        slot_diffs = []
        for slot in EMITTED:
            la, lv = local_attrs.get(slot), live_attrs.get(slot)
            if la != lv:
                slot_diffs.append({"slot": slot, "expected": la, "live": lv})
                divergences.append({"tokenId": tid, **slot_diffs[-1]})
        png_match = hashlib.sha256(local_png).digest() == hashlib.sha256(live_png).digest()
        png_checks.append({"tokenId": tid, "png_match_local_baseline": png_match})
        rows.append(
            f"| {tid} | {len(slot_diffs)} | {'PASS' if png_match else 'FAIL'} | "
            f"{', '.join(d['slot'] for d in slot_diffs) or '—'} |"
        )

    baseline_hash = hashlib.sha256(BASELINE_PNG.read_bytes()).hexdigest()
    live1_png = parse_uri(fetch_live_uri(1))[1]
    live1_hash = hashlib.sha256(live1_png).hexdigest()
    token1_png_pass = baseline_hash == live1_hash

    overall_pass = len(divergences) == 0 and token1_png_pass

    lines = [
        "# Post-deploy readback (Step 5)",
        "",
        "## Step 4 — setRenderer()",
        "",
        "| Field | Value |",
        "|-------|-------|",
        f"| Tx hash | `0x532ac3f5d2fffc226e37d9e641eb1ecd3033e333a49056b9026c122cc33e8cfb` |",
        f"| Block number | `10436702` (`0x9f395e`) |",
        f"| `renderer()` read-back | `{renderer}` |",
        f"| Expected renderer | `{NEW_RENDERER}` |",
        f"| **Step 4 result** | **{'PASS' if renderer.lower() == NEW_RENDERER.lower() else 'FAIL'}** |",
        "",
        f"**Note:** Only `{total_supply}` commemorative tokens minted on mainnet at readback time; checks limited to token IDs `1..{total_supply}`.",
        "",
        "## Token sample",
        "",
        f"Checked **{len(token_ids)}** tokens: `{token_ids}`",
        "",
        "Selection covers pre-fix fallback buckets:",
        f"- Hair → `None` fallback (hair byte > 7): token `{hair_ex}`",
        f"- Eyes → `Signal` fallback (eyes byte > 1): token `{eyes_ex}`",
        f"- Character → `Human` mislabel (bytes 5/6/7): token `{char_ex}`",
        f"- Known-good anchor: token `#1`",
        "",
        "## Attribute parity vs `label-parity-100/uri-{n}.txt`",
        "",
        "| Token | Label diffs | PNG vs local | Diff slots |",
        "|------:|------------:|:-------------|:-----------|",
        *rows,
        "",
        "## Token #1 PNG SHA-256 (pre-deploy mainnet baseline)",
        "",
        f"| Field | Value |",
        f"|-------|-------|",
        f"| Baseline file | `{BASELINE_PNG.relative_to(REPO).as_posix()}` |",
        f"| Baseline SHA-256 | `{baseline_hash}` |",
        f"| Live post-setRenderer SHA-256 | `{live1_hash}` |",
        f"| **Result** | **{'PASS' if token1_png_pass else 'FAIL'}** |",
        "",
        "## Summary",
        "",
        f"**OVERALL: {'PASS' if overall_pass else 'FAIL'}**",
        "",
        f"- Label divergences: **{len(divergences)}**",
        f"- Token #1 PNG byte-identical to pre-deploy baseline: **{'yes' if token1_png_pass else 'no'}**",
        "",
    ]
    if divergences:
        lines.extend(["### Divergence detail", "", "```json", json.dumps(divergences, indent=2), "```", ""])

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"OVERALL: {'PASS' if overall_pass else 'FAIL'}")
    return 0 if overall_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
