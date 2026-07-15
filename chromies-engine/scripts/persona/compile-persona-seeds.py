"""Persona Seed Compiler — Option C, layer 1 (deterministic seed).

Reads the canonical mint dataset (public/data/mint-data.json, read-only) and
persona-tables.json, and emits persona-seeds.json:

    tokenId -> {archetype, temperament, quirks[], mood, voiceId, seedHash}

No LLM calls, no randomness, no timestamps — output is byte-identical across
runs. Hard-fails (same discipline as legendary-finals injection) if any trait
value present in mint-data lacks a table entry.

Legendary tokens (the nine IDs from art-pipeline/legendary-token-ids.js,
mirrored in persona-tables.json) get {"legendary": true, "handAuthored": null}
and a deterministic voiceId only — no placeholder flavor is generated for them.

voiceId derivation:
    pool  = voicePool[gender(character)]            (gender from tables)
    index = keccak256(uint256_be(tokenId) ++ traitsBytes32) % len(pool)

seedHash = sha256 of the canonical JSON serialization of the seed object
(sorted keys, no whitespace, seedHash field excluded).

Usage:
    python compile-persona-seeds.py [--out PATH]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from Crypto.Hash import keccak

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent.parent  # chromies-engine/scripts/persona -> repo root
ENGINE_DATA = REPO_ROOT / "chromies-engine" / "engine_data"

MINT_DATA_PATH = REPO_ROOT / "public" / "data" / "mint-data.json"
TABLES_PATH = HERE / "persona-tables.json"
DEFAULT_OUT_PATH = HERE / "persona-seeds.json"

TRAITS_BYTES = 32

# traitsHex byte layout (mirrors bridge-mint-data.js TRAIT_SLOTS / mint_payload.py
# TRAIT_SLOT_SPECS; bytes 15/16 retired, 17/18 totalPixels, 22+ zero-padding).
SLOT_INDICES = {
    "character": 0,
    "palette": 1,
    "hood": 2,
    "shirt": 3,
    "body": 4,
    "bodytattoo": 5,
    "necklace": 6,
    "tattoo": 7,
    "mask": 8,
    "beard": 9,
    "mustache": 10,
    "eyes": 11,
    "earrings": 12,
    "glasses": 13,
    "hair": 14,
    "head_shape": 19,
    "hat": 20,
    "accessory": 21,
}


def hard_fail(message: str) -> None:
    print(f"HARD FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def load_json(path: Path):
    if not path.is_file():
        hard_fail(f"required input missing: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def build_reverse_tables():
    """byte -> value-name reverse maps from the compiled on-chain registries."""
    trait_reg = load_json(ENGINE_DATA / "on_chain_trait_bytes.json")
    palette_bytes = load_json(ENGINE_DATA / "on_chain_palette_bytes.json")

    reverse: dict[str, dict[int, str]] = {}
    reverse["character"] = {v: k for k, v in trait_reg["character_bytes"].items()}
    reverse["palette"] = {v: k for k, v in palette_bytes.items()}
    for slot, entry in trait_reg["slots"].items():
        reverse[slot] = {v: k for k, v in entry["bytes"].items()}
    return reverse


def decode_traits(token_id: int, traits_hex: str, reverse: dict[str, dict[int, str]]) -> dict[str, str]:
    cleaned = traits_hex.lower().removeprefix("0x")
    raw = bytes.fromhex(cleaned)
    if len(raw) != TRAITS_BYTES:
        hard_fail(f"token {token_id}: traitsHex is {len(raw)} bytes, expected {TRAITS_BYTES}")

    decoded: dict[str, str] = {}
    for slot, idx in SLOT_INDICES.items():
        byte_val = raw[idx]
        value = reverse[slot].get(byte_val)
        if value is None:
            hard_fail(f"token {token_id}: slot '{slot}' byte 0x{byte_val:02x} has no registry entry")
        decoded[slot] = value
    return decoded


def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def seed_hash(seed_obj: dict) -> str:
    payload = {k: v for k, v in seed_obj.items() if k != "seedHash"}
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def voice_id_for(token_id: int, traits_raw: bytes, character: str, tables: dict) -> str:
    gender = tables["characterVoiceGender"].get(character)
    if gender is None:
        hard_fail(f"token {token_id}: character '{character}' missing from characterVoiceGender table")
    pool = tables["voicePool"].get(gender)
    if not pool:
        hard_fail(f"token {token_id}: voicePool['{gender}'] is missing or empty")
    digest = keccak.new(digest_bits=256)
    digest.update(token_id.to_bytes(32, "big") + traits_raw)
    index = int.from_bytes(digest.digest(), "big") % len(pool)
    return pool[index]


def resolve_background(token_id: int, palette_name: str, palette_id: int, palette_colors: dict) -> str:
    entry = palette_colors["palettes"].get(str(palette_id))
    if entry is None:
        hard_fail(f"token {token_id}: palette id {palette_id} ({palette_name}) missing from palette_colors_expanded.json")
    return entry["colors"][0].lower()


def compile_seeds(out_path: Path) -> dict:
    tables = load_json(TABLES_PATH)
    mint_data = load_json(MINT_DATA_PATH)
    palette_colors = load_json(ENGINE_DATA / "palette_colors_expanded.json")
    reverse = build_reverse_tables()

    legendary_ids = set(tables["legendaryTokenIds"])
    quirk_slots = tables["quirkSlots"]

    seeds: dict[str, dict] = {}
    coverage: dict[str, set] = {"archetype": set(), "temperament": set(), "mood": set()}
    quirk_values_used: set = set()

    for record in sorted(mint_data, key=lambda r: int(r["tokenId"])):
        token_id = int(record["tokenId"])
        traits_hex = record["traitsHex"]
        traits_raw = bytes.fromhex(traits_hex.lower().removeprefix("0x"))
        decoded = decode_traits(token_id, traits_hex, reverse)

        character = decoded["character"]
        voice_id = voice_id_for(token_id, traits_raw, character, tables)

        if token_id in legendary_ids:
            seed = {
                "legendary": True,
                "handAuthored": None,
                "voiceId": voice_id,
            }
            seed["seedHash"] = seed_hash(seed)
            seeds[str(token_id)] = seed
            continue

        archetype = tables["archetypes"].get(character)
        if archetype is None:
            hard_fail(f"token {token_id}: character '{character}' has no archetypes entry")

        palette_name = decoded["palette"]
        family = tables["paletteFamilies"].get(palette_name)
        if family is None:
            hard_fail(f"token {token_id}: palette '{palette_name}' has no paletteFamilies entry")
        temperament = tables["temperaments"].get(family)
        if temperament is None:
            hard_fail(f"token {token_id}: palette family '{family}' has no temperaments entry")

        quirks: list[str] = []
        for slot in quirk_slots:
            value = decoded[slot]
            slot_table = tables["quirks"].get(slot)
            if slot_table is None:
                hard_fail(f"quirk slot '{slot}' missing from quirks tables")
            if value not in slot_table:
                hard_fail(f"token {token_id}: quirk slot '{slot}' value '{value}' has no quirks entry")
            quirk = slot_table[value]
            if quirk is not None:
                quirks.append(quirk)
                quirk_values_used.add((slot, value))

        background = resolve_background(
            token_id, palette_name, traits_raw[SLOT_INDICES["palette"]], palette_colors
        )
        mood = tables["moods"].get(background)
        if mood is None:
            hard_fail(f"token {token_id}: background '{background}' has no moods entry")

        seed = {
            "archetype": archetype,
            "temperament": temperament,
            "quirks": quirks,
            "mood": mood,
            "voiceId": voice_id,
        }
        seed["seedHash"] = seed_hash(seed)
        seeds[str(token_id)] = seed

        coverage["archetype"].add(character)
        coverage["temperament"].add(family)
        coverage["mood"].add(background)

    output = {
        "version": tables["version"],
        "source": {
            "mintData": "public/data/mint-data.json",
            "mintDataSha256": hashlib.sha256(MINT_DATA_PATH.read_bytes()).hexdigest(),
            "tables": "chromies-engine/scripts/persona/persona-tables.json",
            "tablesSha256": hashlib.sha256(TABLES_PATH.read_bytes()).hexdigest(),
        },
        "tokenCount": len(seeds),
        "legendaryCount": sum(1 for s in seeds.values() if s.get("legendary")),
        "seeds": seeds,
    }

    out_path.write_text(
        json.dumps(output, indent=2, sort_keys=False, ensure_ascii=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    print(f"wrote {out_path} ({len(seeds)} seeds, {output['legendaryCount']} legendary)")
    print(
        "coverage: "
        f"{len(coverage['archetype'])} archetypes, "
        f"{len(coverage['temperament'])} temperaments, "
        f"{len(quirk_values_used)} distinct quirk trait values, "
        f"{len(coverage['mood'])} moods"
    )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Compile deterministic persona seeds.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_PATH, help="output path for persona-seeds.json")
    args = parser.parse_args()
    compile_seeds(args.out)


if __name__ == "__main__":
    main()
