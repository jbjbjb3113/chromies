"""Trait byte registry — compile helpers for mint encoder artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
ART_PIPELINE = REPO / "art-pipeline"
TRAITS_JSON = ART_PIPELINE / "traits.json"
TRAIT_REGISTRY_PATH = ART_PIPELINE / "trait-byte-registry.json"
ENGINE_DATA = REPO / "chromies-engine" / "engine_data"

ENCODED_SLOTS: tuple[tuple[int, str], ...] = (
    (2, "hood"),
    (3, "shirt"),
    (4, "body"),
    (5, "bodytattoo"),
    (6, "necklace"),
    (7, "tattoo"),
    (8, "mask"),
    (9, "beard"),
    (10, "mustache"),
    (11, "eyes"),
    (12, "earrings"),
    (13, "glasses"),
    (14, "hair"),
    (20, "hat"),
)

# HEAD_SHAPE (byte 19) is NOT a compositing slot in traits.json — it is a derived
# attribute of the "head" slot's picked variant name (Angular vs Classic head art).
# Fixed enum table (never grows from traits.json variant scanning like ENCODED_SLOTS).
#
# ACCESSORY (byte 21, ratified 2026-07-12 per JB ruling) collapses every
# per-character/orientation "accessory" pick to a single on-chain concept.
# Today the only non-None accessory concept is "holding a cigarette" — 7 named
# traits.json variants (Chubby_Cigarette, Female_Cigarette, Male_Cigarette,
# Male_Cigarette_Flipped, SP_Cigarette_Female, SP_Cigarette_Male,
# Zombie_Cigarette) all collapse to byte 1. Any future non-cigarette accessory
# concept must get its own byte value, not reuse 1.
DERIVED_SLOTS: tuple[tuple[int, str, dict[str, int]], ...] = (
    (19, "head_shape", {"None": 0, "Classic": 1, "Angular": 2}),
    (21, "accessory", {"None": 0, "Cigarette": 1}),
)

ANGULAR_HEAD_VARIANTS: tuple[str, ...] = ("Male_Angular", "Female_Angular")

CIGARETTE_ACCESSORY_VARIANTS: tuple[str, ...] = (
    "Chubby_Cigarette",
    "Female_Cigarette",
    "Male_Cigarette",
    "Male_Cigarette_Flipped",
    "SP_Cigarette_Female",
    "SP_Cigarette_Male",
    "Zombie_Cigarette",
)


def derive_head_shape(head_variant_name: str | None) -> str:
    if not head_variant_name:
        return "None"
    if head_variant_name in ANGULAR_HEAD_VARIANTS:
        return "Angular"
    return "Classic"


def derive_accessory(accessory_variant_name: str | None) -> str:
    if not accessory_variant_name:
        return "None"
    if accessory_variant_name in CIGARETTE_ACCESSORY_VARIANTS:
        return "Cigarette"
    return "None"

LEGACY_TRAIT_BYTES: dict[str, dict[str, int]] = {
    "hood": {"None": 0, "Classic": 1},
    "shirt": {"None": 0, "Crew": 1, "Tank": 2, "Tank_Female": 3},
    "body": {
        "None": 0,
        "Default": 1,
        "Female": 2,
        "Female_Tank": 3,
        "Alien": 4,
        "Tank": 5,
        "Zombie": 6,
    },
    "bodytattoo": {"None": 0, "UnderArmour": 1, "AkuHeart": 2, "Pyramid": 3, "Normies": 4},
    "necklace": {
        "None": 0,
        "Male_Chain": 1,
        "Female_Chain": 2,
        "Female_Ornate": 3,
        "Female_Flower": 4,
        "Female_UpsideDownCross": 5,
        "Female_Opal": 6,
        "Male_Chromies": 7,
        "Male_HappyFace": 8,
        "Male_Normies": 9,
        "Male_Pendent": 10,
    },
    "tattoo": {"None": 0, "Signal": 1, "Thug": 2, "Marks": 3, "Scar": 4},
    "mask": {"None": 0},
    "beard": {"None": 0, "Full": 1, "Goat": 2},
    "mustache": {"None": 0, "Thick": 1},
    "eyes": {
        "Signal": 0,
        "BlackEye": 1,
        "MakeUp": 2,
        "RunningMascara": 3,
        "Stoned": 4,
        "Alien": 5,
    },
    "earrings": {"None": 0, "Stud": 1},
    "glasses": {"None": 0, "Shades": 1, "Neo": 2, "VR": 3},
    "hair": {
        "None": 0,
        "Mohawk": 1,
        "Pompadour": 2,
        "MrT": 3,
        "Afro": 4,
        "Dreads": 5,
        "Surfer": 6,
        "FadeRight": 7,
        "AZVet": 8,
        "Buns": 9,
    },
}

ON_CHAIN_CHARACTER_BYTES: dict[str, int] = {
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

GENDER_SUFFIX_CHARACTERS = ("HeroA", "SideProfile", "Chubby")


def load_traits_catalog() -> dict[str, Any]:
    return json.loads(TRAITS_JSON.read_text(encoding="utf-8"))


def bootstrap_trait_registry() -> dict[str, Any]:
    traits = load_traits_catalog()
    slots_out: dict[str, Any] = {}
    for idx, slot in ENCODED_SLOTS:
        legacy = dict(LEGACY_TRAIT_BYTES.get(slot, {}))
        names = sorted({v["name"] for v in traits["slots"][slot]["variants"]})
        mapping = dict(legacy)
        next_byte = max(mapping.values(), default=-1) + 1
        for name in names:
            if name not in mapping:
                mapping[name] = next_byte
                next_byte += 1
            if next_byte > 255:
                raise ValueError(f"Slot {slot} exceeds uint8 capacity")
        slots_out[slot] = {"index": idx, "bytes": {name: mapping[name] for name in names}}
    for idx, slot, table in DERIVED_SLOTS:
        slots_out[slot] = {"index": idx, "bytes": dict(table)}
    return {
        "version": 1,
        "description": "On-chain trait variant bytes per slot. Compiled to JS/Python mint encoders.",
        "slots": slots_out,
    }


def load_trait_registry() -> dict[str, Any]:
    if not TRAIT_REGISTRY_PATH.is_file():
        registry = bootstrap_trait_registry()
        TRAIT_REGISTRY_PATH.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
        return registry
    registry = json.loads(TRAIT_REGISTRY_PATH.read_text(encoding="utf-8"))
    validate_trait_registry(registry)
    return registry


def validate_trait_registry(registry: dict[str, Any]) -> None:
    traits = load_traits_catalog()
    for idx, slot in ENCODED_SLOTS:
        entry = registry["slots"].get(slot)
        if not entry:
            raise ValueError(f"trait-byte-registry missing slot {slot}")
        if entry["index"] != idx:
            raise ValueError(f"slot {slot} index mismatch")
        catalog = {v["name"] for v in traits["slots"][slot]["variants"]}
        reg_names = set(entry["bytes"].keys())
        missing = catalog - reg_names
        if missing:
            raise ValueError(f"trait-byte-registry slot {slot} missing: {sorted(missing)[:5]}")
        extra = reg_names - catalog
        if extra:
            raise ValueError(f"trait-byte-registry slot {slot} stale names: {sorted(extra)[:5]}")
        legacy = LEGACY_TRAIT_BYTES.get(slot, {})
        for name, byte_val in legacy.items():
            if name in entry["bytes"] and entry["bytes"][name] != byte_val:
                raise ValueError(f"legacy byte drift {slot}.{name}: {entry['bytes'][name]} != {byte_val}")
        used: dict[int, str] = {}
        for name, byte_val in entry["bytes"].items():
            if byte_val in used:
                raise ValueError(f"duplicate byte {byte_val} in {slot}: {used[byte_val]} and {name}")
            used[byte_val] = name

    for idx, slot, table in DERIVED_SLOTS:
        entry = registry["slots"].get(slot)
        if not entry:
            raise ValueError(f"trait-byte-registry missing derived slot {slot}")
        if entry["index"] != idx:
            raise ValueError(f"derived slot {slot} index mismatch")
        if entry["bytes"] != table:
            raise ValueError(f"derived slot {slot} bytes drifted from fixed enum: {entry['bytes']} != {table}")


def write_trait_artifacts(registry: dict[str, Any], palette_byte_map: dict[str, int]) -> None:
    gen_dir = ART_PIPELINE / "generated"
    gen_dir.mkdir(parents=True, exist_ok=True)

    trait_lines = [
        "// AUTO-GENERATED by scripts/compile_palette_registry.py — do not edit.",
        "const TRAIT_BYTE_TABLES = Object.freeze({",
    ]
    for _idx, slot in ENCODED_SLOTS:
        table = registry["slots"][slot]["bytes"]
        trait_lines.append(f"  {slot}: Object.freeze({json.dumps(table, sort_keys=True)}),")
    for _idx, slot, _table in DERIVED_SLOTS:
        table = registry["slots"][slot]["bytes"]
        trait_lines.append(f"  {slot}: Object.freeze({json.dumps(table, sort_keys=True)}),")
    trait_lines.append("});")
    trait_lines.append("")
    trait_lines.append("const TRAIT_SLOT_INDEX = Object.freeze({")
    for idx, slot in ENCODED_SLOTS:
        trait_lines.append(f"  {slot}: {idx},")
    for idx, slot, _table in DERIVED_SLOTS:
        trait_lines.append(f"  {slot}: {idx},")
    trait_lines.append("});")
    trait_lines.append("module.exports = { TRAIT_BYTE_TABLES, TRAIT_SLOT_INDEX };")
    (gen_dir / "on-chain-trait-bytes.js").write_text("\n".join(trait_lines) + "\n", encoding="utf-8")

    pal_entries = ",\n".join(f"  {k}: {v}" for k, v in sorted(palette_byte_map.items(), key=lambda x: x[1]))
    char_entries = ",\n".join(f"  {k}: {v}" for k, v in ON_CHAIN_CHARACTER_BYTES.items())
    js = f"""// AUTO-GENERATED by scripts/compile_palette_registry.py — do not edit.
