"""Deterministic Identity Strength scoring (constitutional quality, not rarity)."""

from __future__ import annotations

from engine.models import (
    ConflictRepair,
    IdentityStrength,
    PaletteValidation,
    PixelValidation,
    SilhouetteValidation,
    TraitVector,
)

IDENTITY_STRENGTH_NOTE = (
    "Identity Strength measures constitutional fit, not rarity or market value."
)

# Weights sum to 1.0 — front-facing render pipeline
SCORE_WEIGHTS: dict[str, float] = {
    "silhouette_strength": 0.15,
    "readability": 0.12,
    "palette_harmony": 0.12,
    "mask_clarity": 0.13,
    "mark_visibility": 0.15,
    "asymmetry_intentionality": 0.13,
    "uniqueness_proxy": 0.10,
    "chromie_presence": 0.10,
}

# Side-profile: de-emphasize front-facing asymmetry / mask / mark assumptions
SCORE_WEIGHTS_SIDE_PROFILE: dict[str, float] = {
    "silhouette_strength": 0.22,
    "readability": 0.18,
    "palette_harmony": 0.14,
    "mask_clarity": 0.08,
    "mark_visibility": 0.08,
    "asymmetry_intentionality": 0.06,
    "uniqueness_proxy": 0.12,
    "chromie_presence": 0.12,
}

SIGNATURE_TRAITS = frozenset(
    {
        "Split",
        "Phantom",
        "Void",
        "Prism",
        "Anomaly",
        "Fractured",
        "Bald + scalp mark",
        "Warped",
    }
)


def clamp_score(value: float) -> int:
    return int(round(max(0.0, min(100.0, value))))


def score_silhouette_strength(silhouette: SilhouetteValidation) -> int:
    defects = silhouette.defects
    if 3 <= defects <= 7:
        defect_score = 100.0
    elif 1 <= defects <= 2 or defects == 8:
        defect_score = 70.0
    else:
        defect_score = 35.0

    proportion = silhouette.proportion_fit * 100.0
    breaks = min(silhouette.width_breaks, 5) / 5.0 * 100.0
    bbox_bonus = 100.0 if silhouette.pass_ else 55.0
    if silhouette.bbox_width == 64 and silhouette.bbox_height == 64:
        bbox_bonus = max(bbox_bonus, 90.0)

    return clamp_score(defect_score * 0.35 + proportion * 0.25 + breaks * 0.2 + bbox_bonus * 0.2)


def score_readability(pixel: PixelValidation, silhouette: SilhouetteValidation) -> int:
    orphan_penalty = min(pixel.orphans * 20, 80)
    edge_penalty = min(pixel.edge_touch * 2, 20)
    alpha_penalty = min(pixel.non_binary_alpha * 25, 80)

    count = pixel.pixel_count
    if count >= 3500:
        density = 100.0
    elif 1200 <= count <= 2800:
        density = 100.0
    elif 800 <= count < 1200 or 2800 < count <= 3200:
        density = 75.0
    elif count >= 400:
        density = 55.0
    else:
        density = 25.0

    thumb = pixel.thumbnail_retention * 100.0
    proportion = silhouette.proportion_fit * 100.0

    raw = density * 0.35 + thumb * 0.25 + proportion * 0.2 + 100.0 * 0.2
    return clamp_score(raw - orphan_penalty * 0.4 - edge_penalty * 0.3 - alpha_penalty * 0.3)


def score_palette_harmony(palette: PaletteValidation) -> int:
    compliance = 100.0 if palette.out_of_palette == 0 else max(0.0, 100.0 - palette.out_of_palette * 2)
    distinct = palette.distinct_colors
    if 8 <= distinct <= 14:
        color_use = 100.0
    elif 5 <= distinct <= 15:
        color_use = 75.0
    else:
        color_use = 45.0

    hues = palette.hues
    if hues >= 3:
        hue_score = 100.0
    elif hues == 2:
        hue_score = 65.0
    else:
        hue_score = 30.0

    saturation = min(palette.avg_saturation / 0.55, 1.0) * 100.0
    return clamp_score(compliance * 0.35 + color_use * 0.25 + hue_score * 0.25 + saturation * 0.15)


def score_mask_clarity(
    silhouette: SilhouetteValidation,
    *,
    mask_gated: bool = False,
) -> int:
    if mask_gated:
        return 75
    zone_fill = min(silhouette.mask_zone_pixels / 80.0, 1.0) * 100.0
    breaks = min(silhouette.mask_zone_breaks, 4) / 4.0 * 100.0
    seam = 100.0 if silhouette.width_breaks >= 1 else 40.0
    return clamp_score(zone_fill * 0.4 + breaks * 0.35 + seam * 0.25)


def score_mark_visibility(
    silhouette: SilhouetteValidation,
    pixel: PixelValidation,
    *,
    forehead_mark_gated: bool = False,
) -> int:
    if forehead_mark_gated:
        return 75
    mark_px = silhouette.mark_zone_pixels
    if mark_px >= 8:
        count_score = 100.0
    elif mark_px >= 3:
        count_score = 85.0
    elif mark_px >= 1:
        count_score = 50.0
    else:
        count_score = 10.0

    clear = 100.0 if pixel.orphans == 0 else 60.0
    return clamp_score(count_score * 0.8 + clear * 0.2)


