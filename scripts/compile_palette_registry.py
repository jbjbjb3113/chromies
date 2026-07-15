#!/usr/bin/env python3
"""
Compile art-pipeline/palette-registry.json + trait-byte-registry.json into all
palette/trait build artifacts.

**Authoritative entry point** — always run this script after editing either registry.
Do not invoke trait_byte_registry.py directly; it is a library module called from here.

Regenerate (from repo root):
    py -3 scripts/compile_palette_registry.py

Verify committed outputs match (CI gate):
    py -3 scripts/check_mint_encoder.py

Sources of truth:
    - art-pipeline/palette-registry.json          → ChromaPaletteData.sol (palette colors + paletteName)
    - art-pipeline/trait-byte-registry.json       → on-chain-trait-bytes.js, mint_payload.py tables
    - scripts/trait_byte_registry.py              → ON_CHAIN_CHARACTER_BYTES (character slot [0])
                                                    + ChromaTraitLabels.sol generator

ChromaTraitLabels.sol is emitted by trait_byte_registry.write_trait_labels_sol(), invoked
from write_trait_artifacts() at the end of main() below — same compile pass as
on-chain-trait-bytes.js. After trait-byte-registry.json changes, commit the regenerated
contracts/generated/ChromaTraitLabels.sol and redeploy ChromaRenderer (labels are compiled
into the renderer binary; seeded traitsHex is unchanged).

Generated (do not hand-edit):
  - contracts/generated/ChromaPaletteData.sol
  - contracts/generated/ChromaTraitLabels.sol      ← tokenURI JSON trait labels (ChromaRenderer)
  - test/size/InlinePaletteProbe.sol  (size gate probe only)
  - art-pipeline/generated/on-chain-palette-bytes.js
  - art-pipeline/generated/on-chain-trait-bytes.js
  - art-pipeline/generated/on-chain-character-bytes.js
  - art-pipeline/generated/on-chain-bg-colors.js
  - chromies-engine/engine_data/on_chain_palette_bytes.json
  - chromies-engine/engine_data/on_chain_trait_bytes.json
  - chromies-engine/engine_data/palette_colors_expanded.json
  - chromies-engine/engine_data/bg_colors.json
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
ART_PIPELINE = REPO / "art-pipeline"
REGISTRY_PATH = ART_PIPELINE / "palette-registry.json"
CHROMIES_CONFIG = ART_PIPELINE / "chromies-config.js"
ENGINE_DATA = REPO / "chromies-engine" / "engine_data"

MAX_VALID_PALETTE_ID = 79
ERROR_PALETTE_ID = 255
SHIRT_ID_START = 38

BASE_FAMILIES = ("SIGNAL", "ACID", "CYAN", "GHOST", "BLOOD", "MOSS")
SHIRT_COLORS = ("RED", "PURPLE", "ORANGE", "OLIVE", "GREEN", "GOLD", "BLUE")

ROLES = [
    {"index": 0, "name": "background"},
    {"index": 1, "name": "mask_dark"},
    {"index": 2, "name": "mask_mid"},
    {"index": 3, "name": "highlight"},
    {"index": 4, "name": "skin_shadow_deep"},
    {"index": 5, "name": "skin_shadow"},
    {"index": 6, "name": "skin_mid"},
    {"index": 7, "name": "skin_light"},
    {"index": 8, "name": "skin_highlight"},
    {
        "index": 9,
        "name": "shirt_torso",
        "legacy_aliases": ["hood"],
        "note": "Indexed-color slot for crew shirt / hood garment pixels (not a metadata hood trait).",
    },
    {"index": 10, "name": "eye_socket"},
    {"index": 11, "name": "eye_glow"},
    {"index": 12, "name": "eye_signal"},
    {"index": 13, "name": "hair_dark"},
    {"index": 14, "name": "hair_mid"},
    {"index": 15, "name": "hair_bright"},
]

# Mirrors art-pipeline/on-chain-character-bytes.js palette bytes (not character keys).
PALETTE_ID_TO_NAME: dict[int, str] = {
    0: "SIGNAL",
    1: "ACID",
    2: "CYAN",
    3: "GHOST",
    4: "BLOOD",
    5: "MOSS",
    6: "SIGNAL_BLONDE",
    7: "SIGNAL_GREY",
    8: "SIGNAL_RED",
    9: "ACID_BLONDE",
    10: "ACID_GREY",
    11: "ACID_RED",
    12: "CYAN_BLONDE",
    13: "CYAN_GREY",
    14: "CYAN_RED",
    15: "GHOST_BLONDE",
    16: "GHOST_GREY",
    17: "GHOST_RED",
    18: "BLOOD_BLONDE",
    19: "BLOOD_GREY",
    20: "BLOOD_RED",
    21: "MOSS_BLONDE",
    22: "MOSS_GREY",
    23: "MOSS_RED",
    24: "CAT",
    25: "ALIEN",
    26: "ZOMBIE",
    27: "GOLD",
    28: "NORMIE_SNOWFRO",
    29: "NORMIE_ACK",
    30: "NORMIE_SERC",
    31: "NORMIE_JACKBUTCHER",
    32: "NORMIE_TIMPERS",
    33: "NORMIE_DEEKAY",
    34: "NORMIE_PIV",
    35: "NORMIE_DOPEMIND",
    36: "NORMIE_UPCOMING2",
    37: "AGENT",
}


LEGACY_BYTE_MAP: dict[str, int] = {
    **{name: pid for pid, name in PALETTE_ID_TO_NAME.items()},
    "HeroA_Male": 0,
    "HeroA_Female": 1,
    "Alien": 2,
    "Cat": 3,
    "Agent": 4,
    "SideProfile_Male": 5,
    "SideProfile_Female": 6,
    "Chubby_Male": 7,
    "Zombie": 8,
}


def load_chromies_palettes() -> dict[str, Any]:
    sys.path.insert(0, str(REPO / "chromies-engine"))
    from engine.chromies_config_loader import load_chromies_config

    return load_chromies_config(CHROMIES_CONFIG)["palettes"]


def normalize_hex(value: str) -> str:
    h = value.strip().lower()
    if not h.startswith("#"):
        h = f"#{h}"
    return h


def expand_palette(entry: dict[str, Any], by_id: dict[int, dict[str, Any]]) -> list[str]:
    if entry["kind"] == "full":
        return [normalize_hex(c) for c in entry["colors"]]
    base = by_id[entry["base_id"]]
    colors = expand_palette(base, by_id)
    for slot, hex_color in entry.get("slot_overrides", {}).items():
        colors[int(slot)] = normalize_hex(hex_color)
    return colors


def bootstrap_registry(palettes: dict[str, Any]) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []

    for pid, name in sorted(PALETTE_ID_TO_NAME.items()):
        if name not in palettes:
            raise KeyError(f"Missing palette in chromies-config: {name}")
        entries.append(
            {"id": pid, "name": name, "kind": "full", "colors": palettes[name]["colors"]}
        )

    shirt_id = SHIRT_ID_START
    for base in BASE_FAMILIES:
        base_id = PALETTE_ID_TO_NAME[base] if base in PALETTE_ID_TO_NAME else LEGACY_BYTE_MAP[base]
        for color in SHIRT_COLORS:
            shirt_name = f"{base}_SHIRT_{color}"
            override = normalize_hex(palettes[shirt_name]["colors"][9])
            entries.append(
                {
                    "id": shirt_id,
                    "name": shirt_name,
                    "kind": "derived",
                    "base_id": base_id,
                    "slot_overrides": {"9": override},
                }
            )
            shirt_id += 1

    entries.sort(key=lambda e: e["id"])
    return {
        "version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "max_valid_palette_id": MAX_VALID_PALETTE_ID,
        "error_palette_id": ERROR_PALETTE_ID,
        "out_of_range_policy": {
            "mint_encode": "reject",
            "tokenuri_render": "error_palette_magenta",
        },
        "roles": ROLES,
        "palettes": entries,
    }


def load_registry() -> dict[str, Any]:
    palettes = load_chromies_palettes()
    if REGISTRY_PATH.is_file():
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    registry = bootstrap_registry(palettes)
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(registry, indent=2), encoding="utf-8")
    return registry


def validate_registry(registry: dict[str, Any], expanded: dict[int, list[str]]) -> None:
    ids = [p["id"] for p in registry["palettes"]]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate palette IDs in registry")
    if ERROR_PALETTE_ID in ids:
        raise ValueError("ERROR_PALETTE_ID must not appear in registry palettes")
    if max(ids) > MAX_VALID_PALETTE_ID:
        raise ValueError(f"Max palette id {max(ids)} exceeds MAX_VALID_PALETTE_ID")
    for pid in range(MAX_VALID_PALETTE_ID + 1):
        if pid not in expanded:
            raise ValueError(f"Missing expanded colors for palette id {pid}")


# Mint-native background color palette (JB ruling, 2026-07-13).
# Trait byte 0x00 = renderer-applied default (#e3e5e4, never stored in payload
# data); bytes 0x01-0x08 map to the ratified palette in listed order.
BG_COLOR_COUNT = 8


def validate_bg_colors(registry: dict[str, Any]) -> None:
    bg = registry.get("bg_colors")
    if not bg:
        raise ValueError("Registry missing bg_colors section (JB ruling 2026-07-13)")
    default = bg["default"]
    if default["trait_byte"] != 0:
        raise ValueError("bg_colors default trait_byte must be 0")
    if normalize_hex(default["color"]) != "#e3e5e4":
        raise ValueError("bg_colors default color must be #e3e5e4")
    colors = bg["colors"]
    if len(colors) != BG_COLOR_COUNT:
        raise ValueError(f"bg_colors must have exactly {BG_COLOR_COUNT} colors")
    for expected_byte, entry in enumerate(colors, start=1):
        if entry["trait_byte"] != expected_byte:
            raise ValueError(
                f"bg_colors entry {entry['name']} trait_byte {entry['trait_byte']} != {expected_byte}"
            )
        if not re.fullmatch(r"#[0-9a-f]{6}", normalize_hex(entry["color"])):
            raise ValueError(f"bg_colors entry {entry['name']} has invalid hex {entry['color']}")
    names = [entry["name"] for entry in colors]
    if len(names) != len(set(names)):
        raise ValueError("bg_colors names must be unique")


def write_bg_artifacts(registry: dict[str, Any]) -> None:
    bg = registry["bg_colors"]
    byte_to_color = {"0": normalize_hex(bg["default"]["color"])}
    byte_to_name = {"0": "BG_DEFAULT"}
    for entry in bg["colors"]:
        byte_to_color[str(entry["trait_byte"])] = normalize_hex(entry["color"])
        byte_to_name[str(entry["trait_byte"])] = entry["name"]

    payload = {
        "ruling": bg["ruling"],
        "default_trait_byte": 0,
        "byte_to_name": byte_to_name,
        "byte_to_color": byte_to_color,
    }
    ENGINE_DATA.mkdir(parents=True, exist_ok=True)
    (ENGINE_DATA / "bg_colors.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )

    js_lines = [
        "// AUTO-GENERATED by scripts/compile_palette_registry.py — do not edit.",
        "// Mint-native BG color palette (JB ruling, 2026-07-13). Byte 0 = renderer default.",
        "const BG_COLOR_BYTES = Object.freeze({",
    ]
    for byte_str in sorted(byte_to_name, key=int):
        js_lines.append(
            f'  {byte_to_name[byte_str]}: {{ byte: {byte_str}, color: "{byte_to_color[byte_str]}" }},'
        )
    js_lines.append("});")
    js_lines.append("module.exports = { BG_COLOR_BYTES };")
    out_dir = ART_PIPELINE / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "on-chain-bg-colors.js").write_text("\n".join(js_lines) + "\n", encoding="utf-8")


def hex_to_rgb_bytes(hex_color: str) -> tuple[int, int, int]:
    h = normalize_hex(hex_color).lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def pack_table(expanded: dict[int, list[str]]) -> str:
    chunks: list[str] = []
    for pid in range(MAX_VALID_PALETTE_ID + 1):
        colors = expanded[pid]
        if len(colors) != 16:
            raise ValueError(f"Palette {pid} must have 16 colors")
        for hex_color in colors:
            r, g, b = hex_to_rgb_bytes(hex_color)
            chunks.append(f"{r:02x}{g:02x}{b:02x}")
    return "".join(chunks)


def write_expanded_json(expanded: dict[int, list[str]], names: dict[int, str]) -> None:
    payload = {
        "max_valid_palette_id": MAX_VALID_PALETTE_ID,
        "error_palette_id": ERROR_PALETTE_ID,
        "error_palette_colors": ["#ff00ff"] * 16,
        "palettes": {
            str(pid): {"name": names[pid], "colors": expanded[pid]}
            for pid in range(MAX_VALID_PALETTE_ID + 1)
        },
    }
    ENGINE_DATA.mkdir(parents=True, exist_ok=True)
    (ENGINE_DATA / "palette_colors_expanded.json").write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )


def write_byte_maps(names: dict[int, str]) -> None:
    byte_map = {names[pid]: pid for pid in range(MAX_VALID_PALETTE_ID + 1)}
    (ENGINE_DATA / "on_chain_palette_bytes.json").write_text(
        json.dumps(byte_map, indent=2, sort_keys=True), encoding="utf-8"
    )
    js_lines = [
        "// AUTO-GENERATED by scripts/compile_palette_registry.py — do not edit.",
        "const ON_CHAIN_PALETTE_BYTES = Object.freeze({",
    ]
    for name, pid in sorted(byte_map.items(), key=lambda item: item[1]):
        js_lines.append(f'  {name}: {pid},')
    js_lines.append("});")
    js_lines.append("module.exports = { ON_CHAIN_PALETTE_BYTES };")
    out_dir = ART_PIPELINE / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "on-chain-palette-bytes.js").write_text("\n".join(js_lines) + "\n", encoding="utf-8")


def generate_palette_data_sol(packed_hex: str, names: dict[int, str]) -> str:
    name_cases = []
    for pid in range(MAX_VALID_PALETTE_ID + 1):
        safe = names[pid].replace('"', '\\"')
        name_cases.append(f'        if (paletteId == {pid}) return "{safe}";')
    name_cases.append('        if (paletteId > MAX_VALID_PALETTE_ID) return "ERROR";')

    return f"""// SPDX-License-Identifier: MIT