const ON_CHAIN_CHARACTER_BYTES = Object.freeze({{
{char_entries}
}});

const ON_CHAIN_PALETTE_BYTES = Object.freeze({{
{pal_entries}
}});

const GENDER_SUFFIX_CHARACTERS = Object.freeze({json.dumps(list(GENDER_SUFFIX_CHARACTERS))});

function characterKey(character) {{
  if (!character) return "HeroA_Male";
  if (GENDER_SUFFIX_CHARACTERS.includes(character.name) && character.gender) {{
    return `${{character.name}}_${{character.gender}}`;
  }}
  return character.name;
}}

function characterByte(character, warnings = null) {{
  const key = characterKey(character);
  const byte = ON_CHAIN_CHARACTER_BYTES[key];
  if (byte === undefined) {{
    if (warnings) warnings.push(`Character [0]: unknown value "${{key}}"`);
    return 0;
  }}
  return byte;
}}

function paletteByte(paletteName, warnings = null) {{
  const key = String(paletteName || "SIGNAL").toUpperCase();
  const byte = ON_CHAIN_PALETTE_BYTES[key];
  if (byte === undefined) {{
    if (warnings) warnings.push(`Palette [1]: unknown value "${{key}}"`);
    return 0;
  }}
  return byte;
}}

function buildCharacterDecoderTable() {{
  const maxByte = Math.max(...Object.values(ON_CHAIN_CHARACTER_BYTES));
  const table = new Array(maxByte + 1).fill(null);
  for (const [name, byte] of Object.entries(ON_CHAIN_CHARACTER_BYTES)) {{
    table[byte] = name;
  }}
  return table;
}}

