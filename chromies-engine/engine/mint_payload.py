"""Pack/unpack mint payloads — ports art-pipeline/bridge-mint-data.js."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from engine.batch_guards import character_key

GRID = 64
PIXEL_COUNT = GRID * GRID
PIXELS_BYTES = 2048
TRAITS_BYTES = 32

from engine.palette_registry_data import load_on_chain_palette_bytes
from engine.trait_registry_data import load_on_chain_character_bytes, load_trait_slot_tables

ON_CHAIN_CHARACTER_BYTES: dict[str, int] = load_on_chain_character_bytes()

ON_CHAIN_PALETTE_BYTES: dict[str, int] = load_on_chain_palette_bytes()

_SLOT_TABLES = load_trait_slot_tables()
HOOD_BYTES = _SLOT_TABLES["hood"]
SHIRT_BYTES = _SLOT_TABLES["shirt"]
BODY_BYTES = _SLOT_TABLES["body"]
BODYTATTOO_BYTES = _SLOT_TABLES["bodytattoo"]
NECKLACE_BYTES = _SLOT_TABLES["necklace"]
TATTOO_BYTES = _SLOT_TABLES["tattoo"]
MASK_BYTES = _SLOT_TABLES["mask"]
BEARD_BYTES = _SLOT_TABLES["beard"]
MUSTACHE_BYTES = _SLOT_TABLES["mustache"]
EYES_BYTES = _SLOT_TABLES["eyes"]
EARRINGS_BYTES = _SLOT_TABLES["earrings"]
GLASSES_BYTES = _SLOT_TABLES["glasses"]
HAIR_BYTES = _SLOT_TABLES["hair"]
HAT_BYTES = _SLOT_TABLES["hat"]
HEAD_SHAPE_BYTES = _SLOT_TABLES["head_shape"]

ANGULAR_HEAD_VARIANTS = {"Male_Angular", "Female_Angular"}


def derive_head_shape(head_variant_name: str | None) -> str:
    if not head_variant_name:
        return "None"
    if head_variant_name in ANGULAR_HEAD_VARIANTS:
        return "Angular"
    return "Classic"


TRAIT_SLOT_SPECS: tuple[dict[str, Any], ...] = (
    {"index": 0, "key": "character", "label": "Character", "table": ON_CHAIN_CHARACTER_BYTES, "source": "character"},
    {"index": 1, "key": "palette", "label": "Palette", "table": ON_CHAIN_PALETTE_BYTES, "source": "palette"},
    {"index": 2, "key": "hood", "label": "Hood", "table": HOOD_BYTES, "source": "pick"},
    {"index": 3, "key": "shirt", "label": "Shirt", "table": SHIRT_BYTES, "source": "pick"},
    {"index": 4, "key": "body", "label": "Body", "table": BODY_BYTES, "source": "pick"},
    {"index": 5, "key": "bodytattoo", "label": "Bodytattoo", "table": BODYTATTOO_BYTES, "source": "pick"},
    {"index": 6, "key": "necklace", "label": "Necklace", "table": NECKLACE_BYTES, "source": "pick"},
    {"index": 7, "key": "tattoo", "label": "Tattoo", "table": TATTOO_BYTES, "source": "pick"},
    {"index": 8, "key": "mask", "label": "Mask", "table": MASK_BYTES, "source": "pick"},
    {"index": 9, "key": "beard", "label": "Beard", "table": BEARD_BYTES, "source": "pick"},
    {"index": 10, "key": "mustache", "label": "Mustache", "table": MUSTACHE_BYTES, "source": "pick"},
    {"index": 11, "key": "eyes", "label": "Eyes", "table": EYES_BYTES, "source": "pick"},
    {"index": 12, "key": "earrings", "label": "Earrings", "table": EARRINGS_BYTES, "source": "pick"},
    {"index": 13, "key": "glasses", "label": "Glasses", "table": GLASSES_BYTES, "source": "pick"},
    {"index": 14, "key": "hair", "label": "Hair", "table": HAIR_BYTES, "source": "pick"},
    {"index": 15, "key": "mutation", "label": "Mutation", "source": "retired"},
    {"index": 16, "key": "drift", "label": "Drift", "source": "retired"},
    # HEAD_SHAPE is not a compositing slot — derived from the "head" pick's variant name.
    {"index": 19, "key": "head_shape", "label": "HeadShape", "table": HEAD_SHAPE_BYTES, "source": "head_shape_derived"},
    {"index": 20, "key": "hat", "label": "Hat", "table": HAT_BYTES, "source": "pick"},
)

# Reverse maps for decode (first name wins on collision).
_BYTE_TO_PALETTE: dict[int, str] = {}
for _name, _byte in ON_CHAIN_PALETTE_BYTES.items():
    _BYTE_TO_PALETTE.setdefault(_byte, _name)


@dataclass
class EncodedTraits:
    bytes: bytes
    decoded: dict[str, dict[str, Any]]
    warnings: list[str] = field(default_factory=list)

    @property
    def palette_id(self) -> int:
        return self.bytes[1]

    @property
    def total_pixels(self) -> int:
        return (self.bytes[17] << 8) | self.bytes[18]


@dataclass
class MintPayload:
    pixels_packed: bytes
    traits_packed: bytes
    pixels_hex: str
    traits_hex: str
    role_buffer: np.ndarray
    encoded_traits: EncodedTraits

    def unpack_role_buffer(self) -> np.ndarray:
        return unpack_pixels(self.pixels_packed)


def _pick_variant_name(picks: dict[str, dict[str, Any]], slot: str, fallback: str = "None") -> str:
    pick = picks.get(slot)
    if not pick:
        return fallback
    return str(pick.get("variant", {}).get("name", fallback))


def lookup_byte(table: dict[str, int], value: str | None, context: str, warnings: list[str]) -> int:
    if value is None:
        warnings.append(f"{context}: missing value")
        return 0
    if value not in table:
        warnings.append(f'{context}: unknown value "{value}"')
        return 0
    return table[value]


def count_non_zero_nibbles(packed: bytes) -> int:
    count = 0
    for i in range(PIXEL_COUNT):
        byte_index = i >> 1
        nibble = (packed[byte_index] >> 4) & 0x0F if (i & 1) == 0 else packed[byte_index] & 0x0F
        if nibble != 0:
            count += 1
    return count


def pack_pixels(role_buffer: np.ndarray) -> bytes:
    buf = np.asarray(role_buffer, dtype=np.uint8).reshape(-1)
    if buf.size != PIXEL_COUNT:
        raise ValueError(f"expected {PIXEL_COUNT} pixel indices, got {buf.size}")
    packed = bytearray(PIXELS_BYTES)
    for i in range(PIXEL_COUNT):
        val = int(buf[i]) & 0x0F
        byte_index = i >> 1
        if (i & 1) == 0:
            packed[byte_index] = (val << 4) | (packed[byte_index] & 0x0F)
        else:
            packed[byte_index] = (packed[byte_index] & 0xF0) | val
    return bytes(packed)


def unpack_pixels(packed: bytes | bytearray) -> np.ndarray:
    raw = bytes(packed)
    if len(raw) != PIXELS_BYTES:
        raise ValueError(f"expected {PIXELS_BYTES} packed bytes, got {len(raw)}")
    out = np.zeros(PIXEL_COUNT, dtype=np.uint8)
    for i in range(PIXEL_COUNT):
        byte_index = i >> 1
        if (i & 1) == 0:
            out[i] = (raw[byte_index] >> 4) & 0x0F
        else:
            out[i] = raw[byte_index] & 0x0F
    return out


def unpack_pixels_hex(hex_str: str) -> np.ndarray:
    return unpack_pixels(from_hex(hex_str))


def from_hex(hex_str: str) -> bytes:
    cleaned = hex_str.lower().removeprefix("0x")
    return bytes.fromhex(cleaned)


def to_hex(data: bytes, *, with_prefix: bool = True) -> str:
    hex_str = data.hex()
    return f"0x{hex_str}" if with_prefix else hex_str


def pack_total_pixels(trait_bytes: bytearray, count: int) -> None:
    if count > 4096:
        raise ValueError(f"totalPixels {count} exceeds uint16 max 4096")
    trait_bytes[17] = (count >> 8) & 0xFF
    trait_bytes[18] = count & 0xFF


def encode_traits(
    *,
    character: dict[str, Any],
    palette_key: str,
    render_picks: dict[str, dict[str, Any]],
) -> EncodedTraits:
    warnings: list[str] = []
    trait_bytes = bytearray(TRAITS_BYTES)
    decoded: dict[str, dict[str, Any]] = {}

    for slot in TRAIT_SLOT_SPECS:
        idx = slot["index"]
        if slot["source"] == "retired":
            trait_bytes[idx] = 0
            decoded[slot["key"]] = {"value": "Retired/Unused", "byte": 0}
            continue

        if slot["source"] == "character":
            raw = character_key(character)
        elif slot["source"] == "palette":
            raw = str(palette_key or "SIGNAL").upper()
        elif slot["source"] == "head_shape_derived":
            raw = derive_head_shape(_pick_variant_name(render_picks, "head"))
        else:
            raw = _pick_variant_name(render_picks, slot["key"])

        table = slot["table"]
        byte_val = lookup_byte(table, raw, f'{slot["label"]} [{idx}]', warnings)
        trait_bytes[idx] = byte_val
        decoded[slot["key"]] = {"value": raw, "byte": byte_val}

    return EncodedTraits(bytes=bytes(trait_bytes), decoded=decoded, warnings=warnings)


def decode_traits(trait_bytes: bytes | bytearray) -> EncodedTraits:
    raw = bytes(trait_bytes)
    if len(raw) != TRAITS_BYTES:
        raise ValueError(f"expected {TRAITS_BYTES} trait bytes, got {len(raw)}")

    decoded: dict[str, dict[str, Any]] = {}
    for slot in TRAIT_SLOT_SPECS:
        idx = slot["index"]
        byte_val = raw[idx]
        if slot["source"] == "retired":
            decoded[slot["key"]] = {"value": "Retired/Unused", "byte": byte_val}
            continue
        if slot["source"] == "palette":
            decoded[slot["key"]] = {
                "value": _BYTE_TO_PALETTE.get(byte_val, f"UNKNOWN_{byte_val}"),
                "byte": byte_val,
            }
            continue
        table = slot.get("table") or {}
        reverse = {v: k for k, v in table.items()}
        decoded[slot["key"]] = {"value": reverse.get(byte_val, f"UNKNOWN_{byte_val}"), "byte": byte_val}

    return EncodedTraits(bytes=raw, decoded=decoded, warnings=[])


def build_mint_payload(
    role_buffer: np.ndarray,
    *,
    character: dict[str, Any],
    palette_key: str,
    render_picks: dict[str, dict[str, Any]],
) -> MintPayload:
    pixels_packed = pack_pixels(role_buffer)
    encoded = encode_traits(character=character, palette_key=palette_key, render_picks=render_picks)
    trait_bytes = bytearray(encoded.bytes)
    pack_total_pixels(trait_bytes, count_non_zero_nibbles(pixels_packed))
    traits_packed = bytes(trait_bytes)
    encoded = EncodedTraits(bytes=traits_packed, decoded=encoded.decoded, warnings=encoded.warnings)

    return MintPayload(
        pixels_packed=pixels_packed,
        traits_packed=traits_packed,
        pixels_hex=to_hex(pixels_packed),
        traits_hex=to_hex(traits_packed),
        role_buffer=np.asarray(role_buffer, dtype=np.uint8).copy(),
        encoded_traits=encoded,
    )


def palette_key_to_byte(palette_key: str) -> tuple[int, list[str]]:
    key = str(palette_key or "SIGNAL").upper()
    warnings: list[str] = []
    byte_val = lookup_byte(ON_CHAIN_PALETTE_BYTES, key, f"Palette [1]", warnings)
    return byte_val, warnings
