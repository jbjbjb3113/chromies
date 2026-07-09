"""Art-derived Chromie compositor — ports art-pipeline/generate.js appearance logic."""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from engine.art_schema_loader import ArtSchemaBundle, load_art_schema_bundle
from engine.js_rng import mulberry32, seed_from_str, weighted_pick
from engine.palette_renderer import composite_layers, load_pick_buffers, render_palette_png

ANTI_STACK_CHARACTERS = {"HeroA", "Chubby", "Zombie", "Alien"}
SHIRT_BUCKET_WEIGHT = 60
OTHER_BUCKET_WEIGHT = 40


@dataclass
class CompositorResult:
    seed: int
    token_id: int
    character: dict[str, Any]
    palette_key: str
    picks: dict[str, dict[str, Any]]
    render_picks: dict[str, dict[str, Any]]
    image_rgba: Any
    anti_stack_fires: int = 0
    gated_slots: dict[str, str] = field(default_factory=dict)
    batch_guard: dict[str, Any] = field(default_factory=dict)


def _pick_clone(pick: dict[str, Any]) -> dict[str, Any]:
    return {
        "variant": pick["variant"],
        "file": pick["file"],
        "buffer": pick.get("buffer"),
    }


def _clone_picks(picks: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {slot: _pick_clone(pick) for slot, pick in picks.items()}


def is_hood_none(hood_name: str | None) -> bool:
    return not hood_name or hood_name in {"None", "Female_None"}


def hood_covers_torso(hood_name: str | None) -> bool:
    return hood_name in {
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
    }


def hood_suppresses_hair(hood_name: str | None) -> bool:
    return hood_name in {
        "Female_Classic",
        "Female_Hooded",
        "Male_Hooded",
        "Chubby_Classic",
        "SP_Classic_Female",
        "SP_Classic_Male",
        "Zombie_Classic",
        "Zombie_Hooded",
        "Zombie_Hoodie",
    }


def body_visible(body_name: str | None) -> bool:
    return body_name in {"Default", "Female", "Female_Tank", "Alien", "Zombie", "Agent"}


def is_hat_none(hat_name: str | None) -> bool:
    return not hat_name or hat_name == "None"


def hat_suppresses_hair(hat_name: str | None) -> bool:
    return not is_hat_none(hat_name)


def pick_character(roll_id: int, schema: ArtSchemaBundle) -> dict[str, Any]:
    rng = mulberry32(seed_from_str(f"{roll_id}:character"))
    characters = schema.characters
    total = sum(float(c.get("weight") or 0) for c in characters)
    roll = rng() * total
    for char in characters:
        roll -= float(char.get("weight") or 0)
        if roll < 0:
            return char
    return characters[-1]


def pick_palette(roll_id: int, schema: ArtSchemaBundle, character: dict[str, Any]) -> str:
    pool_override = character.get("palettePool")
    if isinstance(pool_override, list) and pool_override:
        rng = mulberry32(seed_from_str(f"{roll_id}:palette"))
        idx = int(rng() * len(pool_override))
        return pool_override[idx].upper()

    palettes = [
        p
        for p in schema.traits.get("palettes", [])
        if float(p.get("weight") or 0) > 0 and not str(p.get("name", "")).upper().startswith("NORMIE")
    ]
    if not palettes:
        return "SIGNAL"

    shirt_palettes = [p for p in palettes if "_SHIRT_" in p["name"]]
    other_palettes = [p for p in palettes if "_SHIRT_" not in p["name"]]

    pool = palettes
    if shirt_palettes and other_palettes:
        bucket_rng = mulberry32(seed_from_str(f"{roll_id}:palette"))
        bucket_total = SHIRT_BUCKET_WEIGHT + OTHER_BUCKET_WEIGHT
        pool = shirt_palettes if bucket_rng() * bucket_total < SHIRT_BUCKET_WEIGHT else other_palettes

    rng = mulberry32(seed_from_str(f"{roll_id}:palette:pick"))
    total = sum(float(p.get("weight") or 1) for p in pool)
    roll = rng() * total
    for palette in pool:
        roll -= float(palette.get("weight") or 1)
        if roll < 0:
            return palette["name"].upper()
    return pool[-1]["name"].upper()


def get_eligible_variants(
    slot: str,
    slot_def: dict[str, Any],
    character: dict[str, Any] | None,
    schema: ArtSchemaBundle,
    *,
    exclude_none: bool = False,
    exclude_names: set[str] | None = None,
) -> list[dict[str, Any]] | None:
    if character and character.get("forcedSlots", {}).get(slot) is not None:
        return None

    variants = copy.deepcopy(slot_def.get("variants", []))

    overrides = (character or {}).get("slotWeightOverrides", {}).get(slot)
    if overrides:
        patched = []
        for variant in variants:
            name = variant.get("name")
            if name in overrides:
                patched.append({**variant, "weight": round(float(variant.get("weight") or 0) * float(overrides[name]))})
            else:
                patched.append(variant)
        variants = patched

    pool_def = (character or {}).get("slotVariantPool", {}).get(slot)
    if pool_def is not None:
        if isinstance(pool_def, list):
            allowed = set(pool_def)
            variants = [
                v if v.get("name") in allowed else {**v, "weight": 0}
                for v in variants
            ]
        else:
            variants = [
                {**v, "weight": pool_def[v["name"]]}
                if v.get("name") in pool_def
                else {**v, "weight": 0}
                for v in variants
            ]

    eligible: list[dict[str, Any]] = []
    for variant in variants:
        weight = float(variant.get("weight") or 0)
        if weight <= 0:
            continue
        name = str(variant.get("name"))
        if exclude_none and name == "None":
            continue
        if exclude_names and name in exclude_names:
            continue
        if schema.is_variant_disabled(slot, name):
            continue
        if schema.is_variant_excluded(slot, variant):
            continue
        file_ref = str(variant.get("file", ""))
        if file_ref and not schema.path_resolver.exists(file_ref):
            continue
        eligible.append(variant)

    if slot == "mask":
        eligible = [v for v in eligible if v.get("name") == "None"]

    return eligible


def roll_slot_variant(
    roll_id: int,
    slot: str,
    schema: ArtSchemaBundle,
    character: dict[str, Any] | None,
    seed_suffix: str = "",
    *,
    exclude_none: bool = False,
) -> dict[str, Any] | None:
    slot_def = schema.slot_def(slot)
    eligible = get_eligible_variants(
        slot, slot_def, character, schema, exclude_none=exclude_none
    )
    if not eligible:
        return None
    rng = mulberry32(seed_from_str(f"{roll_id}:{slot}{seed_suffix}"))
    return weighted_pick(eligible, rng)


def _set_pick(
    picks: dict[str, dict[str, Any]],
    slot: str,
    variant: dict[str, Any],
) -> None:
    picks[slot] = {
        "variant": variant,
        "file": variant.get("file"),
        "buffer": None,
    }


def _sync_group_for_pick(
    picks: dict[str, dict[str, Any]],
    slot: str,
    variant: dict[str, Any],
    schema: ArtSchemaBundle,
    character: dict[str, Any] | None,
    skip: set[str] | None = None,
) -> None:
    group = variant.get("group")
    if not group:
        return
    skip = skip or set()
    for slot_name, slot_def in schema.traits["slots"].items():
        if slot_name.lower() in skip:
            continue
        forced_name = (character or {}).get("forcedSlots", {}).get(slot_name)
        if forced_name is not None:
            if slot_name == "body" and group == "tank_female" and forced_name == "Female":
                tank_body = schema.variant_def("body", "Female_Tank")
                if tank_body:
                    _set_pick(picks, slot_name, tank_body)
            continue
        if picks.get(slot_name, {}).get("variant", {}).get("group") == group:
            continue
        grouped = next((v for v in slot_def.get("variants", []) if v.get("group") == group), None)
        if grouped:
            _set_pick(picks, slot_name, grouped)


def pick_token_variants(
    roll_id: int,
    schema: ArtSchemaBundle,
    character: dict[str, Any] | None,
    skip: set[str] | None = None,
) -> dict[str, dict[str, Any]]:
    skip = skip or set()
    picks: dict[str, dict[str, Any]] = {}

    for slot, slot_def in schema.traits["slots"].items():
        if slot.lower() in skip:
            continue

        forced_name = (character or {}).get("forcedSlots", {}).get(slot)
        if forced_name is not None:
            forced_variant = schema.variant_def(slot, forced_name)
            if forced_variant and not schema.is_variant_excluded(slot, forced_variant):
                _set_pick(picks, slot, forced_variant)
            continue

        eligible = get_eligible_variants(slot, slot_def, character, schema)
        if not eligible:
            none_variant = schema.variant_def(slot, "None")
            if none_variant:
                _set_pick(picks, slot, none_variant)
            continue

        rng = mulberry32(seed_from_str(f"{roll_id}:{slot}"))
        variant = weighted_pick(eligible, rng)
        _set_pick(picks, slot, variant)

    active_groups = {pick["variant"].get("group") for pick in picks.values() if pick["variant"].get("group")}
    for group in active_groups:
        for slot, slot_def in schema.traits["slots"].items():
            if slot.lower() in skip:
                continue
            forced_name = (character or {}).get("forcedSlots", {}).get(slot)
            if forced_name is not None:
                if slot == "body" and group == "tank_female" and forced_name == "Female":
                    tank_body = schema.variant_def("body", "Female_Tank")
                    if tank_body:
                        _set_pick(picks, slot, tank_body)
                continue
            if picks.get(slot, {}).get("variant", {}).get("group") == group:
                continue
            grouped = next((v for v in slot_def.get("variants", []) if v.get("group") == group), None)
            if grouped and not schema.is_variant_excluded(slot, grouped):
                _set_pick(picks, slot, grouped)

    for slot, pick in list(picks.items()):
        group = pick["variant"].get("group")
        if not group:
            continue
        anchored = any(
            s != slot and p.get("variant", {}).get("group") == group for s, p in picks.items()
        )
        if not anchored:
            none_variant = schema.variant_def(slot, "None")
            if none_variant:
                _set_pick(picks, slot, none_variant)

    mask_none = schema.variant_def("mask", "None")
    if mask_none:
        _set_pick(picks, "mask", mask_none)

    return picks


def _suppress_to(
    out: dict[str, dict[str, Any]],
    slot: str,
    schema: ArtSchemaBundle,
) -> None:
    none_variant = schema.variant_def(slot, "None")
    if none_variant:
        _set_pick(out, slot, none_variant)


def _promote_to_default(
    out: dict[str, dict[str, Any]],
    slot: str,
    schema: ArtSchemaBundle,
    character: dict[str, Any] | None,
) -> None:
    is_female = character and character.get("gender") == "Female"
    default_name = "Female" if is_female else "Default"
    variant = schema.variant_def(slot, default_name) or schema.variant_def(slot, "Default")
    if variant:
        _set_pick(out, slot, variant)


def _promote_to_named(
    out: dict[str, dict[str, Any]],
    slot: str,
    variant_name: str,
    schema: ArtSchemaBundle,
) -> None:
    variant = schema.variant_def(slot, variant_name)
    if variant:
        _set_pick(out, slot, variant)


def _pick_side_profile_default_shirt(character: dict[str, Any] | None, schema: ArtSchemaBundle) -> str | None:
    if character and character.get("gender") == "Female":
        candidates = ["SP_Crew_Female"]
    elif character and character.get("gender") == "Male":
        candidates = ["SP_Crew_Male"]
    else:
        candidates = ["SP_Crew", "Crew"]
    for name in candidates:
        variant = schema.variant_def("shirt", name)
        if variant and schema.path_resolver.exists(str(variant.get("file", ""))):
            return name
    return None


def apply_coverage_rules(
    picks: dict[str, dict[str, Any]],
    schema: ArtSchemaBundle,
    character: dict[str, Any] | None,
) -> dict[str, dict[str, Any]]:
    out = _clone_picks(picks)
    hood_pick = out.get("hood", {}).get("variant", {}).get("name")
    shirt_pick = out.get("shirt", {}).get("variant", {}).get("name")
    body_pick = out.get("body", {}).get("variant", {}).get("name")

    is_zombie = character and character.get("name") == "Zombie"
    if is_zombie:
        out.pop("neck", None)
        _promote_to_named(out, "body", "Zombie", schema)

    # Hat <-> hood mutually exclusive (both directions) — hood is the incumbent trait; on
    # collision, hat yields to hood (documented default pending JB confirmation of priority).
    hat_pick = out.get("hat", {}).get("variant", {}).get("name")
    if "hat" in out and not is_hat_none(hat_pick) and not is_hood_none(hood_pick):
        _suppress_to(out, "hat", schema)
    final_hat_pick = out.get("hat", {}).get("variant", {}).get("name")

    if character and character.get("name") == "Chubby":
        out.pop("neck", None)
        _suppress_to(out, "shirt", schema)
        _promote_to_named(out, "body", "Chubby", schema)
        _suppress_to(out, "bodytattoo", schema)
        if hood_suppresses_hair(hood_pick) or hat_suppresses_hair(final_hat_pick):
            _suppress_to(out, "hair", schema)
        return out

    if character and character.get("name") == "SideProfile":
        if character.get("gender") == "Male":
            out.pop("neck", None)
        _suppress_to(out, "body", schema)
        _suppress_to(out, "bodytattoo", schema)
        final_hood = out.get("hood", {}).get("variant", {}).get("name")
        final_shirt = out.get("shirt", {}).get("variant", {}).get("name")
        if hood_covers_torso(final_hood):
            _suppress_to(out, "shirt", schema)
        elif is_hood_none(final_hood) and final_shirt == "None":
            default_shirt = _pick_side_profile_default_shirt(character, schema)
            if default_shirt:
                _promote_to_named(out, "shirt", default_shirt, schema)
        necklace_name = out.get("necklace", {}).get("variant", {}).get("name")
        keep_sp_necklace = necklace_name and necklace_name.startswith("SP_") and necklace_name != "None"
        if not keep_sp_necklace:
            _suppress_to(out, "necklace", schema)
        return out

    if character and character.get("name") == "Alien":
        _promote_to_named(out, "body", "Alien", schema)
        return out

    if shirt_pick == "Tank_Female":
        _promote_to_named(out, "body", "Female_Tank", schema)

    if hood_covers_torso(hood_pick):
        _suppress_to(out, "shirt", schema)
        if not is_zombie:
            _suppress_to(out, "body", schema)
        _suppress_to(out, "bodytattoo", schema)
    elif is_hood_none(hood_pick) and shirt_pick == "None" and body_pick != "Tank" and not is_zombie:
        _promote_to_default(out, "body", schema, character)
    elif body_pick in {"Default", "Female", "Female_Tank", "Zombie"} and (
        not is_hood_none(hood_pick) or shirt_pick not in {"None", "Tank_Female"}
    ):
        if not is_zombie:
            _suppress_to(out, "body", schema)
        _suppress_to(out, "bodytattoo", schema)

    if hood_suppresses_hair(hood_pick) or hat_suppresses_hair(final_hat_pick):
        _suppress_to(out, "hair", schema)

    final_body = out.get("body", {}).get("variant", {}).get("name")
    if not body_visible(final_body):
        _suppress_to(out, "bodytattoo", schema)

    final_hood = out.get("hood", {}).get("variant", {}).get("name")
    final_shirt = out.get("shirt", {}).get("variant", {}).get("name")
    necklace_visible = not hood_covers_torso(final_hood) and (
        final_shirt in {"None", "Tank", "Tank_Female"} or final_body in {"Tank", "Female_Tank"}
    )
    if not necklace_visible:
        _suppress_to(out, "necklace", schema)

    mask_none = schema.variant_def("mask", "None")
    if mask_none:
        _set_pick(out, "mask", mask_none)

    return out


def apply_anti_none_stacking(
    roll_id: int,
    picks: dict[str, dict[str, Any]],
    schema: ArtSchemaBundle,
    character: dict[str, Any] | None,
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], int]:
    if not character or character.get("name") not in ANTI_STACK_CHARACTERS:
        render = apply_coverage_rules(picks, schema, character)
        return picks, render, 0

    working = _clone_picks(picks)
    fires = 0
    for attempt in range(1, 13):
        render = apply_coverage_rules(working, schema, character)
        hair = render.get("hair", {}).get("variant", {}).get("name", "None")
        glasses = render.get("glasses", {}).get("variant", {}).get("name", "None")
        shirt = render.get("shirt", {}).get("variant", {}).get("name", "None")
        if not (hair == "None" and glasses == "None" and shirt == "None"):
            return working, render, fires

        fires += 1
        suffix = f":restack:{attempt}"
        hood_name = working.get("hood", {}).get("variant", {}).get("name")
        hair_suppressed = hood_suppresses_hair(hood_name)

        if not hair_suppressed:
            variant = roll_slot_variant(
                roll_id, "hair", schema, character, suffix, exclude_none=True
            )
            if variant:
                _set_pick(working, "hair", variant)
                continue

        if character.get("name") not in {"Chubby", "Zombie"}:
            variant = roll_slot_variant(
                roll_id, "shirt", schema, character, suffix, exclude_none=True
            )
            if variant:
                _set_pick(working, "shirt", variant)
                _sync_group_for_pick(working, "shirt", variant, schema, character)
                after = apply_coverage_rules(working, schema, character)
                if after.get("shirt", {}).get("variant", {}).get("name") != "None":
                    continue

        glasses_variant = roll_slot_variant(
            roll_id, "glasses", schema, character, suffix, exclude_none=True
        )
        if glasses_variant:
            _set_pick(working, "glasses", glasses_variant)
            continue

        if character.get("name") in {"Zombie", "Alien"}:
            for slot in ("hood", "necklace", "accessory"):
                variant = roll_slot_variant(
                    roll_id, slot, schema, character, suffix, exclude_none=True
                )
                if variant:
                    _set_pick(working, slot, variant)
                    break
            else:
                break
            continue
        break

    render = apply_coverage_rules(working, schema, character)
    return working, render, fires


