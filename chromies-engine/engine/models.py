"""Pydantic models for trait vectors, validation, and metadata."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class HairTrait(BaseModel):
    style: str
    side: str = "L"


class ClothingTrait(BaseModel):
    torso: str
    overlayer: str | None = None


class ConflictRepair(BaseModel):
    conflict: list[str]
    resolved_to: str | None = None
    action: str = "fallback"


class TraitVector(BaseModel):
    """Visual appearance traits — rendered as PNG layers."""

    head_shape: str
    mask_type: str
    eyes: str
    hair: HairTrait
    forehead_mark: str
    mouth: str = "None"
    body_type: str
    clothing: ClothingTrait
    accessories: list[str] = Field(default_factory=list)
    drift_tier: str
    palette_family: str
    background: str


class IdentityDNA(BaseModel):
    """Non-visual identity traits — metadata only, never baked into the sprite."""

    temperament: str
    origin_signal: str
    alignment: str
    memory_affinity: str
    voice_profile: str
    embodiment_bias: str
    continuity_class: str


class IdentityLayers(BaseModel):
    """Visual appearance and identity DNA are separate layers of the same being."""

    layer_model: str = Field(
        default="appearance + identity_dna",
        description="Documents that appearance and DNA are independent layers from the same seed.",
    )
    note: str = (
        "Appearance is rendered visually. Identity DNA is metadata-only. "
        "Both are deterministically rolled from independent PRNG streams spawned by the forge seed."
    )
    appearance: TraitVector
    identity_dna: IdentityDNA


class PixelValidation(BaseModel):
    pass_: bool = Field(alias="pass")
    pixel_count: int = 0
    orphans: int = 0
    edge_touch: int = 0
    non_binary_alpha: int = 0
    thumbnail_retention: float = 0.0
    notes: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class PaletteValidation(BaseModel):
    pass_: bool = Field(alias="pass")
    distinct_colors: int = 0
    hues: int = 0
    out_of_palette: int = 0
    avg_saturation: float = 0.0
    notes: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class SilhouetteValidation(BaseModel):
    pass_: bool = Field(alias="pass")
    asymmetry_pct: float = 0.0
    defects: int = 0
    hair_centroid_offset_px: float = 0.0
    bbox_width: int = 0
    bbox_height: int = 0
    width_breaks: int = 0
    proportion_fit: float = 0.0
    mask_zone_pixels: int = 0
    mask_zone_breaks: int = 0
    mark_zone_pixels: int = 0
    notes: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class ValidationBlock(BaseModel):
    mode: str = "art_pipeline"
    pixel: PixelValidation
    palette: PaletteValidation
    silhouette: SilhouetteValidation


class IdentityStrength(BaseModel):
    silhouette_strength: int
    readability: int
    palette_harmony: int
    mask_clarity: int
    mark_visibility: int
    asymmetry_intentionality: int
    uniqueness_proxy: int
    chromie_presence: int
    total: int
    note: str = (
        "Identity Strength measures constitutional fit, not rarity or market value."
    )


class ReviewRouting(BaseModel):
    bucket: str
    reason: str | None = None
    reasons: list[str] = Field(default_factory=list)
    hard_validation_pass: bool
    hard_validation: dict[str, bool] = Field(default_factory=dict)
    identity_strength_total: int


class ReviewCard(BaseModel):
    token_id: int
    name: str
    seed: str
    bucket: str
    reason: str | None = None
    reasons: list[str] = Field(default_factory=list)
    hard_validation_pass: bool
    identity_strength_total: int
    validation: dict[str, bool]
    headline_traits: dict[str, str]
    identity_dna_headline: dict[str, str]
    weakest_scores: list[dict[str, str | int]] = Field(default_factory=list)
    image_sha256: str


class GenerationBlock(BaseModel):
    seed: str
    engine_version: str
    roll_order_version: int
    identity_dna_roll_order_version: int
    prng_streams: list[str] = Field(
        default_factory=lambda: ["appearance:PCG64(seed)", "identity_dna:PCG64(SeedSequence)"],
        description="Independent streams — appearance preserves legacy seed init; DNA uses a salted spawn.",
    )
    thresholds_version: int
    repairs: list[ConflictRepair] = Field(default_factory=list)


class SimilarityBlock(BaseModel):
    normies_max_iou: float | None = None
    normies_min_phash_hamming: int | None = None
    collection_min_phash_hamming: int | None = None
    nearest_collection_token: int | None = None
    verdict: str = "skipped"


class ProvenanceBlock(BaseModel):
    generated_at: str
    reviewed_by: str | None = None
    review_session: str | None = None
    status: str = "candidate"


class IdentityMetadata(BaseModel):
    schema_version: str
    token_id: int
    name: str
    image_sha256: str
    generation: GenerationBlock
    identity: IdentityLayers
    rarity: dict[str, Any] = Field(default_factory=dict)
    validation: ValidationBlock
    identity_strength: IdentityStrength
    review: ReviewRouting
    similarity: SimilarityBlock = Field(default_factory=SimilarityBlock)
    provenance: ProvenanceBlock
    attributes: list[dict[str, str]] = Field(default_factory=list)

    def trait_rarity_inputs(self) -> dict[str, Any]:
        t = self.identity.appearance
        return {
            "head_shape": t.head_shape,
            "mask_type": t.mask_type,
            "eyes": t.eyes,
            "hair": t.hair.style,
            "forehead_mark": t.forehead_mark,
            "body_type": t.body_type,
            "clothing_torso": t.clothing.torso,
            "drift_tier": t.drift_tier,
            "palette_family": t.palette_family,
        }


class MarketplaceMetadata(BaseModel):
    name: str
    description: str
    image: str
    attributes: list[dict[str, str]]
