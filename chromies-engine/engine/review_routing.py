"""Automatic review bucket routing for forged Chromies."""

from __future__ import annotations

from engine.models import (
    IdentityMetadata,
    IdentityStrength,
    PaletteValidation,
    PixelValidation,
    ReviewCard,
    ReviewRouting,
    SilhouetteValidation,
)
from engine.validation_modes import ValidationMode, mode_thresholds

REASON_PASSED = "PASSED"
REASON_STRENGTH_REVIEW = "IDENTITY_STRENGTH_REVIEW"
REASON_STRENGTH_LOW = "IDENTITY_STRENGTH_LOW"
REASON_VALIDATION_PIXEL = "VALIDATION_PIXEL_FAILED"
REASON_VALIDATION_PALETTE = "VALIDATION_PALETTE_FAILED"
REASON_VALIDATION_SILHOUETTE = "VALIDATION_SILHOUETTE_FAILED"

STRENGTH_SUBSCORE_FIELDS = (
    "silhouette_strength",
    "readability",
    "palette_harmony",
    "mask_clarity",
    "mark_visibility",
    "asymmetry_intentionality",
    "uniqueness_proxy",
    "chromie_presence",
)

# Absolute floor — below this is rejected even when hard validation passes
STRENGTH_REJECT_FLOOR_BY_MODE = {
    ValidationMode.LENIENT: 40,
    ValidationMode.ART_PIPELINE: 45,
    ValidationMode.STRICT: 55,
}


def collect_hard_validation_failures(
    pixel: PixelValidation,
    palette: PaletteValidation,
    silhouette: SilhouetteValidation,
    *,
    mode: ValidationMode = ValidationMode.ART_PIPELINE,
    side_profile: bool = False,
) -> tuple[list[str], dict[str, bool]]:
    hard_validation = {
        "pixel": pixel.pass_,
        "palette": palette.pass_,
        "silhouette": silhouette.pass_,
    }
    failures: list[str] = []
    thresholds = mode_thresholds(mode)
    sil_key = "side_profile" if side_profile else "silhouette"
    sil_t = thresholds[sil_key]

    if not pixel.pass_:
        parts = [REASON_VALIDATION_PIXEL]
        if pixel.orphans:
            parts.append(f"{pixel.orphans} orphan pixel(s)")
        if pixel.non_binary_alpha:
            parts.append(f"{pixel.non_binary_alpha} non-binary alpha value(s)")
        if pixel.edge_touch and thresholds["pixel"].get("fail_on_edge_touch"):
            parts.append(f"{pixel.edge_touch} edge-touch pixel(s)")
        failures.append(": ".join(parts))

    if not palette.pass_:
        parts = [REASON_VALIDATION_PALETTE]
        if palette.out_of_palette:
            parts.append(f"{palette.out_of_palette} out-of-palette pixel(s)")
        if palette.hues < thresholds["palette"]["min_distinct_hues"]:
            parts.append(
                f"{palette.hues} distinct hues (need >= {thresholds['palette']['min_distinct_hues']})"
            )
        if palette.distinct_colors > thresholds["palette"]["max_distinct_colors"]:
            parts.append(
                f"{palette.distinct_colors} distinct colors (max {thresholds['palette']['max_distinct_colors']})"
            )
        failures.append(": ".join(parts))

    if not silhouette.pass_:
        parts = [REASON_VALIDATION_SILHOUETTE]
        if silhouette.bbox_width < sil_t["min_bbox_width"] or silhouette.bbox_width > sil_t["max_bbox_width"]:
            parts.append(
                f"bbox width {silhouette.bbox_width}px "
                f"(target {sil_t['min_bbox_width']}-{sil_t['max_bbox_width']})"
            )
        if silhouette.bbox_height < sil_t["min_bbox_height"] or silhouette.bbox_height > sil_t["max_bbox_height"]:
            parts.append(
                f"bbox height {silhouette.bbox_height}px "
                f"(target {sil_t['min_bbox_height']}-{sil_t['max_bbox_height']})"
            )
        if silhouette.asymmetry_pct < sil_t["min_asymmetry_pct"]:
            parts.append(
                f"asymmetry {silhouette.asymmetry_pct}% (target >= {sil_t['min_asymmetry_pct']}%)"
            )
        if silhouette.defects < sil_t["min_defects"]:
            parts.append(f"defects {silhouette.defects} (target >= {sil_t['min_defects']})")
        if sil_t.get("require_width_breaks") and silhouette.width_breaks < 1:
            parts.append("no silhouette width breaks")
        failures.append(": ".join(parts))

    return failures, hard_validation