def score_asymmetry_intentionality(
    silhouette: SilhouetteValidation,
    *,
    side_profile: bool = False,
) -> int:
    asym = silhouette.asymmetry_pct
    if side_profile:
        if 5.0 <= asym <= 40.0:
            asym_score = 100.0
        elif 3.0 <= asym < 5.0 or 40.0 < asym <= 50.0:
            asym_score = 80.0
        else:
            asym_score = 55.0

        hair_offset = silhouette.hair_centroid_offset_px
        if hair_offset >= 1.0:
            hair_score = 100.0
        elif hair_offset > 0:
            hair_score = 80.0
        else:
            hair_score = 70.0
    else:
        if 8.0 <= asym <= 28.0:
            asym_score = 100.0
        elif 5.0 <= asym < 8.0 or 28.0 < asym <= 35.0:
            asym_score = 70.0
        elif asym < 5.0:
            asym_score = 65.0
        else:
            asym_score = 45.0

        hair_offset = silhouette.hair_centroid_offset_px
        if hair_offset >= 3.0:
            hair_score = 100.0
        elif hair_offset >= 1.5:
            hair_score = 65.0
        elif hair_offset > 0:
            hair_score = 40.0
        else:
            hair_score = 25.0

    return clamp_score(asym_score * 0.65 + hair_score * 0.35)


def score_uniqueness_proxy(
    appearance: TraitVector,
    repairs: list[ConflictRepair],
) -> int:
    score = 45.0

    score += min(len(appearance.accessories) * 6, 12)
    if appearance.clothing.overlayer:
        score += 6
    if appearance.drift_tier != "Stable":
        score += 8
    if appearance.mouth != "None":
        score += 4

    trait_values = {
        appearance.head_shape,
        appearance.mask_type,
        appearance.eyes,
        appearance.hair.style,
        appearance.forehead_mark,
        appearance.body_type,
        appearance.clothing.torso,
        appearance.drift_tier,
    }
    score += min(len(trait_values) * 1.5, 12)

    for value in trait_values:
        if value in SIGNATURE_TRAITS:
            score += 5

    score -= min(len(repairs) * 8, 24)
    return clamp_score(score)


def score_chromie_presence(
    appearance: TraitVector,
    pixel: PixelValidation,
    palette: PaletteValidation,
    silhouette: SilhouetteValidation,
    *,
    forehead_mark_gated: bool = True,
    mask_gated: bool = True,
) -> int:
    checks: list[float] = []

    if forehead_mark_gated:
        checks.append(75.0)
    else:
        checks.append(100.0 if silhouette.mark_zone_pixels >= 3 else 0.0)

    if mask_gated:
        checks.append(75.0)
    else:
        checks.append(100.0 if silhouette.mask_zone_pixels >= 20 else 40.0)
    checks.append(100.0 if silhouette.asymmetry_pct >= 8.0 else 30.0)
    checks.append(100.0 if palette.hues >= 2 else 20.0)
    checks.append(100.0 if pixel.orphans == 0 and pixel.non_binary_alpha == 0 else 0.0)
    checks.append(
        100.0
        if appearance.hair.style != "Bald + scalp mark" or appearance.forehead_mark in {"Burn", "Prism"}
        else 70.0
    )
    checks.append(100.0 if appearance.forehead_mark and appearance.forehead_mark != "None" else 70.0)
    checks.append(100.0 if silhouette.pass_ or silhouette.proportion_fit >= 0.5 else 40.0)

    return clamp_score(sum(checks) / len(checks))


def active_score_weights(*, side_profile: bool = False) -> dict[str, float]:
    return SCORE_WEIGHTS_SIDE_PROFILE if side_profile else SCORE_WEIGHTS


def compute_total(scores: dict[str, int], *, side_profile: bool = False) -> int:
    weights = active_score_weights(side_profile=side_profile)
    weighted = sum(scores[key] * weights[key] for key in weights)
    return clamp_score(weighted)


def score_identity_strength(
    appearance: TraitVector,
    pixel: PixelValidation,
    palette: PaletteValidation,
    silhouette: SilhouetteValidation,
    repairs: list[ConflictRepair] | None = None,
    *,
    forehead_mark_gated: bool = True,
    mask_gated: bool = True,
    side_profile: bool = False,
) -> IdentityStrength:
    repairs = repairs or []

    components = {
        "silhouette_strength": score_silhouette_strength(silhouette),
        "readability": score_readability(pixel, silhouette),
        "palette_harmony": score_palette_harmony(palette),
        "mask_clarity": score_mask_clarity(silhouette, mask_gated=mask_gated),
        "mark_visibility": score_mark_visibility(
            silhouette, pixel, forehead_mark_gated=forehead_mark_gated
        ),
        "asymmetry_intentionality": score_asymmetry_intentionality(
            silhouette, side_profile=side_profile
        ),
        "uniqueness_proxy": score_uniqueness_proxy(appearance, repairs),
        "chromie_presence": score_chromie_presence(
            appearance,
            pixel,
            palette,
            silhouette,
            forehead_mark_gated=forehead_mark_gated,
            mask_gated=mask_gated,
        ),
    }
    total = compute_total(components, side_profile=side_profile)

    return IdentityStrength(
        silhouette_strength=components["silhouette_strength"],
        readability=components["readability"],
        palette_harmony=components["palette_harmony"],
        mask_clarity=components["mask_clarity"],
        mark_visibility=components["mark_visibility"],
        asymmetry_intentionality=components["asymmetry_intentionality"],
        uniqueness_proxy=components["uniqueness_proxy"],
        chromie_presence=components["chromie_presence"],
        total=total,
        note=IDENTITY_STRENGTH_NOTE,
    )
