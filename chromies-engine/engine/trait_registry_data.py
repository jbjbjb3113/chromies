"""Load compiler-generated trait byte tables."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

ENGINE_DATA = Path(__file__).resolve().parent.parent / "engine_data"


@lru_cache(maxsize=1)
def load_trait_byte_registry() -> dict[str, Any]:
    path = ENGINE_DATA / "on_chain_trait_bytes.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_trait_slot_tables() -> dict[str, dict[str, int]]:
    reg = load_trait_byte_registry()
    return {slot: dict(entry["bytes"]) for slot, entry in reg["slots"].items()}


@lru_cache(maxsize=1)
def load_on_chain_character_bytes() -> dict[str, int]:
    return dict(load_trait_byte_registry()["character_bytes"])
