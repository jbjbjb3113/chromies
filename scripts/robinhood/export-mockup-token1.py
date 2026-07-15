#!/usr/bin/env python3
"""Export live ChromaRendererRobinhood tokenURI(1) PNG for mockup assets."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import subprocess
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
RENDERER = "0x8b6380ca9247D9cA6C8E9a078c2c31E12034e364"
RPC = "robinhood_mainnet"
OUT_DIR = REPO / "reports" / "robinhood" / "mockup"
OUT_NATIVE = OUT_DIR / "chromie-001-current.png"
OUT_4X = OUT_DIR / "chromie-001-current-4x.png"
SHELL_PNG_RE = re.compile(r"data:image/png;base64,([A-Za-z0-9+/=]+)")


def _cast(*args: str) -> str:
    exe = REPO / ".foundry-bin" / "cast.exe"
    cmd = [str(exe) if exe.is_file() else "cast", *args]
    return subprocess.check_output(cmd, text=True, cwd=REPO).strip()


def parse_uri(uri: str) -> tuple[dict, bytes]:
    uri = uri.strip().strip('"')
    meta = json.loads(base64.b64decode(uri.split(",", 1)[1]))
    image = meta.get("image", "")
    shell = base64.b64decode(image.split(",", 1)[1]).decode("utf-8")
    m = SHELL_PNG_RE.search(shell)
    if not m:
        raise ValueError("no embedded PNG in SVG shell")
    return meta, base64.b64decode(m.group(1))


def main() -> int:
    uri = _cast("call", RENDERER, "tokenURI(uint256)(string)", "1", "--rpc-url", RPC)
    meta, png_bytes = parse_uri(uri)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_NATIVE.write_bytes(png_bytes)

    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    if img.size != (64, 64):
        raise SystemExit(f"expected 64x64 PNG, got {img.size}")
    img.resize((256, 256), Image.NEAREST).save(OUT_4X)

    print(f"renderer: {RENDERER}")
    print("chain: Robinhood mainnet (4663)")
    print(f"name: {meta.get('name')}")
    print(
        f"native: {OUT_NATIVE.relative_to(REPO).as_posix()} "
        f"({img.size[0]}x{img.size[1]}, sha256={hashlib.sha256(png_bytes).hexdigest()})"
    )
    print(
        f"4x:     {OUT_4X.relative_to(REPO).as_posix()} "
        f"(256x256, sha256={hashlib.sha256(OUT_4X.read_bytes()).hexdigest()})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
