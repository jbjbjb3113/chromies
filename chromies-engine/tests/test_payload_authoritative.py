"""Payload preview is authoritative for load-bearing generation."""

from __future__ import annotations

import numpy as np

from engine.generate_character import forge_identity
from engine.payload_pipeline import build_payload_from_compositor
from engine.art_schema_loader import load_art_schema_bundle
from engine.compositor import generate_chromie


def test_forge_identity_image_matches_payload_preview() -> None:
    schema = load_art_schema_bundle()
    compositor = generate_chromie(4242, token_id=7, schema=schema)
    expected = build_payload_from_compositor(compositor, schema).image_rgba
    image, _, _, _ = forge_identity(4242, token_id=7)
    assert np.array_equal(image, expected)
