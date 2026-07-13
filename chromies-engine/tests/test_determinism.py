"""Determinism tests for art-derived compositor."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from engine.compositor import generate_chromie
from engine.generate_character import forge_identity, png_bytes
from engine.roll_traits import roll_identity_dna


def test_same_seed_same_png_hash() -> None:
    seed = 12345
    a = generate_chromie(seed, token_id=1)
    b = generate_chromie(seed, token_id=1)
    hash_a = hashlib.sha256(png_bytes(a.image_rgba)).hexdigest()
    hash_b = hashlib.sha256(png_bytes(b.image_rgba)).hexdigest()
    assert hash_a == hash_b


def test_same_seed_same_identity_dna() -> None:
    seed = 12345
    dna_a = roll_identity_dna(seed).model_dump()
    dna_b = roll_identity_dna(seed).model_dump()
    assert dna_a == dna_b


def test_same_seed_same_metadata_except_token_id() -> None:
    seed = 999
    _, meta_a, _, comp_a = forge_identity(seed, token_id=1)
    _, meta_b, _, comp_b = forge_identity(seed, token_id=2)

    block_a = meta_a.rarity["compositor"]
    block_b = meta_b.rarity["compositor"]
    assert block_a["traits"] == block_b["traits"]
    assert block_a["render_traits"] == block_b["render_traits"]
    assert block_a["palette"] == block_b["palette"]
    assert meta_a.identity.identity_dna == meta_b.identity.identity_dna
    assert comp_a.palette_key == comp_b.palette_key


def test_art_pipeline_mode_passes_sample_composite() -> None:
    from engine.validation_modes import ValidationMode

    seed = 12345
    _, metadata, routing, _ = forge_identity(seed, token_id=1, validation_mode=ValidationMode.ART_PIPELINE)
    assert metadata.validation.mode == "art_pipeline"
    assert metadata.validation.pixel.pass_ is True
    assert metadata.validation.palette.pass_ is True
    assert metadata.validation.silhouette.pass_ is True
    assert routing.hard_validation_pass is True
    assert routing.bucket in {"passed", "review"}


def test_js_rng_weighted_pick_deterministic() -> None:
    from engine.js_rng import mulberry32, seed_from_str, weighted_pick

    variants = [{"name": "A", "weight": 1}, {"name": "B", "weight": 99}]
    rng = mulberry32(seed_from_str("42:hood"))
    first = weighted_pick(variants, rng)
    rng = mulberry32(seed_from_str("42:hood"))
    second = weighted_pick(variants, rng)
    assert first["name"] == second["name"]
