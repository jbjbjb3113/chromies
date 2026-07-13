#!/usr/bin/env python3
"""
Task 4 — Sepolia mint pipeline dry run (3–5 baseline seeds, DRY RUN merkle).

Swaps reveal root → owner mint → reveal → inscribe → compares tokenURI SVG vs preview
→ restores production reveal root and verifies via read call.
"""

from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[1]
ENGINE = REPO / "chromies-engine"
DEPLOY_LOG = ENGINE / "reports" / "SEPOLIA_DEPLOY_LOG.md"
MANIFEST = ENGINE / "generated" / "sepolia_mint_dry_run.json"
PRODUCTION_REVEAL_ROOT = "0x3b2d5fa07025cadfea3aea5cd5c1fe160a33ca586f14e2e7de6881b87de1c74d"

if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from engine.batch_guards import character_key
from engine.payload_pipeline import generate_chromie_payload

DEFAULTS = {
    "CHROMA_ADDRESS": "0x8162114c056DfC49045c04C66f1E03b761d81eD5",
    "CHROMA_RENDERER_ADDRESS": "0x7680D210ed242330877b31D9749a92307484Aae1",
}

TOKEN_ID_BASE = 1  # assigned from live totalSupply() at run time
RPC_DELAY_S = 0.3

RECT_RE = re.compile(
    r'<rect x="(\d+)" y="(\d+)" width="(\d+)" height="16" fill="(#[0-9a-fA-F]{6})"/>'
)
BG_RE = re.compile(r'<rect width="1024" height="1024" fill="(#[0-9a-fA-F]{6})"/>')


@dataclass
class DryRunToken:
    seed: int
    token_id: int
    category: str
    pixels_hex: str
    traits_hex: str
    preview: np.ndarray


def load_env() -> dict[str, str]:
    out: dict[str, str] = {}
    env_path = REPO / ".env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return {**out, **DEFAULTS}


def cast(*args: str) -> str:
    exe = REPO / ".foundry-bin" / "cast.exe"
    cmd = [str(exe) if exe.is_file() else "cast", *args]
    return subprocess.check_output(cmd, text=True, cwd=REPO).strip()


def rasterize_svg(svg: str) -> np.ndarray:
    img = np.zeros((64, 64, 4), dtype=np.uint8)
    bg = BG_RE.search(svg)
    if bg:
        r, g, b = (int(bg.group(1)[i : i + 2], 16) for i in (1, 3, 5))
        img[..., :3] = (r, g, b)
        img[..., 3] = 255
    for x_s, y_s, w_s, color in RECT_RE.findall(svg):
        x0, y0, run = int(x_s) // 16, int(y_s) // 16, int(w_s) // 16
        r, g, b = (int(color[i : i + 2], 16) for i in (1, 3, 5))
        for dx in range(run):
            xi = x0 + dx
            if 0 <= xi < 64 and 0 <= y0 < 64:
                img[y0, xi] = (r, g, b, 255)
    return img


def decode_token_uri_svg(uri: str) -> str:
    uri = uri.strip().strip('"')
    prefix = "data:application/json;base64,"
    if not uri.startswith(prefix):
        raise ValueError("unexpected tokenURI scheme")
    payload = json.loads(base64.b64decode(uri[len(prefix) :]))
    image = payload["image"]
    img_prefix = "data:image/svg+xml;base64,"
    if not image.startswith(img_prefix):
        raise ValueError("unexpected image field")
    return base64.b64decode(image[len(img_prefix) :]).decode("utf-8")


def pick_tokens(next_token_id: int) -> list[DryRunToken]:
    """Baseline seeds only — not production mint-data.json."""
    picks: list[tuple[int, str]] = []
    shirt = side = None
    for seed in range(1, 1001):
        result = generate_chromie_payload(seed, token_id=seed)
        key = character_key(result.character or {})
        if result.palette_id >= 38 and shirt is None:
            shirt = seed
        if key.startswith("SideProfile") and side is None:
            side = seed
        if shirt and side:
            break
    if shirt is None or side is None:
        raise RuntimeError("could not find shirt-palette and side-profile baseline seeds")

    picks.extend([(shirt, "shirt_palette"), (side, "side_profile"), (42, "plain"), (100, "plain"), (256, "plain")])

    tokens: list[DryRunToken] = []
    for i, (seed, cat) in enumerate(picks):
        token_id = next_token_id + i
        result = generate_chromie_payload(seed, token_id=token_id)
        tokens.append(
            DryRunToken(seed, token_id, cat, result.pixels_hex, result.traits_hex, result.image_rgba)
        )
    return tokens


