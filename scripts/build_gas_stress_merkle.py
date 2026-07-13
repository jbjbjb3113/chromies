#!/usr/bin/env python3
"""Build merkle fixtures for gas stress tests (production-depth trees)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "chromies-engine" / "generated" / "gas_stress_merkle.json"
MINT_DATA = REPO / "art-pipeline" / "output" / "mint-data.json"
REVEAL_PROOFS = REPO / "art-pipeline" / "output" / "reveal-merkle-proofs.json"
TIER2 = REPO / "public" / "merkle-tier2.json"
TIER1 = REPO / "public" / "merkle-tier1.json"

try:
    from eth_abi import encode
    from eth_hash.auto import keccak
except ImportError:
    print("Install eth-abi and eth-hash[pycryptodome]", file=sys.stderr)
    raise


def leaf_allowlist(addr: str) -> bytes:
    return keccak(bytes.fromhex(addr.lower().replace("0x", "")))


def sorted_pair(a: bytes, b: bytes) -> bytes:
    return keccak(a + b) if a <= b else keccak(b + a)


def build_tree(leaves: list[bytes], proof_indices: list[int] | None = None) -> tuple[bytes, dict[int, list[str]]]:
    if not leaves:
        raise ValueError("empty leaves")

    def next_level(current: list[bytes]) -> list[bytes]:
        lvl = list(current)
        if len(lvl) % 2 == 1:
            lvl.append(lvl[-1])
        nxt: list[bytes] = []
        for i in range(0, len(lvl), 2):
            nxt.append(sorted_pair(lvl[i], lvl[i + 1]))
        return nxt

    level = list(leaves)
    while len(level) > 1:
        level = next_level(level)
    root = level[0]

    indices = proof_indices if proof_indices is not None else list(range(len(leaves)))
    proofs: dict[int, list[str]] = {}
    for idx in indices:
        proof: list[str] = []
        pos = idx
        lvl = list(leaves)
        while len(lvl) > 1:
            working = list(lvl)
            if len(working) % 2 == 1:
                working.append(working[-1])
            sibling_idx = pos ^ 1
            if sibling_idx < len(working):
                proof.append("0x" + working[sibling_idx].hex())
            pos //= 2
            lvl = next_level(lvl)
        proofs[idx] = proof
    return root, proofs


def pick_wallet(proofs: dict) -> tuple[str, list[str]]:
    for wallet, proof in proofs.items():
        if wallet.lower() not in ("0x0000000000000000000000000000000000000000", "0x0"):
            return wallet, proof
    raise ValueError("no non-zero wallet in proofs")


def build_synthetic_allowlist(count: int) -> tuple[str, str, list[str]]:
    leaves = [leaf_allowlist(f"0x{1000 + i:040x}") for i in range(count)]
    root, proofs = build_tree(leaves, [0])
    return "0x" + root.hex(), f"0x{1000:040x}", proofs[0]


def leaf_reveal(token_id: int, pixels_hex: str, traits_hex: str) -> bytes:
    px = bytes.fromhex(pixels_hex[2:] if pixels_hex.startswith("0x") else pixels_hex)
    tr = bytes.fromhex(traits_hex[2:] if traits_hex.startswith("0x") else traits_hex)
    return keccak(encode(["uint256", "bytes", "bytes"], [token_id, px, tr]))


def build_reveal_tree(mint_rows: list[dict], proof_indices: list[int]) -> tuple[bytes, dict[int, list[str]]]:
    leaves = [leaf_reveal(r["tokenId"], r["pixelsHex"], r["traitsHex"]) for r in mint_rows]
    return build_tree(leaves, proof_indices)


def main() -> int:
    mint = json.loads(MINT_DATA.read_text(encoding="utf-8"))
    reveal_doc = json.loads(REVEAL_PROOFS.read_text(encoding="utf-8"))
    tier2 = json.loads(TIER2.read_text(encoding="utf-8"))
    tier1 = json.loads(TIER1.read_text(encoding="utf-8"))

    token1 = next(row for row in mint if row["tokenId"] == 1)

    sample_ids = list(range(1, 7)) + [50, 100, 200, 400]
    id_to_index = {r["tokenId"]: i for i, r in enumerate(mint)}
    sample_indices = [id_to_index[tid] for tid in sample_ids]
    reveal_root, reveal_proofs = build_reveal_tree(mint, sample_indices)
    reveal_root_hex = "0x" + reveal_root.hex()
    proof1 = reveal_proofs[id_to_index[1]]

    if reveal_doc.get("root") and reveal_doc["root"].lower() != reveal_root_hex.lower():
        print(
            f"WARNING: recomputed reveal root {reveal_root_hex} != file root {reveal_doc['root']}",
            file=sys.stderr,
        )

    tier2_wallet, tier2_proof = pick_wallet(tier2["proofs"])
    tier1_wallet, tier1_proof = pick_wallet(tier1["proofs"])
    synth_root, synth_wallet, synth_proof = build_synthetic_allowlist(6946)

    mint_samples: dict[str, dict] = {}
    for tid in sample_ids:
        row = next(r for r in mint if r["tokenId"] == tid)
        idx = id_to_index[tid]
        mint_samples[str(tid)] = {
            "pixels_hex": row["pixelsHex"],
            "traits_hex": row["traitsHex"],
            "proof": reveal_proofs[idx],
        }

    doc = {
        "reveal_production": {
            "leaf_count": len(mint),
            "proof_depth": len(proof1),
            "root": reveal_root_hex,
            "token_id": 1,
            "pixels_hex": token1["pixelsHex"],
            "traits_hex": token1["traitsHex"],
            "proof": proof1,
        },
        "allowlist_tier1_production": {
            "leaf_count": len(tier1["proofs"]),
            "proof_depth": len(tier1_proof),
            "root": tier1["root"],
            "wallet": tier1_wallet,
            "proof": tier1_proof,
        },
        "allowlist_tier2_production": {
            "leaf_count": len(tier2["proofs"]),
            "proof_depth": len(tier2_proof),
            "root": tier2["root"],
            "wallet": tier2_wallet,
            "proof": tier2_proof,
        },
        "allowlist_tier2_stress_6946": {
            "leaf_count": 6946,
            "proof_depth": len(synth_proof),
            "root": synth_root,
            "wallet": synth_wallet,
            "proof": synth_proof,
            "note": "Synthetic 6946-wallet tree for worst-case allowlist proof depth",
        },
        "mint_samples": mint_samples,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"  tier2 prod depth={len(tier2_proof)} wallets={len(tier2['proofs'])}")
    print(f"  reveal depth={len(proof1)} leaves={len(mint)} root={reveal_root_hex}")
    print(f"  synthetic 6946 depth={len(synth_proof)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
