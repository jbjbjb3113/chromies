#!/usr/bin/env python3
"""Verify commemorative 100: tokenURI labels vs pipeline decode; PNG byte identity."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / "chromies-engine"
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))

from engine.mint_payload import decode_traits, from_hex  # noqa: E402
from engine.payload_render import render_from_hex  # noqa: E402

COMMEMORATIVE = "0x3C8C9615889762bDcF9647a3C86C74aFA498a158"
RENDERER = "0x9C34Bd0c872983e33611f0cF1cF3C1C968516736"
RPC_ALIAS = "robinhood_mainnet"

COMMEMORATIVE_JSON = REPO / "reports" / "robinhood" / "commemorative-100.json"
URI_DIR = REPO / "reports" / "robinhood" / "label-parity-100"
REPORT_PATH = URI_DIR / "parity-report.json"

SHELL_PNG_RE = re.compile(r'data:image/png;base64,([A-Za-z0-9+/=]+)')

# trait_type emitted in tokenURI JSON -> decode_traits key
EMITTED_SLOTS: tuple[tuple[str, str], ...] = (
    ("Character", "character"),
    ("Palette", "palette"),
    ("Hood", "hood"),
    ("Shirt", "shirt"),
    ("Body", "body"),
    ("Bodytattoo", "bodytattoo"),
    ("Necklace", "necklace"),
    ("Tattoo", "tattoo"),
    ("Beard", "beard"),
    ("Mustache", "mustache"),
    ("Eyes", "eyes"),
    ("Earrings", "earrings"),
    ("Glasses", "glasses"),
    ("Hair", "hair"),
)


def _cast(*args: str) -> str:
    exe = REPO / ".foundry-bin" / "cast.exe"
    cmd = [str(exe) if exe.is_file() else "cast", *args]
    return subprocess.check_output(cmd, text=True, cwd=REPO).strip()


def _forge(*args: str) -> None:
    exe = REPO / ".foundry-bin" / "forge.exe"
    cmd = [str(exe) if exe.is_file() else "forge", *args]
    subprocess.run(cmd, cwd=REPO, check=True)


def pipeline_attributes(traits_hex: str) -> dict[str, str]:
    decoded = decode_traits(from_hex(traits_hex))
    return {trait_type: decoded.decoded[key]["value"] for trait_type, key in EMITTED_SLOTS}


def parse_token_uri(uri: str) -> tuple[dict[str, str], bytes]:
    uri = uri.strip().strip('"')
    if not uri.startswith("data:application/json;base64,"):
        raise ValueError(f"unexpected tokenURI scheme: {uri[:60]}")
    metadata = json.loads(base64.b64decode(uri.split(",", 1)[1]))
    attrs: dict[str, str] = {}
    for entry in metadata.get("attributes", []):
        trait_type = entry.get("trait_type")
        if trait_type in {t for t, _ in EMITTED_SLOTS}:
            attrs[trait_type] = str(entry.get("value"))
    image = metadata.get("image", "")
    if not image.startswith("data:image/svg+xml;base64,"):
        raise ValueError(f"unexpected image scheme: {image[:60]}")
    shell = base64.b64decode(image.split(",", 1)[1]).decode("utf-8")
    m = SHELL_PNG_RE.search(shell)
    if not m:
        raise ValueError("no embedded PNG in SVG shell")
    return attrs, base64.b64decode(m.group(1))


def rgba_from_png(png_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    if img.size != (64, 64):
        raise ValueError(f"expected 64x64 PNG, got {img.size}")
    return np.asarray(img, dtype=np.uint8)


def export_local_token_uris() -> None:
    URI_DIR.mkdir(parents=True, exist_ok=True)
    _forge(
        "test",
        "--match-test",
        "test_exportTokenUris_forPythonVerification",
        "--match-path",
        "test/robinhood/CommemorativeLabelParity100.t.sol",
        "-q",
    )


def fetch_mainnet_traits(token_id: int) -> str:
    raw = _cast(
        "call",
        COMMEMORATIVE,
        "getTraits(uint256)(bytes)",
        str(token_id),
        "--rpc-url",
        RPC_ALIAS,
    )
    return raw.lower()


def fetch_mainnet_token_uri(token_id: int) -> str:
    return _cast(
        "call",
        RENDERER,
        "tokenURI(uint256)(string)",
        str(token_id),
        "--rpc-url",
        RPC_ALIAS,
    ).strip().strip('"')


def main() -> int:
    records = json.loads(COMMEMORATIVE_JSON.read_text(encoding="utf-8"))["tokens"]
    assert len(records) == 100

    print("Exporting local ChromaRendererRobinhood tokenURIs (fixed labels)...")
    export_local_token_uris()

    label_divergences: list[dict] = []
    png_mainnet_vs_local: list[dict] = []
    png_vs_pixels_hex: list[dict] = []
    onchain_traits_mismatch: list[dict] = []

    for rec in records:
        token_id = int(rec["commemorativeTokenId"])
        traits_hex = rec["traitsHex"].lower()
        pixels_hex = rec["pixelsHex"].lower()

        # On-chain traits match seed file
        try:
            onchain_traits = fetch_mainnet_traits(token_id).lower()
            if onchain_traits != traits_hex:
                onchain_traits_mismatch.append(
                    {"tokenId": token_id, "seed": traits_hex, "onchain": onchain_traits}
                )
        except Exception as exc:  # noqa: BLE001
            onchain_traits_mismatch.append({"tokenId": token_id, "error": str(exc)})

        expected = pipeline_attributes(traits_hex)

        local_uri_path = URI_DIR / f"uri-{token_id}.txt"
        local_uri = local_uri_path.read_text(encoding="utf-8")
        local_attrs, local_png = parse_token_uri(local_uri)

        for trait_type, _key in EMITTED_SLOTS:
            exp = expected[trait_type]
            got = local_attrs.get(trait_type)
            if got != exp:
                label_divergences.append(
                    {
                        "tokenId": token_id,
                        "slot": trait_type,
                        "pipeline": exp,
                        "tokenURI": got,
                    }
                )

        # PNG: mainnet (pre-deploy labels) vs local forge (post-fix labels) — must match
        try:
            mainnet_uri = fetch_mainnet_token_uri(token_id)
            _mainnet_attrs, mainnet_png = parse_token_uri(mainnet_uri)
            if hashlib.sha256(mainnet_png).digest() != hashlib.sha256(local_png).digest():
                png_mainnet_vs_local.append(
                    {
                        "tokenId": token_id,
                        "mainnet_sha256": hashlib.sha256(mainnet_png).hexdigest(),
                        "local_sha256": hashlib.sha256(local_png).hexdigest(),
                        "mainnet_len": len(mainnet_png),
                        "local_len": len(local_png),
                    }
                )
        except Exception as exc:  # noqa: BLE001
            png_mainnet_vs_local.append({"tokenId": token_id, "error": str(exc)})

        # PNG vs pixelsHex authoritative render
        rgba_png = rgba_from_png(local_png)
        rgba_hex = render_from_hex(pixels_hex, traits_hex)
        if not np.array_equal(rgba_png, rgba_hex):
            diff_count = int(np.sum(np.any(rgba_png != rgba_hex, axis=-1)))
            png_vs_pixels_hex.append(
                {
                    "tokenId": token_id,
                    "diff_pixels": diff_count,
                    "total_pixels": 4096,
                }
            )

    report = {
        "commemorativeCount": 100,
        "labelDivergenceCount": len(label_divergences),
        "labelDivergences": label_divergences,
        "onchainTraitsMismatchCount": len(onchain_traits_mismatch),
        "onchainTraitsMismatches": onchain_traits_mismatch,
        "pngMainnetVsLocalCount": len(png_mainnet_vs_local),
        "pngMainnetVsLocal": png_mainnet_vs_local,
        "pngVsPixelsHexCount": len(png_vs_pixels_hex),
        "pngVsPixelsHex": png_vs_pixels_hex,
        "pass": (
            len(label_divergences) == 0
            and len(onchain_traits_mismatch) == 0
            and len(png_mainnet_vs_local) == 0
            and len(png_vs_pixels_hex) == 0
        ),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({k: v for k, v in report.items() if k != "labelDivergences"}, indent=2))
    if label_divergences:
        print("LABEL DIVERGENCES (first 10):", file=sys.stderr)
        for row in label_divergences[:10]:
            print(row, file=sys.stderr)
    if png_mainnet_vs_local:
        print("PNG MAINNET vs LOCAL (first 10):", file=sys.stderr)
        for row in png_mainnet_vs_local[:10]:
            print(row, file=sys.stderr)
    if png_vs_pixels_hex:
        print("PNG vs PIXELS_HEX (first 10):", file=sys.stderr)
        for row in png_vs_pixels_hex[:10]:
            print(row, file=sys.stderr)

    if report["pass"]:
        print("PASS: 100/100 label parity, PNG byte-identical mainnet vs local, PNG matches pixelsHex.")
        return 0
    print("FAIL: see parity-report.json", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