def write_manifest(tokens: list[DryRunToken]) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    records = [
        {"tokenId": t.token_id, "pixelsHex": t.pixels_hex, "traitsHex": t.traits_hex, "seed": t.seed, "category": t.category}
        for t in tokens
    ]
    records_path = MANIFEST.parent / "sepolia_mint_dry_run_records.json"
    records_path.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    merkle_out = MANIFEST.parent / "sepolia_mint_dry_run_merkle.json"
    subprocess.run(
        [sys.executable, str(REPO / "scripts" / "build_reveal_merkle.py"), str(records_path), str(merkle_out)],
        check=True,
        cwd=REPO,
    )
    merkle = json.loads(merkle_out.read_text(encoding="utf-8"))
    manifest = {
        "dry_run": True,
        "label": "SEPOLIA_MINT_DRY_RUN",
        "productionRevealRoot": PRODUCTION_REVEAL_ROOT,
        "tokenCount": len(records),
        "merkle": merkle,
        "tokens": records,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def broadcast_inscribe(env: dict[str, str]) -> None:
    subprocess.run(
        [
            str(REPO / ".foundry-bin" / "forge.exe"),
            "script",
            "script/SepoliaMintDryRun.s.sol",
            "--rpc-url",
            "sepolia",
            "--broadcast",
            "--slow",
            "-vv",
        ],
        check=True,
        cwd=REPO,
        env={**os.environ, "CHROMA_ADDRESS": env["CHROMA_ADDRESS"]},
    )


def append_log(lines: list[str]) -> None:
    text = DEPLOY_LOG.read_text(encoding="utf-8")
    marker = "## Task 4 — Mint pipeline dry run (DRY RUN)"
    if marker in text:
        head = text.split(marker)[0].rstrip()
        tail = text.split("## Task 5", 1)[1] if "## Task 5" in text else ""
        body = marker + "\n\n" + "\n".join(lines) + ("\n\n## Task 5" + tail if tail else "")
        DEPLOY_LOG.write_text(head + "\n\n" + body, encoding="utf-8")
    else:
        DEPLOY_LOG.write_text(text.rstrip() + "\n\n" + marker + "\n\n" + "\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--assert-only", action="store_true", help="Skip broadcast; verify tokenURI parity only")
    args = parser.parse_args()

    env = load_env()
    rpc = env.get("SEPOLIA_RPC_URL", "sepolia")
    chroma = env["CHROMA_ADDRESS"]

    total_supply = int(cast("call", chroma, "totalSupply()(uint256)", "--rpc-url", rpc))

    if args.assert_only:
        if not MANIFEST.is_file():
            print("Missing manifest for --assert-only", file=sys.stderr)
            return 1
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        tokens = [
            DryRunToken(
                r["seed"],
                r["tokenId"],
                r["category"],
                r["pixelsHex"],
                r["traitsHex"],
                generate_chromie_payload(r["seed"], token_id=r["tokenId"]).image_rgba,
            )
            for r in manifest["tokens"]
        ]
    else:
        next_token_id = total_supply + 1
        tokens = pick_tokens(next_token_id)
        print(f"DRY RUN: {len(tokens)} baseline tokens (IDs {next_token_id}–{next_token_id + len(tokens) - 1})")
        write_manifest(tokens)
        broadcast_inscribe(env)

    root_on_chain = cast("call", chroma, "revealRoot()(bytes32)", "--rpc-url", rpc)
    if root_on_chain.lower() != PRODUCTION_REVEAL_ROOT.lower():
        print(f"STOP: reveal root not restored: on-chain={root_on_chain}", file=sys.stderr)
        return 1
    print(f"Production reveal root verified: {root_on_chain}")

    rows = [
        f"**DRY RUN mint pipeline** — {datetime.now(timezone.utc).isoformat()}",
        f"Chroma: `{chroma}`",
        f"Tokens: {tokens[0].token_id}–{tokens[-1].token_id}",
        f"Production reveal root restored: `{root_on_chain}` ✓",
        "",
        "| seed | token_id | category | diff_pixels | ok |",
        "|-----:|---------:|----------|------------:|:---:|",
    ]
    failures = 0
    for t in tokens:
        time.sleep(RPC_DELAY_S)
        uri = cast("call", chroma, "tokenURI(uint256)(string)", str(t.token_id), "--rpc-url", rpc)
        svg = decode_token_uri_svg(uri)
        diff = int(np.sum(np.any(rasterize_svg(svg) != t.preview, axis=2)))
        ok = diff == 0
        if not ok:
            failures += 1
        rows.append(f"| {t.seed} | {t.token_id} | {t.category} | {diff} | {'yes' if ok else 'NO'} |")

    rows.append("")
    rows.append(f"**Result: {len(tokens) - failures}/{len(tokens)} tokenURI pixel-identical to preview**")
    append_log(rows)

    if failures:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
