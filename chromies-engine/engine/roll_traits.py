"""Deterministic appearance and identity DNA rolling."""

from __future__ import annotations

import argparse
import json
from typing import Any

import numpy as np

from engine.config import (
    CONFLICTS_PATH,
    IDENTITY_DNA_PATH,
    IDENTITY_DNA_ROLL_ORDER,
    RARITY_PATH,
)
from engine.models import ClothingTrait, ConflictRepair, HairTrait, IdentityDNA, TraitVector


IDENTITY_STREAM_ENTROPY = 0x1D171DAA

def split_streams(seed: int) -> tuple[np.random.Generator, np.random.Generator]:
    """Spawn independent PCG64 streams from one forge seed.

    Appearance uses the legacy single-stream initializer so existing seeds
    keep the same visual output. Identity DNA uses a separate SeedSequence child.
    """
    masked = seed & 0xFFFFFFFFFFFFFFFF
    appearance = np.random.Generator(np.random.PCG64(masked))
    identity_seq = np.random.SeedSequence([masked, IDENTITY_STREAM_ENTROPY]).spawn(1)[0]
    identity = np.random.Generator(np.random.PCG64(identity_seq))
    return appearance, identity


def make_rng(seed: int) -> np.random.Generator:
    """Legacy single-stream accessor — appearance stream only."""
    appearance_rng, _ = split_streams(seed)
    return appearance_rng


