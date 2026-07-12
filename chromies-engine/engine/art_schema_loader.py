"""Load art-derived schema v2.0.0 and related engine_data."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from engine.chromies_config_loader import load_chromies_config
from engine.config import ROOT
from engine.path_resolver import PathResolver

ART_PIPELINE = ROOT.parent / "art-pipeline"
TRAITS_JSON = ART_PIPELINE / "traits.json"
CHROMIES_CONFIG = ART_PIPELINE / "chromies-config.js"
ENGINE_DATA = ROOT / "engine_data"


@dataclass
class ArtSchemaBundle:
    art_schema: dict[str, Any]
    slot_schema: dict[str, Any]
    rarity: dict[str, Any]
    compatibility: dict[str, Any]
    anchors: dict[str, Any]
    missing_report: dict[str, Any]
    traits: dict[str, Any]
    roles: list[str]
    palettes: dict[str, Any]
    settings: dict[str, Any]
    characters: list[dict[str, Any]]
    path_resolver: PathResolver
    disabled_variants: set[tuple[str, str]] = field(default_factory=set)
    excluded_paths: set[str] = field(default_factory=set)

    @property
    def grid(self) -> int:
        return int(self.settings.get("grid", 64))

    @property
    def bg_knockout_threshold(self) -> int:
        return int(self.settings.get("bgKnockoutThreshold", 20))

    def character_by_key(self, key: str) -> dict[str, Any] | None:
        for char in self.characters:
            if f"{char.get('name')}:{char.get('gender')}" == key:
                return char
        return None

    def slot_def(self, slot: str) -> dict[str, Any]:
        return self.traits["slots"][slot]

    def variant_def(self, slot: str, name: str) -> dict[str, Any] | None:
        for variant in self.slot_def(slot).get("variants", []):
            if variant.get("name") == name:
                return variant
        return None

    def is_variant_disabled(self, slot: str, variant_name: str) -> bool:
        return (slot, variant_name) in self.disabled_variants

    def is_variant_excluded(self, slot: str, variant: dict[str, Any]) -> bool:
        file_ref = str(variant.get("file", "")).replace("\\", "/")
        canonical = self.path_resolver.canonical_ref(file_ref)
        if canonical and canonical in self.excluded_paths:
            return True
        return PathResolver.is_normie_named(variant.get("name", ""), file_ref)


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_art_schema_bundle() -> ArtSchemaBundle:
    art_schema = _load_json(ENGINE_DATA / "art_schema.json")
    slot_schema = _load_json(ENGINE_DATA / "slot_schema.json")
    rarity = _load_json(ENGINE_DATA / "rarity_from_art.json")
    compatibility = _load_json(ENGINE_DATA / "compatibility_from_art.json")
    anchors = _load_json(ENGINE_DATA / "anchors.json")
    missing_report = _load_json(ENGINE_DATA / "missing_assets_report.json")
    traits = _load_json(TRAITS_JSON)
    config = load_chromies_config(CHROMIES_CONFIG)

    disabled = {
        (item["slot"], item["variant"])
        for item in missing_report.get("traits_json_missing_on_disk", [])
    }

    excluded = set()
    excluded_block = art_schema.get("excluded_assets", {})
    for entry in excluded_block.get("paths", []):
        excluded.add(entry["path"])
    for entry in excluded_block.get("reference_only_paths", []):
        excluded.add(entry["path"])

    return ArtSchemaBundle(
        art_schema=art_schema,
        slot_schema=slot_schema,
        rarity=rarity,
        compatibility=compatibility,
        anchors=anchors,
        missing_report=missing_report,
        traits=traits,
        roles=list(config.get("roles", [])),
        palettes=dict(config.get("palettes", {})),
        settings=dict(config.get("settings", {})),
        characters=list(config.get("characters", [])),
        path_resolver=PathResolver(),
        disabled_variants=disabled,
        excluded_paths=excluded,
    )