def finalize_token_traits(
    roll_id: int,
    picks: dict[str, dict[str, Any]],
    schema: ArtSchemaBundle,
    character: dict[str, Any] | None,
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], int]:
    return apply_anti_none_stacking(roll_id, picks, schema, character)


def composite_chromie(
    render_picks: dict[str, dict[str, Any]],
    schema: ArtSchemaBundle,
) -> Any:
    layers: list[tuple[int, Any]] = []
    for slot, pick in render_picks.items():
        variant = pick.get("variant") or {}
        z_order = variant.get("zOrder")
        if z_order is None:
            z_order = schema.slot_def(slot).get("zOrder", 0)
        layers.append((int(z_order), pick.get("buffer")))
    role_buf = composite_layers(layers, schema.grid)
    return role_buf


def generate_chromie(
    seed: int,
    token_id: int,
    schema: ArtSchemaBundle | None = None,
    batch: Any | None = None,
) -> CompositorResult:
    from engine.batch_guards import resolve_unique_traits

    schema = schema or load_art_schema_bundle()
    roll_id = seed

    character = pick_character(roll_id, schema)
    palette_key = pick_palette(roll_id, schema, character)
    picks, render_picks, anti_stack_fires, guard_meta = resolve_unique_traits(
        roll_id, token_id, character, palette_key, schema, batch
    )

    load_pick_buffers(render_picks, schema, character)
    role_buf = composite_chromie(render_picks, schema)
    image = render_palette_png(role_buf, palette_key, schema, grid=schema.grid)

    gated = {
        "forehead_mark": "disabled — no MARK_* art",
        "mask": "forced None — no visible mask variants",
    }

    return CompositorResult(
        seed=seed,
        token_id=token_id,
        character=character,
        palette_key=palette_key,
        picks=picks,
        render_picks=render_picks,
        image_rgba=image,
        anti_stack_fires=anti_stack_fires,
        gated_slots=gated,
        batch_guard=guard_meta,
    )
