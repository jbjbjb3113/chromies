#!/usr/bin/env python3
"""Phase 2A — export art-derived engine schema from the canonical component library."""

from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from engine.art_safety import READ_ONLY_ART_ROOT, safe_write_text
from engine.chromies_config_loader import load_chromies_config

REPO_ROOT = Path(__file__).resolve().parent.parent
ART_PIPELINE = REPO_ROOT / "art-pipeline"
TRAITS_JSON = ART_PIPELINE / "traits.json"
CHROMIES_CONFIG = ART_PIPELINE / "chromies-config.js"
COMPONENTS_DIR = READ_ONLY_ART_ROOT
ENGINE_DATA = Path(__file__).resolve().parent / "engine_data"

SCHEMA_VERSION = "2.0.0"

GATED_SLOTS: dict[str, dict[str, Any]] = {
    "forehead_mark": {
        "status": "gated",
        "reason": "No MARK_* layer exists in art-pipeline/components or traits.json",
        "engine_action": "omit_from_appearance_roll_until_art_exists",
    },
    "mask": {
        "status": "gated",
        "reason": "Only MASK_None.png exists; no visible mask variants on disk",
        "engine_action": "force_None_or_omit_from_metadata",
        "on_disk_variants": ["None"],
    },
}

SIDE_PROFILE_FOLDER_MARKERS = (
    "sideprofile/",
    "sideprofile_male/",
    "sideprofile_female/",
)

NORMIE_PATTERNS = (
    re.compile(r"normie", re.I),
    re.compile(r"normies", re.I),
)


def rel_posix(path: Path) -> str:
    return str(path.relative_to(COMPONENTS_DIR)).replace("\\", "/")


def is_normie_asset(rel_path: str, variant_name: str = "") -> bool:
    haystack = f"{rel_path} {variant_name}"
    return any(p.search(haystack) for p in NORMIE_PATTERNS)


def is_side_profile_asset(rel_path: str, variant_name: str = "") -> bool:
    lower = f"{rel_path} {variant_name}".lower()
    if lower.startswith("sp_") or "/sp_" in lower.replace("\\", "/"):
        return True
    norm = rel_path.replace("\\", "/").lower()
    return any(norm.startswith(marker) for marker in SIDE_PROFILE_FOLDER_MARKERS)


