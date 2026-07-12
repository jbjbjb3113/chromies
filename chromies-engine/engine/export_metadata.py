"""Internal metadata export and marketplace projection."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from engine.compositor import CompositorResult
from engine.models import IdentityMetadata, MarketplaceMetadata, ReviewCard


def build_compositor_metadata_block(result: CompositorResult) -> dict[str, Any]:
    def slot_map(picks: dict[str, dict[str, Any]]) -> dict[str, str]:
        return {
            slot: pick.get("variant", {}).get("name", "None")
            for slot, pick in sorted(picks.items())
        }

    return {
        "art_schema_version": "2.0.0",
        "seed": result.seed,
        "token_id": result.token_id,
        "character": {
            "name": result.character.get("name"),
            "gender": result.character.get("gender"),
            "archetype_key": f"{result.character.get('name')}:{result.character.get('gender')}",
            "render_pipeline": "side_profile"
            if result.character.get("name") == "SideProfile"
            else "front_facing",
        },
        "palette": result.palette_key,
        "traits": slot_map(result.picks),
        "render_traits": slot_map(result.render_picks),
        "anti_stack_fires": result.anti_stack_fires,
        "gated_slots": result.gated_slots,
        "batch_guard": result.batch_guard,
    }


def write_internal_metadata(metadata: IdentityMetadata, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = metadata.model_dump(by_alias=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def write_review_card(card: ReviewCard, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(card.model_dump(), f, indent=2)


def to_marketplace(
    metadata: IdentityMetadata,
    *,
    image_uri: str = "",
    description: str = "A forged Chromie identity from the Identity Forge.",
) -> MarketplaceMetadata:
    return MarketplaceMetadata(
        name=metadata.name,
        description=description,
        image=image_uri,
        attributes=metadata.attributes,
    )


def write_marketplace_metadata(
    metadata: IdentityMetadata,
    path: Path,
    *,
    image_uri: str = "",
) -> None:
    mp = to_marketplace(metadata, image_uri=image_uri)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(mp.model_dump(), f, indent=2)


def build_attributes(metadata: IdentityMetadata) -> list[dict[str, str]]:
    appearance = metadata.identity.appearance
    dna = metadata.identity.identity_dna
    compositor = (metadata.rarity or {}).get("compositor", {})

    attrs: list[dict[str, str]] = []
    if compositor:
        char = compositor.get("character", {})
        if char.get("name"):
            attrs.append({"trait_type": "Type", "value": str(char["name"])})
        if char.get("gender"):
            attrs.append({"trait_type": "Gender", "value": str(char["gender"])})
        if compositor.get("palette"):
            attrs.append({"trait_type": "Palette", "value": str(compositor["palette"])})
        for slot, value in sorted((compositor.get("render_traits") or {}).items()):
            trait_type = slot.replace("_", " ").title()
            attrs.append({"trait_type": trait_type, "value": str(value)})
    else:
        attrs.extend(
            [
                {"trait_type": "Head", "value": appearance.head_shape},
                {"trait_type": "Mask", "value": appearance.mask_type},
                {"trait_type": "Eyes", "value": appearance.eyes},
                {"trait_type": "Hair", "value": f"{appearance.hair.style} ({appearance.hair.side})"},
                {"trait_type": "Forehead Mark", "value": appearance.forehead_mark},
                {"trait_type": "Mouth", "value": appearance.mouth},
                {"trait_type": "Body", "value": appearance.body_type},
                {"trait_type": "Clothing", "value": appearance.clothing.torso},
                {"trait_type": "Drift", "value": appearance.drift_tier},
                {"trait_type": "Palette", "value": appearance.palette_family},
                {"trait_type": "Background", "value": appearance.background},
            ]
        )
        if appearance.clothing.overlayer:
            attrs.append({"trait_type": "Overlayer", "value": appearance.clothing.overlayer})
        for acc in appearance.accessories:
            attrs.append({"trait_type": "Accessory", "value": acc})

    attrs.extend(
        [
            {"trait_type": "Temperament", "value": dna.temperament},
            {"trait_type": "Origin Signal", "value": dna.origin_signal},
            {"trait_type": "Alignment", "value": dna.alignment},
            {"trait_type": "Memory Affinity", "value": dna.memory_affinity},
            {"trait_type": "Voice Profile", "value": dna.voice_profile},
            {"trait_type": "Embodiment Bias", "value": dna.embodiment_bias},
            {"trait_type": "Continuity Class", "value": dna.continuity_class},
        ]
    )
    return attrs


def main() -> None:
    parser = argparse.ArgumentParser(description="Export marketplace metadata from internal JSON")
    parser.add_argument("internal_json", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--image-uri", default="")
    args = parser.parse_args()

    with open(args.internal_json, encoding="utf-8") as f:
        data = json.load(f)
    metadata = IdentityMetadata.model_validate(data)
    write_marketplace_metadata(metadata, args.out, image_uri=args.image_uri)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