def collect_strength_review_triggers(
    strength: IdentityStrength,
    pixel: PixelValidation,
    silhouette: SilhouetteValidation,
    *,
    side_profile: bool = False,
    hard_validation: dict[str, bool] | None = None,
) -> list[str]:
    """Return human-review triggers — separate from total score and rarity."""
    triggers: list[str] = []
    hard_validation = hard_validation or {}
    silhouette_ok = hard_validation.get("silhouette", silhouette.pass_)
    pixel_ok = hard_validation.get("pixel", pixel.pass_)

    # Severe subscore failures only — not normal art-pipeline silhouette/proportion noise
    severe_floor = 40
    for field in ("readability", "chromie_presence", "palette_harmony"):
        value = getattr(strength, field)
        min_score = 50 if field == "readability" else 45
        if value < min_score:
            triggers.append(f"{field} {value} below review threshold {min_score}")

    if not silhouette_ok and strength.silhouette_strength < severe_floor:
        triggers.append(
            f"silhouette_strength {strength.silhouette_strength} below {severe_floor} "
            "with failed silhouette validation"
        )

    if not side_profile:
        if (
            strength.asymmetry_intentionality < 40
            and silhouette.asymmetry_pct < 4.0
            and silhouette.hair_centroid_offset_px < 0.5
        ):
            triggers.append(
                "front-facing symmetry with near-zero hair offset — verify intentional flat design"
            )

    if not pixel_ok and pixel.orphans >= 1:
        triggers.append(f"{pixel.orphans} orphan pixel(s) with failed pixel validation")

    if pixel_ok and pixel.orphans >= 3:
        triggers.append(f"{pixel.orphans} orphan pixel(s) warrant human review")

    if pixel.thumbnail_retention < 0.45:
        triggers.append(
            f"thumbnail retention {pixel.thumbnail_retention:.2f} below 0.45 — check legibility at small size"
        )

    severe_weak = sum(1 for field in STRENGTH_SUBSCORE_FIELDS if getattr(strength, field) < 45)
    if severe_weak >= 2:
        triggers.append(f"{severe_weak} identity subscores below 45")

    return triggers


def route_review_bucket(
    *,
    hard_validation_pass: bool,
    validation_failures: list[str],
    hard_validation: dict[str, bool],
    identity_strength_total: int,
    strength: IdentityStrength | None = None,
    pixel: PixelValidation | None = None,
    silhouette: SilhouetteValidation | None = None,
    side_profile: bool = False,
    mode: ValidationMode = ValidationMode.ART_PIPELINE,
) -> ReviewRouting:
    reject_floor = STRENGTH_REJECT_FLOOR_BY_MODE.get(mode, 45)

    if not hard_validation_pass:
        return ReviewRouting(
            bucket="rejected",
            reason=validation_failures[0].split(":")[0] if validation_failures else REASON_VALIDATION_PIXEL,
            reasons=validation_failures,
            hard_validation_pass=False,
            hard_validation=hard_validation,
            identity_strength_total=identity_strength_total,
        )

    review_triggers: list[str] = []
    if strength is not None and pixel is not None and silhouette is not None:
        review_triggers = collect_strength_review_triggers(
            strength,
            pixel,
            silhouette,
            side_profile=side_profile,
            hard_validation=hard_validation,
        )

    if review_triggers:
        return ReviewRouting(
            bucket="review",
            reason=REASON_STRENGTH_REVIEW,
            reasons=review_triggers,
            hard_validation_pass=True,
            hard_validation=hard_validation,
            identity_strength_total=identity_strength_total,
        )

    if identity_strength_total < reject_floor:
        detail = (
            f"Identity Strength total {identity_strength_total} "
            f"(below reject floor {reject_floor})"
        )
        return ReviewRouting(
            bucket="rejected",
            reason=REASON_STRENGTH_LOW,
            reasons=[detail],
            hard_validation_pass=True,
            hard_validation=hard_validation,
            identity_strength_total=identity_strength_total,
        )

    return ReviewRouting(
        bucket="passed",
        reason=REASON_PASSED,
        reasons=[],
        hard_validation_pass=True,
        hard_validation=hard_validation,
        identity_strength_total=identity_strength_total,
    )


def _weakest_strength_scores(strength: IdentityStrength, limit: int = 3) -> list[dict[str, int]]:
    scored = [(field, getattr(strength, field)) for field in STRENGTH_SUBSCORE_FIELDS]
    scored.sort(key=lambda item: item[1])
    return [{"metric": name, "score": value} for name, value in scored[:limit]]


def build_review_card(metadata: IdentityMetadata, routing: ReviewRouting) -> ReviewCard:
    appearance = metadata.identity.appearance
    return ReviewCard(
        token_id=metadata.token_id,
        name=metadata.name,
        seed=metadata.generation.seed,
        bucket=routing.bucket,
        reason=routing.reason,
        reasons=routing.reasons,
        hard_validation_pass=routing.hard_validation_pass,
        identity_strength_total=routing.identity_strength_total,
        validation={
            "pixel": routing.hard_validation.get("pixel", False),
            "palette": routing.hard_validation.get("palette", False),
            "silhouette": routing.hard_validation.get("silhouette", False),
        },
        headline_traits={
            "head_shape": appearance.head_shape,
            "mask_type": appearance.mask_type,
            "forehead_mark": appearance.forehead_mark,
            "palette_family": appearance.palette_family,
            "drift_tier": appearance.drift_tier,
        },
        identity_dna_headline={
            "temperament": metadata.identity.identity_dna.temperament,
            "alignment": metadata.identity.identity_dna.alignment,
            "continuity_class": metadata.identity.identity_dna.continuity_class,
        },
        weakest_scores=_weakest_strength_scores(metadata.identity_strength),
        image_sha256=metadata.image_sha256,
    )
