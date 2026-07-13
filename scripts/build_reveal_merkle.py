#!/usr/bin/env python3
"""Build reveal merkle root + proofs (matches art-pipeline/generate-reveal-merkle.js)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from eth_abi import encode
from eth_hash.auto import keccak

REPO = Path(__file__).resolve().parents[1]


def leaf_hash(token_id: int, pixels_hex: str, traits_hex: str) -> bytes:
    px = bytes.fromhex(pixels_hex[2:] if pixels_hex.startswith("0x") else pixels_hex)
    tr = bytes.fromhex(traits_hex[2:] if traits_hex.startswith("0x") else traits_hex)
    encoded = encode(["uint256", "bytes", "bytes"], [token_id, px, tr])
    return keccak(encoded)


def _sorted_pair(a: bytes, b: bytes) -> bytes:
    return keccak(a + b) if a <= b else keccak(b + a)


def build_tree(leaves: list[bytes]) -> tuple[bytes, dict[int, list[str]]]:
    if not leaves:
        raise ValueError("empty leaves")
    level = list(leaves)
    while len(level) > 1:
        nxt: list[bytes] = []
        for i in range(0, len(level), 2):
            if i + 1 < len(level):
                nxt.append(_sorted_pair(level[i], level[i + 1]))
            else:
                nxt.append(level[i])
        level = nxt
    root = level[0]

    proofs: dict[int, list[str]] = {}
    for idx, leaf in enumerate(leaves):
        proof: list[str] = []
        pos = idx
        lvl = list(leaves)
        while len(lvl) > 1:
            sibling_idx = pos ^ 1
            if sibling_idx < len(lvl):
                proof.append("0x" + lvl[sibling_idx].hex())
            pos //= 2
            nxt = []
            for i in range(0, len(lvl), 2):
                if i + 1 < len(lvl):
                    nxt.append(_sorted_pair(lvl[i], lvl[i + 1]))
                else:
                    nxt.append(lvl[i])
            lvl = nxt
        proofs[idx] = proof
    return root, proofs


def build_from_records(records: list[dict]) -> dict:
    leaves = [leaf_hash(int(r["tokenId"]), r["pixelsHex"], r["traitsHex"]) for r in records]
    root, idx_proofs = build_tree(leaves)
    proofs = {}
    for i, rec in enumerate(records):
        proofs[str(rec["tokenId"])] = idx_proofs[i]
    return {"root": "0x" + root.hex(), "proofs": proofs}


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: build_reveal_merkle.py <records.json> <out.json>", file=sys.stderr)
        return 1
    records = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = build_from_records(records)
    Path(sys.argv[2]).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(out["root"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
