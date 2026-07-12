"""Load compiler-generated palette registry artifacts."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

ENGINE_DATA = Path(__file__).resolve().parent.parent / "engine_data"


@lru_cache(maxsize=1)
def load_on_chain_palette_bytes() -> dict[str, int]:
    path = ENGINE_DATA / "on_chain_palette_bytes.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return {str(k).upper(): int(v) for k, v in data.items()}


@lru_cache(maxsize=1)
def load_palette_registry_meta() -> dict[str, Any]:
    path = ENGINE_DATA / "palette_colors_expanded.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return {
        "max_valid_palette_id": int(data["max_valid_palette_id"]),
        "error_palette_id": int(data["error_palette_id"]),
        "error_palette_colors": [c.lower() for c in data["error_palette_colors"]],
        "palettes": {
            int(pid): [c.lower() for c in entry["colors"]]
            for pid, entry in data["palettes"].items()
        },
    }


def palette_colors_on_chain(palette_id: int) -> list[str]:
    meta = load_palette_registry_meta()
    max_id = meta["max_valid_palette_id"]
    palettes: dict[int, list[str]] = meta["palettes"]
    if palette_id > max_id:
        return list(meta["error_palette_colors"])
    if palette_id in palettes:
        return list(palettes[palette_id])
    return list(meta["error_palette_colors"])
