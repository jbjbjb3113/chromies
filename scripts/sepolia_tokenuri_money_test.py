#!/usr/bin/env python3
"""Money test: eth_call tokenURI for inscribed Sepolia tokens 1–5 via Alchemy RPC."""

from __future__ import annotations

import base64
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import zlib

REPO = Path(__file__).resolve().parents[1]
ENGINE = REPO / "chromies-engine"
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from engine.payload_pipeline import generate_chromie_payload
from engine.png_strict import PngValidationError, validate_png_strict

DEFAULTS = {
    "CHROMA_ADDRESS": "0x8162114c056DfC49045c04C66f1E03b761d81eD5",
    "CHROMA_RENDERER_ADDRESS": "0x7680D210ed242330877b31D9749a92307484Aae1",
}

# Inscribed dry-run tokens (seed, token_id, category)
INSCRIBED = [
    (1, 1, "shirt_palette"),
    (6, 2, "side_profile"),
    (42, 3, "plain"),
    (100, 4, "plain"),
    (256, 5, "plain"),
]

SHELL_PNG_RE = re.compile(r'href="data:image/png;base64,([A-Za-z0-9+/=]+)"')

OLD_OOG = {
    1: "RPC OOG — gas required exceeds: 16777216",
    2: "RPC OOG — gas required exceeds: 16777216",
    3: "RPC OOG — gas required exceeds: 16777216",
    4: "RPC OOG — gas required exceeds: 16777216",
    5: "RPC OOG — gas exhausted during memory expansion",
}


def load_env() -> dict[str, str]:
    out: dict[str, str] = {}
    env_path = REPO / ".env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return {**DEFAULTS, **out}


def cast(*args: str) -> str:
    exe = REPO / ".foundry-bin" / "cast.exe"
    cmd = [str(exe) if exe.is_file() else "cast", *args]
    return subprocess.check_output(cmd, text=True, cwd=REPO).strip()


def rasterize_shell(shell: str) -> np.ndarray:
    m = SHELL_PNG_RE.search(shell)
    if not m:
        raise ValueError("missing PNG in shell")
    png = base64.b64decode(m.group(1))
    i = 8
    plte: list[tuple[int, int, int]] = []
    idat = b""
    while i + 12 <= len(png):
        ln = int.from_bytes(png[i : i + 4], "big")
        typ = png[i + 4 : i + 8]
        data = png[i + 8 : i + 8 + ln]
        if typ == b"PLTE":
            plte = [(data[c * 3], data[c * 3 + 1], data[c * 3 + 2]) for c in range(16)]
        elif typ == b"IDAT":
            idat += data
        i += 12 + ln
    raw = zlib.decompress(idat)
    img = np.zeros((64, 64, 4), dtype=np.uint8)
    for y in range(64):
        row = raw[y * 33 + 1 : y * 33 + 33]
        for x in range(64):
            byte = row[x // 2]
            idx = (byte >> 4) if x % 2 == 0 else (byte & 0x0F)
            r, g, b = plte[idx]
            img[y, x] = (r, g, b, 255)
    return img


def decode_token_uri(uri: str) -> dict:
    if not uri.startswith("data:application/json;base64,"):
        raise ValueError("unexpected tokenURI scheme")
    payload = json.loads(base64.b64decode(uri.split(",", 1)[1]))
    image = payload.get("image", "")
    if not image.startswith("data:image/svg+xml;base64,"):
        raise ValueError("unexpected image scheme")
    shell = base64.b64decode(image.split(",", 1)[1]).decode("utf-8")
    return {"json": payload, "shell": shell}


def main() -> int:
    cfg = load_env()
    rpc = cfg.get("SEPOLIA_RPC_URL", "")
    chroma = cfg["CHROMA_ADDRESS"]
    if not rpc:
        print("Missing SEPOLIA_RPC_URL", file=sys.stderr)
        return 1

    rows: list[dict] = []
    failures = 0

    print("Sepolia tokenURI money test (inscribed tokens 1–5)")
    print(f"  chroma={chroma}")
    print(f"  rpc={rpc[:48]}...")
    print()

    for seed, token_id, category in INSCRIBED:
        row: dict = {
            "seed": seed,
            "token_id": token_id,
            "category": category,
            "old_note": OLD_OOG[token_id],
        }
        try:
            gas_hex = cast(
                "estimate",
                chroma,
                "tokenURI(uint256)(string)",
                str(token_id),
                "--rpc-url",
                rpc,
            )
            row["gas_estimate"] = int(gas_hex, 16) if gas_hex.startswith("0x") else int(gas_hex)
            uri = cast(
                "call",
                chroma,
                "tokenURI(uint256)(string)",
                str(token_id),
                "--rpc-url",
                rpc,
                "--gas-limit",
                "10000000",
            )
            uri = uri.strip().strip('"')
            row["token_uri_len"] = len(uri)
            decoded = decode_token_uri(uri)
            m = SHELL_PNG_RE.search(decoded["shell"])
            if not m:
                raise ValueError("missing PNG in shell")
            png_bytes = base64.b64decode(m.group(1))
            # Spec-enforcing decode — a pixel-diff-vs-local-preview match can
            # NEVER catch a malformed-but-self-consistent PNG header (this is
            # exactly how the IHDR height=0 bug shipped undetected). See
            # chromies-engine/engine/png_strict.py.
            strict_info = validate_png_strict(png_bytes)
            row["strict_png"] = strict_info
            chain_img = rasterize_shell(decoded["shell"])
            preview = generate_chromie_payload(seed, token_id=token_id).image_rgba
            diff = int(np.sum(np.any(chain_img != preview, axis=2)))
            row["diff_pixels"] = diff
            row["ok"] = diff == 0
            print(
                f"  token {token_id} (seed {seed}): gas={row['gas_estimate']:,} diff={diff} "
                f"strict_png=OK(w={strict_info['width']},h={strict_info['height']}) "
                f"{'PASS' if row['ok'] else 'FAIL'}"
            )
        except PngValidationError as exc:
            row["ok"] = False
            row["error"] = f"STRICT PNG FAIL: {exc}"
            print(f"  token {token_id}: FAIL — {row['error']}")
        except subprocess.CalledProcessError as exc:
            row["ok"] = False
            row["error"] = exc.stderr or str(exc)
            print(f"  token {token_id}: FAIL — {row['error']}")
        if not row.get("ok", False):
            failures += 1
        rows.append(row)

    out = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "chroma": chroma,
        "renderer_config": cfg.get("CHROMA_RENDERER_ADDRESS"),
        "rows": rows,
        "pass": failures == 0,
    }
    out_path = ENGINE / "generated" / "sepolia_tokenuri_money_test.json"
    out_path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote {out_path}")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
