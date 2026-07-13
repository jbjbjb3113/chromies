"""Task 1 of "Rework Prototype onto Canonical Bytes + JS Compositor": build a
token's render grid directly from public/data/mint-data.json's committed
pixelsHex/traitsHex -- no compositing, no RNG, no chromies-engine trait-rolling
(compositor.py's pick_*/roll_slot_variant machinery, the code path already known
to diverge from mint-data.json -- see scripts/verify/pipeline-parity-check.py --
is never imported here at all). The committed bytes ARE the ground truth for a
base sprite; nothing in this module re-derives anything that could disagree with
them, because it only unpacks what's already committed.

The only two chromies-engine imports here are pure, deterministic decode/lookup
helpers with zero RNG and zero trait-rolling -- the same functions the on-chain
renderer's logic mirrors:
  - engine.mint_payload.from_hex        (hex string -> raw bytes)
  - engine.payload_render.render_from_payload
        (packed pixelsHex bytes -> 4bpp role-index grid,
         packed traitsHex bytes -> palette_id -> 16 on-chain hex colors -> RGBA)

Not part of the render path (scripts/anim/catalogue.py, primitives.py,
expression_deltas.py never import this) -- this is a compile-step helper only,
used by compile-face-regions.py, build-smile-transition.py, and
render-expression-prototype.py. See scripts/anim/__init__.py.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_ROOT.parent
ENGINE_ROOT = REPO_ROOT / "chromies-engine"
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from engine.mint_payload import from_hex  # noqa: E402
from engine.payload_render import render_from_payload  # noqa: E402

MINT_DATA = REPO_ROOT / "public" / "data" / "mint-data.json"
GRID = 64


def load_mint_records() -> dict[int, dict[str, Any]]:
    records = json.loads(MINT_DATA.read_text(encoding="utf-8"))
    return {r["tokenId"]: r for r in records}


def decode_grid(pixels_hex: str, traits_hex: str) -> np.ndarray:
    """Pure decode of an arbitrary (pixelsHex, traitsHex) pair into a
    (64, 64, 4) uint8 RGBA grid -- same unpack + on-chain-palette lookup as
    canonical_grid_for_token(), but for hex strings that don't need to already
    be a committed mint-data.json record (e.g. an expression-swapped variant
    from scripts/anim/_expression_swap_source.py::swap_expression)."""
    return render_from_payload(from_hex(pixels_hex), from_hex(traits_hex), grid=GRID)


def canonical_grid_for_token(
    token_id: int,
    mint_records: dict[int, dict[str, Any]] | None = None,
) -> np.ndarray:
    """Decode `token_id`'s committed pixelsHex/traitsHex from
    public/data/mint-data.json directly into a (64, 64, 4) uint8 RGBA grid --
    pure unpack + on-chain-palette lookup, no compositing, no RNG, no
    verification scan (there is nothing to verify against: this IS the
    committed data). Raises KeyError if token_id has no record."""
    records = mint_records if mint_records is not None else load_mint_records()
    record = records[token_id]
    return decode_grid(record["pixelsHex"], record["traitsHex"])
