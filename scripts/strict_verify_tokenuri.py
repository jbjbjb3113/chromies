#!/usr/bin/env python3
"""Strict-validate a live tokenURI(id) call against the actual PNG spec.

Replaces "call tokenURI, eyeball it, hash it" with a real decode: JSON parse
-> SVG shell parse -> PNG chunk walk -> CRC32 verification -> PIL verify() +
load(). Exits non-zero (and prints a clear reason) on ANY spec violation,
including the IHDR height=0 class of bug this script was written to catch
retroactively.

Usage:
    py scripts/strict_verify_tokenuri.py --rpc robinhood_mainnet \
        --contract 0x10953E4975C35529a5034D54eBC9266cec0CE69D --token-id 1

    py scripts/strict_verify_tokenuri.py --rpc sepolia \
        --contract 0x8162114c056DfC49045c04C66f1E03b761d81eD5 --token-id 1
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ENGINE = REPO / "chromies-engine"
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from engine.png_strict import PngValidationError, validate_png_strict  # noqa: E402

SHELL_PNG_RE = re.compile(r'href="data:image/png;base64,([A-Za-z0-9+/=]+)"')


def cast(*args: str) -> str:
    exe = REPO / ".foundry-bin" / "cast.exe"
    cmd = [str(exe) if exe.is_file() else "cast", *args]
    return subprocess.check_output(cmd, text=True, cwd=REPO).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rpc", required=True, help="foundry.toml rpc_endpoints alias or URL")
    parser.add_argument("--contract", required=True)
    parser.add_argument("--token-id", required=True, type=int)
    parser.add_argument("--width", type=int, default=64)
    parser.add_argument("--height", type=int, default=64)
    args = parser.parse_args()

    uri = cast(
        "call",
        args.contract,
        "tokenURI(uint256)(string)",
        str(args.token_id),
        "--rpc-url",
        args.rpc,
    ).strip().strip('"')

    if not uri.startswith("data:application/json;base64,"):
        print(f"FAIL: unexpected tokenURI scheme: {uri[:60]}", file=sys.stderr)
        return 1
    json_bytes = base64.b64decode(uri.split(",", 1)[1])
    full_hash = "0x" + hashlib.sha3_256(json_bytes).hexdigest()  # informational only, not the sole check
    metadata = json.loads(json_bytes)

    image = metadata.get("image", "")
    if not image.startswith("data:image/svg+xml;base64,"):
        print(f"FAIL: unexpected image scheme: {image[:60]}", file=sys.stderr)
        return 1
    shell = base64.b64decode(image.split(",", 1)[1]).decode("utf-8")
    m = SHELL_PNG_RE.search(shell)
    if not m:
        print("FAIL: no embedded PNG data URI found in SVG shell", file=sys.stderr)
        return 1
    png_bytes = base64.b64decode(m.group(1))

    print(f"contract={args.contract} token_id={args.token_id} rpc={args.rpc}")
    print(f"name={metadata.get('name')!r}")
    print(f"description={metadata.get('description')!r}")
    print(f"tokenURI sha3-256 (informational, NOT sole check): {full_hash}")

    try:
        info = validate_png_strict(png_bytes, expected_width=args.width, expected_height=args.height)
    except PngValidationError as exc:
        print(f"FAIL: STRICT PNG VALIDATION FAILED: {exc}", file=sys.stderr)
        return 1

    print(
        f"PASS: strict PNG validation OK — width={info['width']} height={info['height']} "
        f"bit_depth={info['bit_depth']} color_type={info['color_type']} pil_mode={info['pil_mode']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
