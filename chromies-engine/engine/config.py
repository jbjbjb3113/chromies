"""Paths, versions, and frozen roll order for the identity forge."""

from __future__ import annotations

from pathlib import Path

ENGINE_VERSION = "0.5.0"
SCHEMA_VERSION = "2.0.0"
ART_SCHEMA_VERSION = "2.0.0"
ROLL_ORDER_VERSION = 3
IDENTITY_DNA_ROLL_ORDER_VERSION = 1
THRESHOLDS_VERSION = 2

CANVAS_SIZE = 64
ALPHA_OPAQUE = 255
ALPHA_TRANSPARENT = 0

# Frozen trait roll order — changing this changes every output.
ROLL_ORDER: tuple[str, ...] = (
    "head_shape",
    "mask_type",
    "eyes",
    "hair",
    "forehead_mark",
    "body_type",
    "clothing_torso",
    "clothing_overlayer",
    "accessories",
    "drift_tier",
    "palette_family",
    "background",
    "mouth",
    "hair_side",
)

# Identity DNA roll order — independent stream, same seed, separate spawn.
IDENTITY_DNA_ROLL_ORDER: tuple[str, ...] = (
    "temperament",
    "origin_signal",
    "alignment",
    "memory_affinity",
    "voice_profile",
    "embodiment_bias",
    "continuity_class",
)

MOUTH_ALLOWED_MASKS = frozenset({"Openface"})

ROOT = Path(__file__).resolve().parent.parent
ENGINE_DATA_DIR = ROOT / "engine_data"
GENERATED_DIR = ROOT / "generated"
DERIVED_ASSETS_DIR = ROOT / "derived_assets"
REFERENCE_ONLY_DIR = ROOT / "reference_only"
TRAITS_DIR = ROOT / "traits"
PALETTES_DIR = ROOT / "palettes"
REFERENCE_DIR = ROOT / "reference"
CANDIDATES_DIR = ROOT / "candidates"
FINALS_DIR = ROOT / "finals"
SIMILARITY_DIR = ROOT / "similarity"
REPORTS_DIR = ROOT / "reports"

RARITY_PATH = TRAITS_DIR / "rarity.json"
IDENTITY_DNA_PATH = TRAITS_DIR / "identity_dna.json"
CONFLICTS_PATH = TRAITS_DIR / "conflicts.json"
PALETTE_RULES_PATH = PALETTES_DIR / "palette_rules.json"

LAYER_Z_ORDER: tuple[str, ...] = (
    "body",
    "clothing_torso",
    "head",
    "mask",
    "eyes",
    "mouth",
    "forehead_mark",
    "hair",
    "clothing_overlayer",
    "accessories",
)