def scan_png_inventory() -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    """Return canonical inventory keyed by on-disk path plus lowercase lookup index."""
    inventory: dict[str, dict[str, Any]] = {}
    lookup: dict[str, str] = {}
    for path in sorted(COMPONENTS_DIR.rglob("*.png")):
        rel = rel_posix(path)
        inventory[rel] = {
            "path": rel,
            "absolute": str(path),
            "size_bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
        lookup[rel.lower()] = rel
    return inventory, lookup


def resolve_on_disk_path(file_ref: str, lookup: dict[str, str]) -> str | None:
    norm = file_ref.replace("\\", "/")
    if norm in lookup.values():
        return norm
    return lookup.get(norm.lower())


def build_excluded_assets(inventory: dict[str, dict[str, Any]], traits: dict[str, Any]) -> dict[str, Any]:
    excluded_paths: list[dict[str, Any]] = []
    reference_only: list[dict[str, Any]] = []

    for rel, meta in inventory.items():
        stem = Path(rel).stem
        if is_normie_asset(rel, stem):
            entry = {
                "path": rel,
                "reason": "normie_reference_only",
                "sha256": meta["sha256"],
            }
            if "legendary/" in rel.lower() or rel.endswith("-export.png"):
                reference_only.append({**entry, "note": "legendary normie export — negative reference"})
            else:
                excluded_paths.append(entry)

    normie_palette_names = {
        p["name"]
        for p in traits.get("palettes", [])
        if isinstance(p, dict) and str(p.get("name", "")).upper().startswith("NORMIE")
    }

    return {
        "paths": sorted(excluded_paths, key=lambda x: x["path"]),
        "reference_only_paths": sorted(reference_only, key=lambda x: x["path"]),
        "normie_palette_names": sorted(normie_palette_names),
        "policy": "Normie-named assets are exclusion/reference lists only; never composited as Chromies.",
    }


def variant_on_disk(file_ref: str, lookup: dict[str, str]) -> bool:
    return resolve_on_disk_path(file_ref, lookup) is not None


def enrich_variants(
    slot_name: str,
    slot_def: dict[str, Any],
    inventory: dict[str, dict[str, Any]],
    lookup: dict[str, str],
) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for variant in slot_def.get("variants", []):
        file_ref = str(variant.get("file", "")).replace("\\", "/")
        resolved = resolve_on_disk_path(file_ref, lookup) if file_ref else None
        on_disk = resolved is not None
        entry = {
            "name": variant.get("name"),
            "file": file_ref,
            "resolved_path": resolved,
            "weight": variant.get("weight", 0),
            "group": variant.get("group"),
            "zOrder": variant.get("zOrder", slot_def.get("zOrder")),
            "drawColors": variant.get("drawColors"),
            "extractionPalette": variant.get("extractionPalette"),
            "mutationScale": variant.get("mutationScale"),
            "on_disk": on_disk,
            "side_profile": is_side_profile_asset(file_ref, str(variant.get("name", ""))),
            "excluded_normie": is_normie_asset(file_ref, str(variant.get("name", ""))),
            "sha256": inventory[resolved]["sha256"] if resolved else None,
        }
        enriched.append(entry)
    return enriched


def build_slot_schema(
    traits: dict[str, Any],
    inventory: dict[str, dict[str, Any]],
    lookup: dict[str, str],
) -> dict[str, Any]:
    slots = traits.get("slots", {})
    front_slots: dict[str, Any] = {}
    side_profile_slots: dict[str, Any] = {}

    for slot_name, slot_def in slots.items():
        variants = enrich_variants(slot_name, slot_def, inventory, lookup)
        front_variants = [v for v in variants if not v["side_profile"] and not v["excluded_normie"]]
        sp_variants = [v for v in variants if v["side_profile"]]

        front_slots[slot_name] = {
            "zOrder": slot_def.get("zOrder"),
            "drawColors": slot_def.get("drawColors"),
            "variant_count": len(front_variants),
            "variants": front_variants,
        }
        if sp_variants:
            side_profile_slots[slot_name] = {
                "zOrder": slot_def.get("zOrder"),
                "drawColors": slot_def.get("drawColors"),
                "variant_count": len(sp_variants),
                "variants": sp_variants,
            }

    ordered = sorted(slots.items(), key=lambda kv: kv[1].get("zOrder", 999))
    render_order = [name for name, _ in ordered]

    return {
        "schema_version": SCHEMA_VERSION,
        "render_pipeline": "front_facing",
        "slot_count": len(front_slots),
        "render_order_back_to_front": render_order,
        "slots": front_slots,
        "side_profile_pipeline": {
            "independent": True,
            "note": "Side-profile uses SP_* assets and SideProfile character archetype; not mixed with front-facing rolls.",
            "render_order_back_to_front": render_order,
            "slots": side_profile_slots,
        },
        "gated_slots": GATED_SLOTS,
    }


def build_art_schema(
    traits: dict[str, Any],
    config: dict[str, Any],
    inventory: dict[str, dict[str, Any]],
    lookup: dict[str, str],
    excluded: dict[str, Any],
) -> dict[str, Any]:
    characters = []
    for char in config.get("characters", []):
        characters.append(
            {
                "name": char.get("name"),
                "gender": char.get("gender"),
                "weight": char.get("weight", 0),
                "palettePool": char.get("palettePool"),
                "forcedSlots": char.get("forcedSlots", {}),
                "slotWeightOverrides": char.get("slotWeightOverrides", {}),
                "slotVariantPool": char.get("slotVariantPool", {}),
                "archetype_key": f"{char.get('name')}:{char.get('gender')}",
                "render_pipeline": "side_profile"
                if char.get("name") == "SideProfile"
                else "front_facing",
            }
        )

    archetype_tree: dict[str, list[str]] = defaultdict(list)
    for char in characters:
        archetype_tree[char["name"]].append(char["archetype_key"])

    palette_names = [
        p["name"]
        for p in traits.get("palettes", [])
        if isinstance(p, dict) and not str(p.get("name", "")).upper().startswith("NORMIE")
    ]

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "principles": {
            "art_is_source_of_truth": True,
            "read_only_art_root": str(READ_ONLY_ART_ROOT),
            "identity_dna": "Separate deterministic PRNG stream; never modifies source PNGs.",
            "deterministic_generation": "Preserve tokenId/seed-based rolls matching art-pipeline/generate.js.",
        },
        "sources": {
            "traits_json": str(TRAITS_JSON),
            "chromies_config_js": str(CHROMIES_CONFIG),
            "components_dir": str(COMPONENTS_DIR),
        },
        "roles": config.get("roles", []),
        "settings": config.get("settings", {}),
        "palette_families": palette_names,
        "palette_count": len(palette_names),
        "character_archetypes": characters,
        "archetype_hierarchy": {k: sorted(v) for k, v in sorted(archetype_tree.items())},
        "trait_slots": list(traits.get("slots", {}).keys()),
        "gated_slots": GATED_SLOTS,
        "side_profile_pipeline": {
            "independent": True,
            "characters": [c for c in characters if c["render_pipeline"] == "side_profile"],
            "asset_prefix": "SP_",
            "folders": sorted({Path(p).parts[0] for p in inventory if is_side_profile_asset(p)}),
        },
        "excluded_assets_summary": {
            "normie_path_count": len(excluded["paths"]),
            "reference_only_count": len(excluded["reference_only_paths"]),
            "normie_palette_names": excluded["normie_palette_names"],
        },
        "excluded_assets": excluded,
        "inventory_summary": {
            "png_count": len(inventory),
            "referenced_in_traits_json": sum(
                1
                for slot in traits.get("slots", {}).values()
                for v in slot.get("variants", [])
                if variant_on_disk(str(v.get("file", "")).replace("\\", "/"), lookup)
            ),
        },
    }