// AUTO-GENERATED by scripts/compile_palette_registry.py — do not edit.
pragma solidity ^0.8.24;

import {{PaletteStrings}} from "../PaletteStrings.sol";
import {{IChromaPaletteData}} from "../IChromaPaletteData.sol";

/// @notice Immutable palette table (packed RGB). Read by ChromaRenderer at tokenURI time.
contract ChromaPaletteData is IChromaPaletteData {{
    uint8 public constant MAX_VALID_PALETTE_ID = {MAX_VALID_PALETTE_ID};
    uint8 public constant ERROR_PALETTE_ID = {ERROR_PALETTE_ID};

    bytes internal constant _PACKED = hex"{packed_hex}";

    function paletteColors(uint8 paletteId) external pure returns (string[16] memory colors) {{
        bytes3[16] memory rgb = _loadRgb(paletteId);
        for (uint8 i = 0; i < 16; ++i) {{
            colors[i] = PaletteStrings.toHex(rgb[i]);
        }}
    }}

    function paletteName(uint8 paletteId) external pure returns (string memory) {{
{chr(10).join(name_cases)}
        return "SIGNAL";
    }}

    function _loadRgb(uint8 paletteId) internal pure returns (bytes3[16] memory rgb) {{
        if (paletteId > MAX_VALID_PALETTE_ID) {{
            for (uint8 i = 0; i < 16; ++i) {{
                rgb[i] = bytes3(0xFF00FF);
            }}
            return rgb;
        }}
        uint256 offset = uint256(paletteId) * 48;
        for (uint8 i = 0; i < 16; ++i) {{
            rgb[i] = _read3(offset + i * 3);
        }}
    }}

    function _read3(uint256 offset) private pure returns (bytes3 value) {{
        value = bytes3(
            uint24(
                (uint256(uint8(_PACKED[offset])) << 16) | (uint256(uint8(_PACKED[offset + 1])) << 8)
                    | uint256(uint8(_PACKED[offset + 2]))
            )
        );
    }}
}}
"""


def generate_inline_probe(expanded: dict[int, list[str]]) -> str:
    blocks = []
    for pid in range(MAX_VALID_PALETTE_ID + 1):
        colors = expanded[pid]
        joined = ", ".join(f'"{c}"' for c in colors)
        blocks.append(
            f"        if (paletteId == {pid}) {{\n"
            f"            return [{joined}];\n"
            f"        }}"
        )
    body = "\n".join(blocks)
    return f"""// SPDX-License-Identifier: MIT