module.exports = {{
  ON_CHAIN_CHARACTER_BYTES,
  ON_CHAIN_PALETTE_BYTES,
  GENDER_SUFFIX_CHARACTERS,
  characterKey,
  characterByte,
  paletteByte,
  buildCharacterDecoderTable,
}};
"""
    (gen_dir / "on-chain-character-bytes.js").write_text(js, encoding="utf-8")

    ENGINE_DATA.mkdir(parents=True, exist_ok=True)
    py_trait = {
        "slots": {
            slot: {"index": registry["slots"][slot]["index"], "bytes": registry["slots"][slot]["bytes"]}
            for _idx, slot in ENCODED_SLOTS
        },
        "character_bytes": ON_CHAIN_CHARACTER_BYTES,
        "gender_suffix_characters": list(GENDER_SUFFIX_CHARACTERS),
    }
    for _idx, slot, _table in DERIVED_SLOTS:
        py_trait["slots"][slot] = {
            "index": registry["slots"][slot]["index"],
            "bytes": registry["slots"][slot]["bytes"],
        }
    (ENGINE_DATA / "on_chain_trait_bytes.json").write_text(
        json.dumps(py_trait, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    shim = """// AUTO-GENERATED shim — do not edit. Source: scripts/compile_palette_registry.py
module.exports = require("./generated/on-chain-character-bytes");
"""
    (ART_PIPELINE / "on-chain-character-bytes.js").write_text(shim, encoding="utf-8")
