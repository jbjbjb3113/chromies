"""Compare payload-first previews vs compositor direct renders."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from engine.art_schema_loader import ArtSchemaBundle, load_art_schema_bundle
from engine.mint_payload import ON_CHAIN_PALETTE_BYTES, palette_key_to_byte
from engine.on_chain_palette import normalize_hex_colors, palette_colors
from engine.payload_pipeline import PayloadGenerationResult, generate_chromie_payload


@dataclass
class SeedComparison:
    seed: int
    token_id: int
    palette_key: str
    palette_id: int
    encode_warnings: list[str]
    role_buffer_match: bool
    payload_preview_sha256: str
    compositor_preview_sha256: str
    previews_match: bool
    differing_pixels: int
    palette_roundtrip: str


@dataclass
class PaletteRoundtripEntry:
    palette_key: str
    encodable: bool
    encoded_byte: int | None
    encode_warnings: list[str]
    on_chain_palette_name: str
    pipeline_colors_match_on_chain: bool
    category: str
    notes: str


@dataclass
class PaletteAudit:
    entries: list[PaletteRoundtripEntry] = field(default_factory=list)

    @property
    def not_encodable(self) -> list[PaletteRoundtripEntry]:
        return [e for e in self.entries if e.category == "not_encodable"]

    @property
    def encodable_mismatch(self) -> list[PaletteRoundtripEntry]:
        return [e for e in self.entries if e.category == "encodable_mismatch"]

    @property
    def encodable_match(self) -> list[PaletteRoundtripEntry]:
        return [e for e in self.entries if e.category == "encodable_match"]


def _png_sha256(rgba: np.ndarray) -> str:
    return hashlib.sha256(rgba.tobytes()).hexdigest()


def _count_rgba_diff(a: np.ndarray, b: np.ndarray) -> int:
    if a.shape != b.shape:
        return a.size
    return int(np.sum(np.any(a != b, axis=-1)))


def classify_palette_roundtrip(palette_key: str, pipeline_colors: list[str]) -> PaletteRoundtripEntry:
    key = palette_key.upper()
    warnings: list[str] = []
    encodable = key in ON_CHAIN_PALETTE_BYTES
    encoded_byte: int | None = None
    if encodable:
        encoded_byte, warnings = palette_key_to_byte(key)
    else:
        encoded_byte, warnings = palette_key_to_byte(key)  # falls back to 0 with warning

    on_chain = normalize_hex_colors(palette_colors(encoded_byte or 0))
    pipeline = normalize_hex_colors(pipeline_colors)
    colors_match = on_chain == pipeline

    from engine.mint_payload import _BYTE_TO_PALETTE

    on_chain_name = _BYTE_TO_PALETTE.get(encoded_byte or 0, f"byte_{encoded_byte}")

    if not encodable:
        category = "not_encodable"
        notes = "No ON_CHAIN_PALETTE_BYTES entry; encoder falls back to byte 0 (SIGNAL)."
    elif colors_match:
        category = "encodable_match"
        notes = "Pipeline palette matches on-chain _paletteColors for encoded byte."
    else:
        category = "encodable_mismatch"
        notes = "Encoded byte maps to different on-chain colors than pipeline palette table."

    return PaletteRoundtripEntry(
        palette_key=key,
        encodable=encodable,
        encoded_byte=encoded_byte,
        encode_warnings=warnings,
        on_chain_palette_name=on_chain_name,
        pipeline_colors_match_on_chain=colors_match,
        category=category,
        notes=notes,
    )


def audit_all_palettes(schema: ArtSchemaBundle | None = None) -> PaletteAudit:
    schema = schema or load_art_schema_bundle()
    entries: list[PaletteRoundtripEntry] = []
    for name, palette_def in sorted(schema.palettes.items()):
        colors = palette_def.get("colors") or []
        entries.append(classify_palette_roundtrip(name, colors))
    return PaletteAudit(entries=entries)


def compare_seed(
    seed: int,
    token_id: int,
    schema: ArtSchemaBundle | None = None,
    batch: Any | None = None,
) -> SeedComparison:
    schema = schema or load_art_schema_bundle()
    result = generate_chromie_payload(seed, token_id, schema=schema, batch=batch)

    role_roundtrip = result.payload.unpack_role_buffer()
    role_match = bool(np.array_equal(result.role_buffer, role_roundtrip))

    payload_sha = _png_sha256(result.image_rgba)
    compositor_sha = _png_sha256(result.compositor_preview_rgba) if result.compositor_preview_rgba is not None else ""
    previews_match = payload_sha == compositor_sha if compositor_sha else False
    diff_px = 0
    if result.compositor_preview_rgba is not None:
        diff_px = _count_rgba_diff(result.image_rgba, result.compositor_preview_rgba)

    palette_entry = classify_palette_roundtrip(
        result.palette_key,
        schema.palettes[result.palette_key]["colors"],
    )

    return SeedComparison(
        seed=seed,
        token_id=token_id,
        palette_key=result.palette_key,
        palette_id=result.palette_id,
        encode_warnings=list(result.encode_warnings),
        role_buffer_match=role_match,
        payload_preview_sha256=payload_sha,
        compositor_preview_sha256=compositor_sha,
        previews_match=previews_match,
        differing_pixels=diff_px,
        palette_roundtrip=palette_entry.category,
    )


def compare_seeds(
    seeds: list[int],
    *,
    token_id: int = 1,
    schema: ArtSchemaBundle | None = None,
) -> list[SeedComparison]:
    return [compare_seed(seed, token_id, schema=schema) for seed in seeds]
