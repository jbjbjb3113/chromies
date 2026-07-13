"""Tests for mint payload pack/unpack and payload-first preview."""

from __future__ import annotations

import hashlib

import numpy as np
import pytest

from engine.mint_payload import (
    PIXEL_COUNT,
    PIXELS_BYTES,
    TRAITS_BYTES,
    build_mint_payload,
    decode_traits,
    encode_traits,
    from_hex,
    pack_pixels,
    to_hex,
    unpack_pixels,
)
from engine.on_chain_palette import palette_colors
from engine.payload_parity import audit_all_palettes, compare_seed
from engine.palette_registry_data import load_on_chain_palette_bytes, load_palette_registry_meta
from engine.payload_pipeline import generate_chromie_payload
from engine.payload_render import render_from_payload


def test_pack_unpack_roundtrip_random_buffer() -> None:
    buf = np.arange(PIXEL_COUNT, dtype=np.uint8) % 16
    packed = pack_pixels(buf)
    assert len(packed) == PIXELS_BYTES
    restored = unpack_pixels(packed)
    assert np.array_equal(buf, restored)


def test_hex_roundtrip() -> None:
    buf = np.ones(PIXEL_COUNT, dtype=np.uint8) * 7
    buf[0] = 0
    packed = pack_pixels(buf)
    hex_str = to_hex(packed)
    assert hex_str.startswith("0x")
    assert np.array_equal(unpack_pixels(from_hex(hex_str)), buf)


def test_encode_traits_palette_byte() -> None:
    encoded = encode_traits(
        character={"name": "HeroA", "gender": "Male"},
        palette_key="SIGNAL_RED",
        render_picks={"hood": {"variant": {"name": "None"}}},
    )
    assert len(encoded.bytes) == TRAITS_BYTES
    assert encoded.bytes[1] == 8
    decoded = decode_traits(encoded.bytes)
    assert decoded.decoded["palette"]["value"] == "SIGNAL_RED"


def test_build_mint_payload_total_pixels() -> None:
    buf = np.zeros(PIXEL_COUNT, dtype=np.uint8)
    buf[10:20] = 3
    payload = build_mint_payload(
        buf,
        character={"name": "HeroA", "gender": "Male"},
        palette_key="SIGNAL",
        render_picks={},
    )
    assert payload.encoded_traits.total_pixels == 10
    assert len(payload.pixels_packed) == PIXELS_BYTES


def test_render_from_payload_uses_on_chain_palette() -> None:
    buf = np.zeros(PIXEL_COUNT, dtype=np.uint8)
    buf[100] = 8
    traits = bytearray(TRAITS_BYTES)
    traits[1] = 8  # SIGNAL_RED
    rgba = render_from_payload(pack_pixels(buf), bytes(traits))
    accent = palette_colors(8)[8]
    r, g, b, a = rgba[100 // 64, 100 % 64]
    assert a == 255
    assert (r, g, b) == (int(accent[1:3], 16), int(accent[3:5], 16), int(accent[5:7], 16))
    bg = palette_colors(8)[0]
    br, bg_g, bb = rgba[0, 0][:3]
    assert (br, bg_g, bb) == (0xE3, 0xE5, 0xE4)


def test_generate_chromie_payload_role_buffer_roundtrip() -> None:
    result = generate_chromie_payload(42, token_id=1)
    restored = result.payload.unpack_role_buffer()
    assert np.array_equal(result.role_buffer, restored)
    assert result.pixels_hex.startswith("0x")
    assert result.traits_hex.startswith("0x")
    assert result.image_rgba.shape == (64, 64, 4)


def test_payload_preview_deterministic() -> None:
    a = generate_chromie_payload(12345, token_id=1)
    b = generate_chromie_payload(12345, token_id=1)
    assert hashlib.sha256(a.image_rgba.tobytes()).hexdigest() == hashlib.sha256(
        b.image_rgba.tobytes()
    ).hexdigest()


def test_palette_audit_shirt_palettes_encodable() -> None:
    audit = audit_all_palettes()
    shirt = [e for e in audit.not_encodable if "_SHIRT_" in e.palette_key]
    assert shirt == []


def test_error_palette_id_unreachable_from_registry() -> None:
    meta = load_palette_registry_meta()
    assert meta["error_palette_id"] == 255
    byte_map = load_on_chain_palette_bytes()
    assert 255 not in byte_map.values()
    assert max(byte_map.values()) <= meta["max_valid_palette_id"]


def test_compare_seed_fixture() -> None:
    row = compare_seed(1, token_id=1)
    assert row.role_buffer_match is True