// AUTO-GENERATED size probe — inline if-chain for all {MAX_VALID_PALETTE_ID + 1} palettes.
pragma solidity ^0.8.24;

contract InlinePaletteProbe {{
    function paletteColors(uint8 paletteId) external pure returns (string[16] memory) {{
{body}
        return [
            "#ff00ff", "#ff00ff", "#ff00ff", "#ff00ff", "#ff00ff", "#ff00ff", "#ff00ff", "#ff00ff",
            "#ff00ff", "#ff00ff", "#ff00ff", "#ff00ff", "#ff00ff", "#ff00ff", "#ff00ff", "#ff00ff"
        ];
    }}
}}
"""


def main() -> None:
    registry = load_registry()
    by_id = {entry["id"]: entry for entry in registry["palettes"]}
    expanded = {pid: expand_palette(entry, by_id) for pid, entry in by_id.items()}
    names = {entry["id"]: entry["name"] for entry in registry["palettes"]}
    validate_registry(registry, expanded)
    validate_bg_colors(registry)

    packed = pack_table(expanded)
    write_expanded_json(expanded, names)
    write_byte_maps(names)
    write_bg_artifacts(registry)

    gen_dir = REPO / "contracts" / "generated"
    gen_dir.mkdir(parents=True, exist_ok=True)
    (gen_dir / "ChromaPaletteData.sol").write_text(
        generate_palette_data_sol(packed, names), encoding="utf-8"
    )

    probe_dir = REPO / "test" / "size"
    probe_dir.mkdir(parents=True, exist_ok=True)
    (probe_dir / "InlinePaletteProbe.sol").write_text(
        generate_inline_probe(expanded), encoding="utf-8"
    )

    REGISTRY_PATH.write_text(json.dumps(registry, indent=2), encoding="utf-8")

    from trait_byte_registry import load_trait_registry, write_trait_artifacts

    palette_byte_map = {names[pid]: pid for pid in range(MAX_VALID_PALETTE_ID + 1)}
    trait_registry = load_trait_registry()
    write_trait_artifacts(trait_registry, palette_byte_map)

    print(
        f"Wrote registry + artifacts ({MAX_VALID_PALETTE_ID + 1} palettes, "
        f"{len(packed)//2} packed bytes, trait-byte-registry compiled)"
    )


if __name__ == "__main__":
    main()