def load_json(path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def weighted_choice(rng: np.random.Generator, weights: dict[str, float]) -> str:
    keys = sorted(weights.keys())
    values = np.array([weights[k] for k in keys], dtype=np.float64)
    total = values.sum()
    if total <= 0:
        raise ValueError("Weight table must sum to a positive value")
    probs = values / total
    idx = rng.choice(len(keys), p=probs)
    return keys[int(idx)]


def roll_category(
    rng: np.random.Generator,
    table: dict[str, Any],
    category: str,
) -> str | None:
    cat = table["categories"][category]
    if cat.get("derived"):
        return None
    if cat.get("roll_chance") is not None and rng.random() >= cat["roll_chance"]:
        return None
    return weighted_choice(rng, cat["values"])


def roll_accessories(rng: np.random.Generator, rarity: dict[str, Any]) -> list[str]:
    count_cat = rarity["categories"]["accessory_count"]
    count = int(weighted_choice(rng, count_cat["values"]))
    if count == 0:
        return []

    pool = rarity["categories"]["accessory"]["values"]
    picked: list[str] = []
    remaining = dict(pool)
    for _ in range(count):
        if not remaining:
            break
        choice = weighted_choice(rng, remaining)
        picked.append(choice)
        del remaining[choice]
    return sorted(picked)


def derive_mouth(rng: np.random.Generator, mask_type: str, rarity: dict[str, Any]) -> str:
    if mask_type not in {"Openface"}:
        return "None"
    mouth_weights = rarity["categories"]["mouth"]["values"]
    return weighted_choice(rng, mouth_weights)


def trait_values_for_conflict_check(traits: TraitVector) -> set[str]:
    values = {
        traits.head_shape,
        traits.mask_type,
        traits.eyes,
        traits.hair.style,
        traits.forehead_mark,
        traits.mouth,
        traits.body_type,
        traits.clothing.torso,
        traits.drift_tier,
        traits.palette_family,
        traits.background,
    }
    if traits.clothing.overlayer:
        values.add(traits.clothing.overlayer)
    values.update(traits.accessories)
    return values


def _apply_resolution(
    traits: TraitVector,
    pair: dict[str, Any],
    repairs: list[ConflictRepair],
) -> bool:
    a, b = pair["traits"]
    resolution = pair.get("resolution", {})
    yield_field = resolution.get("yield")
    fallback = resolution.get("fallback")
    remove = resolution.get("remove", False)

    if remove and yield_field == "accessory":
        to_remove = a if a in traits.accessories else b
        traits.accessories = [x for x in traits.accessories if x != to_remove]
        repairs.append(
            ConflictRepair(conflict=[a, b], resolved_to=None, action="remove_accessory")
        )
        return True

    if yield_field == "hair":
        traits.hair = HairTrait(style=fallback or "Sidefall", side=traits.hair.side)
        repairs.append(ConflictRepair(conflict=[a, b], resolved_to=traits.hair.style))
        return True
    if yield_field == "eyes":
        traits.eyes = fallback or "Wedge"
        repairs.append(ConflictRepair(conflict=[a, b], resolved_to=traits.eyes))
        return True
    if yield_field == "clothing_torso":
        traits.clothing.torso = fallback or "Wrap"
        repairs.append(ConflictRepair(conflict=[a, b], resolved_to=traits.clothing.torso))
        return True
    if yield_field == "palette_family":
        traits.palette_family = fallback or "Ember"
        repairs.append(ConflictRepair(conflict=[a, b], resolved_to=traits.palette_family))
        return True
    if yield_field == "forehead_mark":
        traits.forehead_mark = fallback or "Bar"
        repairs.append(ConflictRepair(conflict=[a, b], resolved_to=traits.forehead_mark))
        return True
    if yield_field == "body_type":
        traits.body_type = fallback or "Standard"
        repairs.append(ConflictRepair(conflict=[a, b], resolved_to=traits.body_type))
        return True
    if yield_field == "drift_tier":
        traits.drift_tier = fallback or "Stable"
        repairs.append(ConflictRepair(conflict=[a, b], resolved_to=traits.drift_tier))
        return True
    return False


def resolve_conflicts(
    rng: np.random.Generator,
    traits: TraitVector,
    conflicts: dict[str, Any],
    rarity: dict[str, Any],
) -> tuple[TraitVector, list[ConflictRepair], int]:
    del rarity
    repairs: list[ConflictRepair] = []
    max_repairs = conflicts.get("max_repairs_before_reroll", 3)

    for _ in range(32):
        active = trait_values_for_conflict_check(traits)
        repair_made = False

        for pair in sorted(conflicts["pairs"], key=lambda p: tuple(sorted(p["traits"]))):
            a, b = pair["traits"]
            if a not in active or b not in active:
                continue
            if _apply_resolution(traits, pair, repairs):
                repair_made = True

        if not repair_made:
            break

        if len(repairs) > max_repairs:
            sub_seed = int(rng.integers(0, 2**63))
            rerolled, _, _ = roll_appearance_from_rng(np.random.Generator(np.random.PCG64(sub_seed)))
            return rerolled, [], 1

    return traits, repairs, 0


def roll_appearance_from_rng(
    rng: np.random.Generator,
) -> tuple[TraitVector, list[ConflictRepair], int]:
    rarity = load_json(RARITY_PATH)
    conflicts = load_json(CONFLICTS_PATH)

    head_shape = roll_category(rng, rarity, "head_shape")
    mask_type = roll_category(rng, rarity, "mask_type")
    eyes = roll_category(rng, rarity, "eyes")
    hair_style = roll_category(rng, rarity, "hair")
    forehead_mark = roll_category(rng, rarity, "forehead_mark")
    body_type = roll_category(rng, rarity, "body_type")
    clothing_torso = roll_category(rng, rarity, "clothing_torso")
    overlayer = roll_category(rng, rarity, "clothing_overlayer")
    accessories = roll_accessories(rng, rarity)
    drift_tier = roll_category(rng, rarity, "drift_tier")
    palette_family = roll_category(rng, rarity, "palette_family")
    background = roll_category(rng, rarity, "background")
    hair_side = roll_category(rng, rarity, "hair_side") or "L"
    mouth = derive_mouth(rng, mask_type or "Halfplate", rarity)

    traits = TraitVector(
        head_shape=head_shape or "Taper",
        mask_type=mask_type or "Halfplate",
        eyes=eyes or "Wedge",
        hair=HairTrait(style=hair_style or "Sidefall", side=hair_side),
        forehead_mark=forehead_mark or "Bar",
        mouth=mouth,
        body_type=body_type or "Standard",
        clothing=ClothingTrait(torso=clothing_torso or "Wrap", overlayer=overlayer),
        accessories=accessories,
        drift_tier=drift_tier or "Stable",
        palette_family=palette_family or "Signal",
        background=background or "Solid",
    )

    return resolve_conflicts(rng, traits, conflicts, rarity)


def roll_identity_dna_from_rng(rng: np.random.Generator) -> IdentityDNA:
    table = load_json(IDENTITY_DNA_PATH)
    values = {
        field: roll_category(rng, table, field) or _identity_fallback(field)
        for field in IDENTITY_DNA_ROLL_ORDER
    }
    return IdentityDNA(**values)


def _identity_fallback(field: str) -> str:
    fallbacks = {
        "temperament": "Wary",
        "origin_signal": "Static burst",
        "alignment": "Anchor",
        "memory_affinity": "Episodic",
        "voice_profile": "Low static",
        "embodiment_bias": "Grounded",
        "continuity_class": "Stable",
    }
    return fallbacks[field]


def roll_appearance(seed: int) -> tuple[TraitVector, list[ConflictRepair]]:
    appearance_rng, _ = split_streams(seed)
    traits, repairs, _ = roll_appearance_from_rng(appearance_rng)
    return traits, repairs


def roll_identity_dna(seed: int) -> IdentityDNA:
    _, identity_rng = split_streams(seed)
    return roll_identity_dna_from_rng(identity_rng)


def roll_traits(seed: int) -> tuple[TraitVector, list[ConflictRepair]]:
    """Roll visual appearance traits (alias for roll_appearance)."""
    return roll_appearance(seed)


def roll_all(seed: int) -> tuple[TraitVector, IdentityDNA, list[ConflictRepair]]:
    appearance_rng, identity_rng = split_streams(seed)
    traits, repairs, _ = roll_appearance_from_rng(appearance_rng)
    identity_dna = roll_identity_dna_from_rng(identity_rng)
    return traits, identity_dna, repairs


def main() -> None:
    parser = argparse.ArgumentParser(description="Roll Chromie appearance and identity DNA")
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--appearance-only", action="store_true")
    parser.add_argument("--identity-only", action="store_true")
    args = parser.parse_args()

    if args.identity_only:
        print(json.dumps(roll_identity_dna(args.seed).model_dump(), indent=2))
        return

    if args.appearance_only:
        traits, repairs = roll_appearance(args.seed)
        print(json.dumps(traits.model_dump(), indent=2))
        if repairs:
            print("\nRepairs:")
            print(json.dumps([r.model_dump() for r in repairs], indent=2))
        return

    traits, identity_dna, repairs = roll_all(args.seed)
    print(
        json.dumps(
            {
                "appearance": traits.model_dump(),
                "identity_dna": identity_dna.model_dump(),
            },
            indent=2,
        )
    )
    if repairs:
        print("\nRepairs:")
        print(json.dumps([r.model_dump() for r in repairs], indent=2))


if __name__ == "__main__":
    main()