def build_rarity_from_art(traits: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    palette_weights = {
        p["name"]: p.get("weight", 0)
        for p in traits.get("palettes", [])
        if isinstance(p, dict) and not str(p.get("name", "")).upper().startswith("NORMIE")
    }

    slot_defaults: dict[str, dict[str, float]] = {}
    for slot_name, slot_def in traits.get("slots", {}).items():
        slot_defaults[slot_name] = {
            v["name"]: float(v.get("weight", 0))
            for v in slot_def.get("variants", [])
            if not is_side_profile_asset(str(v.get("file", "")), str(v.get("name", "")))
            and not is_normie_asset(str(v.get("file", "")), str(v.get("name", "")))
        }

    character_rarity = []
    total_char_weight = sum(c.get("weight", 0) for c in config.get("characters", []))
    for char in config.get("characters", []):
        pools = {}
        for slot, pool in (char.get("slotVariantPool") or {}).items():
            if isinstance(pool, list):
                pools[slot] = {name: 1.0 for name in pool}
            else:
                pools[slot] = {k: float(v) for k, v in pool.items()}
        character_rarity.append(
            {
                "archetype_key": f"{char.get('name')}:{char.get('gender')}",
                "name": char.get("name"),
                "gender": char.get("gender"),
                "weight": char.get("weight", 0),
                "relative_probability": round(char.get("weight", 0) / total_char_weight, 6)
                if total_char_weight
                else 0,
                "forcedSlots": char.get("forcedSlots", {}),
                "slotVariantPool": pools,
            }
        )

    return {
        "schema_version": SCHEMA_VERSION,
        "palette_weights": palette_weights,
        "slot_default_weights": slot_defaults,
        "character_weights": character_rarity,
        "notes": [
            "Character slotVariantPool overrides traits.json default weights at roll time.",
            "Normie palette entries excluded.",
            "Side-profile variant weights apply only under SideProfile archetype.",
        ],
    }


def build_compatibility_from_art(traits: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for slot_name, slot_def in traits.get("slots", {}).items():
        for variant in slot_def.get("variants", []):
            group = variant.get("group")
            if group:
                groups[group].append({"slot": slot_name, "variant": variant.get("name", "")})

    coverage_rules = {
        "hoodCoversTorso": [
            "Classic",
            "SP_Classic",
            "SP_Classic_Female",
            "SP_Classic_Male",
            "Female_Classic",
            "Female_Hooded",
            "Male_Hooded",
            "Chubby_Classic",
            "Zombie_Classic",
            "Zombie_Hooded",
            "Zombie_Hoodie",
        ],
        "hoodSuppressesHair": [
            "Female_Classic",
            "Female_Hooded",
            "Male_Hooded",
            "Chubby_Classic",
            "SP_Classic_Female",
            "SP_Classic_Male",
            "Zombie_Classic",
            "Zombie_Hooded",
            "Zombie_Hoodie",
        ],
        "character_specific": {
            "Chubby": ["suppress_shirt", "force_body_Chubby", "suppress_bodytattoo", "delete_neck"],
            "SideProfile": ["suppress_body", "suppress_bodytattoo", "default_sp_shirt_if_none", "sp_necklace_only"],
            "Alien": ["force_body_Alien"],
            "Zombie": ["force_body_Zombie", "delete_neck", "skip_rgb_knockout"],
            "Agent": ["skip_rgb_knockout"],
            "LegendaryHead": ["suppress_hair_beard_mustache_eyes_expression_mask_glasses"],
        },
        "anti_none_stack_characters": ["HeroA", "Chubby", "Zombie", "Alien"],
        "tank_female_group": "tank_female",
        "tank_group": "tank",
    }

    forced_by_character = {
        f"{c.get('name')}:{c.get('gender')}": c.get("forcedSlots", {})
        for c in config.get("characters", [])
    }

    return {
        "schema_version": SCHEMA_VERSION,
        "variant_groups": dict(groups),
        "forced_slots_by_archetype": forced_by_character,
        "coverage_rules": coverage_rules,
        "slot_variant_pools_by_archetype": {
            f"{c.get('name')}:{c.get('gender')}": c.get("slotVariantPool", {})
            for c in config.get("characters", [])
        },
        "conflicts_to_deprecate": [
            "Abstract forge head_shape/mask_type/forehead_mark taxonomy in chromies-engine/traits/rarity.json",
        ],
    }


def build_missing_assets_report(
    traits: dict[str, Any],
    inventory: dict[str, dict[str, Any]],
    lookup: dict[str, str],
) -> dict[str, Any]:
    missing_files: list[dict[str, Any]] = []
    gated_variant_refs: list[dict[str, Any]] = []

    for slot_name, slot_def in traits.get("slots", {}).items():
        for variant in slot_def.get("variants", []):
            file_ref = str(variant.get("file", "")).replace("\\", "/")
            if not file_ref:
                continue
            resolved = resolve_on_disk_path(file_ref, lookup)
            if resolved is None:
                missing_files.append(
                    {
                        "slot": slot_name,
                        "variant": variant.get("name"),
                        "file": file_ref,
                        "side_profile": is_side_profile_asset(file_ref, str(variant.get("name", ""))),
                    }
                )

    on_disk = set(inventory.keys())
    referenced_resolved = {
        resolve_on_disk_path(str(v.get("file", "")).replace("\\", "/"), lookup)
        for slot in traits.get("slots", {}).values()
        for v in slot.get("variants", [])
        if v.get("file")
    }
    referenced_resolved.discard(None)
    unreferenced = sorted(on_disk - referenced_resolved)

    for slot_name, gate in GATED_SLOTS.items():
        gated_variant_refs.append({"slot": slot_name, **gate})

    return {
        "schema_version": SCHEMA_VERSION,
        "traits_json_missing_on_disk": missing_files,
        "missing_count": len(missing_files),
        "gated_slots": gated_variant_refs,
        "unreferenced_on_disk_count": len(unreferenced),
        "unreferenced_on_disk_sample": unreferenced[:50],
        "recommendations": [
            "Do not enable forehead_mark in engine until MARK_* art is authored.",
            "Treat mask slot as None-only until non-None mask PNGs exist.",
            "Side-profile missing refs (SP_SHIRT_Tank_Female, etc.) should gate those variants in SideProfile pool.",
        ],
    }


def build_duplicate_assets_report(inventory: dict[str, dict[str, Any]]) -> dict[str, Any]:
    by_hash: dict[str, list[str]] = defaultdict(list)
    for rel, meta in inventory.items():
        by_hash[meta["sha256"]].append(rel)

    duplicate_groups = [
        {"sha256": digest, "paths": sorted(paths), "count": len(paths)}
        for digest, paths in by_hash.items()
        if len(paths) > 1
    ]
    duplicate_groups.sort(key=lambda g: (-g["count"], g["sha256"]))

    shared_none = next((g for g in duplicate_groups if g["count"] >= 10), None)

    return {
        "schema_version": SCHEMA_VERSION,
        "duplicate_group_count": len(duplicate_groups),
        "duplicate_groups": duplicate_groups,
        "notes": [
            "Shared transparent None PNGs are expected; dedupe only in derived_assets if needed.",
            "BEARD_Full and BEARD_Goat are pixel-identical — verify intent before separate rarity.",
        ],
        "shared_none_layer_group": shared_none,
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    safe_write_text(path, json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if not COMPONENTS_DIR.is_dir():
        raise SystemExit(f"Components directory not found: {COMPONENTS_DIR}")
    if not TRAITS_JSON.is_file():
        raise SystemExit(f"traits.json not found: {TRAITS_JSON}")

    traits = json.loads(TRAITS_JSON.read_text(encoding="utf-8"))
    config = load_chromies_config(CHROMIES_CONFIG)
    inventory, lookup = scan_png_inventory()
    excluded = build_excluded_assets(inventory, traits)

    outputs = {
        "art_schema.json": build_art_schema(traits, config, inventory, lookup, excluded),
        "slot_schema.json": build_slot_schema(traits, inventory, lookup),
        "rarity_from_art.json": build_rarity_from_art(traits, config),
        "compatibility_from_art.json": build_compatibility_from_art(traits, config),
        "missing_assets_report.json": build_missing_assets_report(traits, inventory, lookup),
        "duplicate_assets_report.json": build_duplicate_assets_report(inventory),
    }

    for name, payload in outputs.items():
        write_json(ENGINE_DATA / name, payload)
        print(f"wrote {ENGINE_DATA / name}")

    print("\nExport complete.")
    print(f"  PNG inventory: {len(inventory)}")
    print(f"  Trait slots: {len(traits.get('slots', {}))}")
    print(f"  Characters: {len(config.get('characters', []))}")
    print(f"  Missing refs: {outputs['missing_assets_report.json']['missing_count']}")
    print(f"  Duplicate groups: {outputs['duplicate_assets_report.json']['duplicate_group_count']}")


if __name__ == "__main__":
    main()
