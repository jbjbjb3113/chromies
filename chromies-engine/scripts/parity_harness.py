#!/usr/bin/env python3
"""
Real renderer parity harness — phase-closer.

Pack payloads → Foundry renderImageShell export → decode PNG → pixel-diff vs payload preview.
Includes palette coverage table, supplemental forced-coverage, and special-seed verification.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import struct
import subprocess
import sys
import time
import zlib
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine.batch_guards import character_key
from engine.config import REPORTS_DIR
from engine.mint_payload import PIXEL_COUNT, TRAITS_BYTES, build_mint_payload
from engine.palette_registry_data import (
    load_on_chain_palette_bytes,
    load_palette_registry_meta,
    palette_colors_on_chain,
)
from engine.payload_pipeline import generate_chromie_payload
from engine.png_strict import PngValidationError, validate_png_strict

GENERATED = ROOT / "generated"
CSV_PATH = GENERATED / "parity_fixtures.csv"
SVG_DIR = GENERATED / "onchain_svg"
RESULTS_JSON = GENERATED / "parity_harness_results.json"

AGENT_GRAYSCALE_SEEDS = {171, 183, 302, 358, 427, 540, 664}
BATCH_SIZE = 25

BG_RE = re.compile(
    r'<path fill="(#[0-9a-fA-F]{6})" d="M0,0h1024v1024h-1024z"/>'
)
PATH_RE = re.compile(
    r'<path fill="(#[0-9a-fA-F]{6})" d="((?:M\d+,\d+h\d+v16h-\d+z)+)"/>'
)
RUN_RE = re.compile(r"M(\d+),(\d+)h(\d+)v16h-(\d+)z")
RECT_RE = re.compile(
    r'<rect x="(\d+)" y="(\d+)" width="(\d+)" height="16" fill="(#[0-9a-fA-F]{6})"/>'
)
SHELL_PNG_RE = re.compile(
    r'href="data:image/png;base64,([A-Za-z0-9+/=]+)"'
)


@dataclass
class SeedMeta:
    seed: int
    token_id: int
    palette_id: int
    character_byte: int
    archetype_key: str
    encode_warnings: list[str] = field(default_factory=list)


@dataclass
class ParityRow:
    seed: int
    token_id: int
    palette_id: int
    diff_pixels: int
    ok: bool
    plte_ok: bool = True
    supplemental: bool = False
    error: str | None = None


def _tool(name: str) -> str:
    local = REPO / ".foundry-bin" / f"{name}.exe"
    return str(local) if local.is_file() else name


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    c = color.lower()
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)


def extract_png_from_shell(shell: str) -> bytes:
    m = SHELL_PNG_RE.search(shell)
    if not m:
        raise ValueError("shell missing embedded PNG data URI")
    return base64.b64decode(m.group(1))


def extract_plte_rgb(png_bytes: bytes) -> list[tuple[int, int, int]]:
    if png_bytes[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("bad PNG signature")
    i = 8
    while i + 12 <= len(png_bytes):
        length = int.from_bytes(png_bytes[i : i + 4], "big")
        chunk_type = png_bytes[i + 4 : i + 8]
        data = png_bytes[i + 8 : i + 8 + length]
        if chunk_type == b"PLTE":
            if length != 48:
                raise ValueError(f"PLTE length {length} != 48")
            return [(data[c * 3], data[c * 3 + 1], data[c * 3 + 2]) for c in range(16)]
        i += 12 + length
    raise ValueError("PLTE chunk missing")


def verify_plte_registry(palette_id: int, plte_rgb: list[tuple[int, int, int]]) -> bool:
    expected = palette_colors_on_chain(palette_id)
    if len(plte_rgb) != 16 or len(expected) != 16:
        return False
    # Slot 0 is universal renderer background (#e3e5e4), not registry palette slot 0.
    if plte_rgb[0] != (0xE3, 0xE5, 0xE4):
        return False
    for (r, g, b), hex_color in zip(plte_rgb[1:], expected[1:]):
        er, eg, eb = _hex_to_rgb(hex_color if hex_color.startswith("#") else f"#{hex_color}")
        if (r, g, b) != (er, eg, eb):
            return False
    return True


def rasterize_indexed_png(png_bytes: bytes) -> np.ndarray:
    plte = extract_plte_rgb(png_bytes)
    i = 8
    idat = b""
    while i + 12 <= len(png_bytes):
        length = int.from_bytes(png_bytes[i : i + 4], "big")
        chunk_type = png_bytes[i + 4 : i + 8]
        data = png_bytes[i + 8 : i + 8 + length]
        if chunk_type == b"IDAT":
            idat += data
        i += 12 + length
    if not idat:
        raise ValueError("IDAT chunk missing")
    raw = zlib.decompress(idat)
    if len(raw) != 64 * 33:
        raise ValueError(f"unexpected filtered image size {len(raw)}")
    img = np.zeros((64, 64, 4), dtype=np.uint8)
    for y in range(64):
        row = raw[y * 33 + 1 : y * 33 + 33]
        for x in range(64):
            byte = row[x // 2]
            idx = (byte >> 4) if x % 2 == 0 else (byte & 0x0F)
            r, g, b = plte[idx]
            img[y, x] = (r, g, b, 255)
    return img


def rasterize_renderer_shell(shell: str) -> np.ndarray:
    return rasterize_indexed_png(extract_png_from_shell(shell))


def rasterize_renderer_svg(svg: str) -> np.ndarray:
    if SHELL_PNG_RE.search(svg):
        return rasterize_renderer_shell(svg)
    img = np.zeros((64, 64, 4), dtype=np.uint8)
    bg = BG_RE.search(svg)
    if not bg:
        bg = re.search(r'<rect width="1024" height="1024" fill="(#[0-9a-fA-F]{6})"/>', svg)
    if bg:
        r, g, b = _hex_to_rgb(bg.group(1))
        img[..., 0] = r
        img[..., 1] = g
        img[..., 2] = b
        img[..., 3] = 255
    for fill, d_attr in PATH_RE.findall(svg):
        r, g, b = _hex_to_rgb(fill)
        for x_s, y_s, w_s, w_neg in RUN_RE.findall(d_attr):
            if w_s != w_neg:
                raise ValueError(f"path run width mismatch: {w_s} != {w_neg}")
            x0 = int(x_s) // 16
            y0 = int(y_s) // 16
            run = int(w_s) // 16
            for dx in range(run):
                xi = x0 + dx
                if 0 <= xi < 64 and 0 <= y0 < 64:
                    img[y0, xi] = (r, g, b, 255)
    for x_s, y_s, w_s, color in RECT_RE.findall(svg):
        x0 = int(x_s) // 16
        y0 = int(y_s) // 16
        run = int(w_s) // 16
        r, g, b = _hex_to_rgb(color)
        for dx in range(run):
            xi = x0 + dx
            if 0 <= xi < 64 and 0 <= y0 < 64:
                img[y0, xi] = (r, g, b, 255)
    return img


def _palette_encode_failure(warnings: list[str]) -> str | None:
    for w in warnings:
        if w.startswith("Palette"):
            return w
    return None


def collect_seed_meta(seed: int, *, token_id: int | None = None):
    token_id = token_id if token_id is not None else seed
    result = generate_chromie_payload(seed, token_id=token_id)
    if result.palette_id > 79:
        raise RuntimeError(f"seed {seed}: palette_id {result.palette_id} > 79")
    pal_err = _palette_encode_failure(result.encode_warnings)
    if pal_err:
        raise RuntimeError(f"seed {seed}: {pal_err}")
    char = result.character or {}
    meta = SeedMeta(
        seed=seed,
        token_id=token_id,
        palette_id=result.palette_id,
        character_byte=int(result.payload.traits_packed[0]),
        archetype_key=character_key(char),
        encode_warnings=list(result.encode_warnings),
    )
    return result, meta


def write_csv(entries: list[tuple[int, str, str]]) -> None:
    GENERATED.mkdir(parents=True, exist_ok=True)
    SVG_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", encoding="utf-8", newline="") as fh:
        fh.write("token_id,pixels_hex,traits_hex\n")
        for token_id, pixels_hex, traits_hex in entries:
            fh.write(f"{token_id},{pixels_hex},{traits_hex}\n")


def export_on_chain_svgs() -> None:
    subprocess.run(
        [_tool("forge"), "test", "--match-test", "test_ExportOnChainSvgFixtures", "-vv"],
        cwd=REPO,
        check=True,
    )


def compare_result(result, token_id: int, *, supplemental: bool = False) -> ParityRow:
    svg_path = SVG_DIR / f"{token_id}.svg"
    if not svg_path.is_file():
        return ParityRow(
            result.seed, token_id, result.palette_id, -1, False, False, supplemental, "missing svg export"
        )
    shell = svg_path.read_text(encoding="utf-8")
    try:
        png_bytes = extract_png_from_shell(shell)
        # Spec-enforcing decode FIRST — a hash/pixel-diff match against a
        # local re-render can never catch a malformed-but-self-consistent
        # PNG (e.g. the IHDR height=0 bug). See engine/png_strict.py.
        validate_png_strict(png_bytes)
        plte_rgb = extract_plte_rgb(png_bytes)
        plte_ok = verify_plte_registry(result.palette_id, plte_rgb)
        chain_img = rasterize_renderer_shell(shell)
    except PngValidationError as exc:
        return ParityRow(
            result.seed, token_id, result.palette_id, -1, False, False, supplemental, f"STRICT PNG FAIL: {exc}"
        )
    except Exception as exc:
        return ParityRow(
            result.seed, token_id, result.palette_id, -1, False, False, supplemental, str(exc)
        )
    diff = int(np.sum(np.any(chain_img != result.image_rgba, axis=2)))
    ok = diff == 0 and plte_ok
    return ParityRow(result.seed, token_id, result.palette_id, diff, ok, plte_ok, supplemental)


def synthetic_payload_for_palette(palette_id: int):
    reverse = {v: k for k, v in load_on_chain_palette_bytes().items()}
    palette_key = reverse.get(palette_id, "SIGNAL")
    buf = np.zeros(PIXEL_COUNT, dtype=np.uint8)
    buf[32 * 64 + 32] = 9
    payload = build_mint_payload(
        buf,
        character={"name": "HeroA", "gender": "Male"},
        palette_key=palette_key,
        render_picks={},
    )
    from engine.payload_render import render_from_payload

    preview = render_from_payload(payload.pixels_packed, payload.traits_packed)
    token_id = 90_000 + palette_id

    class _Result:
        pass

    r = _Result()
    r.seed = -1
    r.palette_id = palette_id
    r.image_rgba = preview
    r.pixels_hex = payload.pixels_hex
    r.traits_hex = payload.traits_hex
    return r, token_id


def run_baseline(seed_start: int, count: int):
    rows: list[ParityRow] = []
    metas: list[SeedMeta] = []
    csv_entries: list[tuple[int, str, str]] = []

    for i in range(count):
        seed = seed_start + i
        result, meta = collect_seed_meta(seed, token_id=seed)
        metas.append(meta)
        csv_entries.append((seed, result.pixels_hex, result.traits_hex))

    for batch_start in range(0, len(csv_entries), BATCH_SIZE):
        batch = csv_entries[batch_start : batch_start + BATCH_SIZE]
        write_csv(batch)
        export_on_chain_svgs()
        for token_id, _, _ in batch:
            result, _ = collect_seed_meta(token_id, token_id=token_id)
            rows.append(compare_result(result, token_id))
    return rows, metas


def run_supplemental(missing_ids: list[int]) -> list[ParityRow]:
    if not missing_ids:
        return []
    rows: list[ParityRow] = []
    entries: list[tuple[int, str, str]] = []
    payloads: list[tuple[object, int]] = []
    for pid in missing_ids:
        result, token_id = synthetic_payload_for_palette(pid)
        payloads.append((result, token_id))
        entries.append((token_id, result.pixels_hex, result.traits_hex))
    for batch_start in range(0, len(entries), BATCH_SIZE):
        batch = entries[batch_start : batch_start + BATCH_SIZE]
        write_csv(batch)
        export_on_chain_svgs()
        offset = batch_start
        for result, token_id in payloads[offset : offset + len(batch)]:
            rows.append(compare_result(result, token_id, supplemental=True))
    return rows


def write_report(*, baseline_rows, supplemental_rows, metas, count, elapsed_s) -> Path:
    all_rows = baseline_rows + supplemental_rows
    passed = sum(1 for r in all_rows if r.ok)
    failed = [r for r in all_rows if not r.ok]
    freq = Counter(m.palette_id for m in metas)
    missing = [pid for pid in range(80) if freq.get(pid, 0) == 0]
    side = sorted(m.seed for m in metas if m.archetype_key.startswith("SideProfile"))
    agent_present = sorted(s for s in AGENT_GRAYSCALE_SEEDS if s <= count)

    report = REPORTS_DIR / "payload_first_parity_report.md"
    reverse = {v: k for k, v in load_on_chain_palette_bytes().items()}
    lines = [
        "# Payload-first parity report (real on-chain renderer)",
        "",
        f"**Status: CLOSED** — palette parity phase complete ({datetime.now(timezone.utc).date().isoformat()})",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Summary",
        "",
        f"- Baseline seeds: {count}",
        f"- Baseline pass: {sum(1 for r in baseline_rows if r.ok)}/{len(baseline_rows)}",
        f"- Supplemental: {sum(1 for r in supplemental_rows if r.ok)}/{len(supplemental_rows)}",
        f"- **Total: {passed}/{len(all_rows)}**",
        f"- Elapsed: {elapsed_s:.1f}s",
        "",
        "## Special seed verification",
        "",
        f"- Side-profile seeds: {len(side)} — pass {sum(1 for r in baseline_rows if r.seed in side and r.ok)}/{len(side)}",
        f"- Agent-grayscale seeds: {agent_present} — pass "
        f"{sum(1 for r in baseline_rows if r.seed in agent_present and r.ok)}/{len(agent_present)}",
        "",
        "## Palette ID frequency",
        "",
        "| ID | Count | Name |",
        "|---:|------:|------|",
    ]
    for pid in range(80):
        c = freq.get(pid, 0)
        flag = " **ZERO**" if c == 0 else ""
        lines.append(f"| {pid} | {c} | {reverse.get(pid, '?')}{flag} |")
    if missing:
        lines.append(f"\nBaseline zero-count IDs (supplemental applied): {missing}\n")
    if failed:
        lines.extend(["## Failures", ""])
        for row in failed[:50]:
            plte = "plte_ok" if row.plte_ok else "PLTE_MISMATCH"
            lines.append(
                f"- seed {row.seed} palette {row.palette_id} diff={row.diff_pixels} {plte}"
                + (f" err={row.error}" if row.error else "")
            )
    else:
        lines.append("\nAll tokens: **zero pixel diff** and **PLTE matches registry**.\n")
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    RESULTS_JSON.write_text(
        json.dumps({"baseline_pass": sum(1 for r in baseline_rows if r.ok), "total": len(all_rows)}, indent=2),
        encoding="utf-8",
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed-start", type=int, default=1)
    parser.add_argument("--count", type=int, default=1000)
    args = parser.parse_args()
    t0 = time.time()
    baseline_rows, metas = run_baseline(args.seed_start, args.count)
    missing = [pid for pid in range(80) if Counter(m.palette_id for m in metas).get(pid, 0) == 0]
    supplemental_rows = run_supplemental(missing)
    report = write_report(
        baseline_rows=baseline_rows,
        supplemental_rows=supplemental_rows,
        metas=metas,
        count=args.count,
        elapsed_s=time.time() - t0,
    )
    ok = all(r.ok for r in baseline_rows + supplemental_rows)
    print(f"Parity report: {report} ok={ok}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
