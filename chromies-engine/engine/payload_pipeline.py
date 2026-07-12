"""Payload-first Chromie generation: traits → role buffer → pack → decoded preview."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from engine.art_schema_loader import ArtSchemaBundle, load_art_schema_bundle
from engine.compositor import CompositorResult, composite_chromie, generate_chromie
from engine.mint_payload import MintPayload, build_mint_payload
from engine.payload_render import render_from_payload


@dataclass
class PayloadGenerationResult:
    """Canonical output — preview is always from decoded inscription payload."""

    seed: int
    token_id: int
    character: dict[str, Any]
    palette_key: str
    picks: dict[str, dict[str, Any]]
    render_picks: dict[str, dict[str, Any]]
    role_buffer: np.ndarray
    payload: MintPayload
    image_rgba: np.ndarray
    encode_warnings: list[str] = field(default_factory=list)
    batch_guard: dict[str, Any] = field(default_factory=dict)

    # Reference-only: direct compositor palette render (not authoritative).
    compositor_preview_rgba: np.ndarray | None = None

    @property
    def pixels_hex(self) -> str:
        return self.payload.pixels_hex

    @property
    def traits_hex(self) -> str:
        return self.payload.traits_hex

    @property
    def palette_id(self) -> int:
        return self.payload.encoded_traits.palette_id


def build_payload_from_compositor(
    result: CompositorResult,
    schema: ArtSchemaBundle | None = None,
) -> PayloadGenerationResult:
    """Build mint payload + decoded preview from an existing compositor result."""
    schema = schema or load_art_schema_bundle()
    role_buffer = composite_chromie(result.render_picks, schema)
    payload = build_mint_payload(
        role_buffer,
        character=result.character,
        palette_key=result.palette_key,
        render_picks=result.render_picks,
    )
    preview = render_from_payload(payload.pixels_packed, payload.traits_packed, grid=schema.grid)

    return PayloadGenerationResult(
        seed=result.seed,
        token_id=result.token_id,
        character=result.character,
        palette_key=result.palette_key,
        picks=result.picks,
        render_picks=result.render_picks,
        role_buffer=role_buffer,
        payload=payload,
        image_rgba=preview,
        encode_warnings=list(payload.encoded_traits.warnings),
        batch_guard=result.batch_guard,
        compositor_preview_rgba=result.image_rgba,
    )


def generate_chromie_payload(
    seed: int,
    token_id: int,
    schema: ArtSchemaBundle | None = None,
    batch: Any | None = None,
) -> PayloadGenerationResult:
    """
    Full payload-first pipeline:
      traits → role-index buffer → pixelsHex + traitsHex → decoded preview PNG
    """
    schema = schema or load_art_schema_bundle()
    compositor = generate_chromie(seed, token_id, schema=schema, batch=batch)
    return build_payload_from_compositor(compositor, schema)
