"""Batch dedupe and combo-cap guards — ports art-pipeline/generate.js uniqueness logic."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from engine.js_rng import mulberry32, seed_from_str

DEDUPE_REROLL_MAX = 5
COMBO_CAP_MAX = 60
COMBO_CAP_REROLL_MAX = 5

GENDER_SUFFIX_CHARACTERS = frozenset({"HeroA", "SideProfile", "Chubby"})
VISUAL_COMBO_SLOTS = ("head", "hair", "eyes", "body", "shirt")
COMBO_CAP_EXEMPT_CHARACTERS = frozenset({"Agent", "Alien", "Zombie"})


def character_key(character: dict[str, Any] | None) -> str:
    if not character:
        return "HeroA_Male"
    name = character.get("name", "")
    gender = character.get("gender")
    if name in GENDER_SUFFIX_CHARACTERS and gender:
        return f"{name}_{gender}"
    return name


def _variant_name(pick: dict[str, Any] | None) -> str:
    if not pick:
        return "None"
    return str(pick.get("variant", {}).get("name", "None"))


def build_trait_vector_key(
    character: dict[str, Any],
    palette_key: str,
    render_picks: dict[str, dict[str, Any]],
    slot_order: list[str],
) -> str:
    parts = [f"char:{character_key(character)}", f"pal:{palette_key}"]
    for slot in slot_order:
        parts.append(f"{slot}:{_variant_name(render_picks.get(slot))}")
    return "|".join(parts)


def build_near_dup_combo_key(
    character: dict[str, Any],
    render_picks: dict[str, dict[str, Any]],
) -> str:
    return "|".join(
        [
            character_key(character),
            _variant_name(render_picks.get("hair")),
            _variant_name(render_picks.get("glasses")),
            _variant_name(render_picks.get("shirt")),
        ]
    )


def build_visual_combo_key(
    character: dict[str, Any],
    render_picks: dict[str, dict[str, Any]],
) -> str:
    return "|".join(
        [character_key(character)]
        + [_variant_name(render_picks.get(slot)) for slot in VISUAL_COMBO_SLOTS]
    )


def is_combo_cap_exempt(character: dict[str, Any] | None) -> bool:
    return bool(character and character.get("name") in COMBO_CAP_EXEMPT_CHARACTERS)


@dataclass
class PreventionEvent:
    event_type: str
    roll_id: int
    token_id: int
    detail: str
    slot: str | None = None
    variant: str | None = None
    partner_token_id: int | None = None
    attempt: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_type": self.event_type,
            "roll_id": self.roll_id,
            "token_id": self.token_id,
            "detail": self.detail,
            "slot": self.slot,
            "variant": self.variant,
            "partner_token_id": self.partner_token_id,
            "attempt": self.attempt,
        }


@dataclass
class TraitDedupeGuard:
    seen: dict[str, int] = field(default_factory=dict)

    def is_duplicate(self, key: str) -> bool:
        return key in self.seen

    def partner_token(self, key: str) -> int | None:
        return self.seen.get(key)

    def register(self, key: str, token_id: int) -> None:
        self.seen[key] = token_id


@dataclass
class ComboCapGuard:
    max_per_combo: int = COMBO_CAP_MAX
    visual_counts: dict[str, int] = field(default_factory=dict)
    near_dup_counts: dict[str, int] = field(default_factory=dict)

    def is_visual_at_cap(self, key: str) -> bool:
        return self.visual_counts.get(key, 0) >= self.max_per_combo

    def is_near_dup_at_cap(self, key: str) -> bool:
        return self.near_dup_counts.get(key, 0) >= self.max_per_combo

    def register(self, visual_key: str, near_dup_key: str) -> None:
        self.visual_counts[visual_key] = self.visual_counts.get(visual_key, 0) + 1
        self.near_dup_counts[near_dup_key] = self.near_dup_counts.get(near_dup_key, 0) + 1


@dataclass
class BatchGuardContext:
    dedupe: TraitDedupeGuard = field(default_factory=TraitDedupeGuard)
    combo: ComboCapGuard = field(default_factory=ComboCapGuard)
    events: list[PreventionEvent] = field(default_factory=list)
    dedupe_reroll_total: int = 0
    combo_cap_reroll_total: int = 0

    def log(self, event: PreventionEvent) -> None:
        self.events.append(event)
        if event.event_type == "dedupe_reroll":
            self.dedupe_reroll_total += 1
        elif event.event_type == "combo_cap_reroll":
            self.combo_cap_reroll_total += 1


def get_rollable_slots(
    character: dict[str, Any] | None,
    schema: Any,
) -> list[str]:
    from engine.compositor import get_eligible_variants

    slots: list[str] = []
    for slot in schema.traits["slots"]:
        if character and character.get("forcedSlots", {}).get(slot) is not None:
            continue
        eligible = get_eligible_variants(slot, schema.slot_def(slot), character, schema)
        if eligible and len(eligible) > 1:
            slots.append(slot)
    return sorted(slots)


def _clone_picks(picks: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    from engine.compositor import _clone_picks as clone

    return clone(picks)


def _set_pick(
    picks: dict[str, dict[str, Any]],
    slot: str,
    variant: dict[str, Any],
    schema: Any,
    character: dict[str, Any] | None,
) -> None:
    from engine.compositor import _set_pick as set_pick
    from engine.compositor import _sync_group_for_pick

    set_pick(picks, slot, variant)
    if slot == "shirt":
        _sync_group_for_pick(picks, slot, variant, schema, character)


def _find_dedupe_resolution(
    roll_id: int,
    picks: dict[str, dict[str, Any]],
    render_picks: dict[str, dict[str, Any]],
    character: dict[str, Any],
    palette_key: str,
    schema: Any,
    batch: BatchGuardContext,
    rerolled_slots: set[str],
) -> tuple[str, dict[str, Any]] | None:
    from engine.compositor import finalize_token_traits, get_eligible_variants

    slot_order = schema.traits["slots"].keys()
    candidates: list[tuple[str, dict[str, Any]]] = []

    for slot in get_rollable_slots(character, schema):
        if slot in rerolled_slots:
            continue
        current = _variant_name(render_picks.get(slot))
        eligible = get_eligible_variants(
            slot,
            schema.slot_def(slot),
            character,
            schema,
            exclude_names={current},
        )
        if not eligible:
            continue
        for variant in sorted(eligible, key=lambda v: v.get("name", "")):
            trial = _clone_picks(picks)
            _set_pick(trial, slot, variant, schema, character)
            _, trial_render, _ = finalize_token_traits(roll_id, trial, schema, character)
            trial_key = build_trait_vector_key(
                character, palette_key, trial_render, list(slot_order)
            )
            if not batch.dedupe.is_duplicate(trial_key):
                candidates.append((slot, variant))

    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1].get("name", "")))
    rng = mulberry32(seed_from_str(f"{roll_id}:dedupe:pick"))
    idx = int(rng() * len(candidates))
    return candidates[idx]


def _find_combo_resolution(
    roll_id: int,
    attempt: int,
    picks: dict[str, dict[str, Any]],
    render_picks: dict[str, dict[str, Any]],
    character: dict[str, Any],
    palette_key: str,
    schema: Any,
    batch: BatchGuardContext,
) -> tuple[str, dict[str, Any]] | None:
    from engine.compositor import (
        finalize_token_traits,
        get_eligible_variants,
        hood_covers_torso,
        hood_suppresses_hair,
    )

    slot_order = combo_cap_slot_order(picks, render_picks, character)
    slot_defs = schema.traits["slots"]
    candidates: list[tuple[str, dict[str, Any], str, str]] = []

    def trial_candidate(trial_picks: dict[str, dict[str, Any]]) -> tuple[str, dict[str, Any], str, str] | None:
        _, trial_render, _ = finalize_token_traits(roll_id, trial_picks, schema, character)
        trial_trait = build_trait_vector_key(
            character, palette_key, trial_render, list(slot_defs.keys())
        )
        trial_visual = build_visual_combo_key(character, trial_render)
        trial_near = build_near_dup_combo_key(character, trial_render)
        if batch.dedupe.is_duplicate(trial_trait):
            return None
        if batch.combo.is_visual_at_cap(trial_visual):
            return None
        return trial_trait, trial_render, trial_visual, trial_near

    for slot in slot_order:
        current = _variant_name(render_picks.get(slot))
        eligible = get_eligible_variants(
            slot,
            schema.slot_def(slot),
            character,
            schema,
            exclude_none=slot != "hood",
            exclude_names={current},
        )
        for variant in sorted(eligible or [], key=lambda v: v.get("name", "")):
            trial = _clone_picks(picks)
            _set_pick(trial, slot, variant, schema, character)
            result = trial_candidate(trial)
            if result:
                candidates.append((slot, variant, result[2], result[3]))

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[2])
    rng = mulberry32(seed_from_str(f"{roll_id}:comboCap:{attempt}"))
    choice = candidates[int(rng() * len(candidates))]
    return choice[0], choice[1]


def combo_cap_slot_order(
    picks: dict[str, dict[str, Any]],
    render_picks: dict[str, dict[str, Any]],
    character: dict[str, Any] | None,
) -> list[str]:
    from engine.compositor import hood_covers_torso, hood_suppresses_hair

    hood_name = _variant_name(render_picks.get("hood") or picks.get("hood"))
    hair_suppressed = hood_suppresses_hair(hood_name)
    hood_covers = hood_covers_torso(hood_name)

    order: list[str] = []
    if not hair_suppressed:
        order.append("hair")
    order.append("glasses")
    if not hood_covers:
        order.append("shirt")
    else:
        order.extend(["hood", "shirt"])
    for slot in VISUAL_COMBO_SLOTS:
        if slot not in order and slot not in {"shirt"}:
            order.append(slot)
    return order


def resolve_unique_traits(
    roll_id: int,
    token_id: int,
    character: dict[str, Any],
    palette_key: str,
    schema: Any,
    batch: BatchGuardContext | None,
) -> tuple[dict[str, Any], dict[str, Any], int, dict[str, Any]]:
    from engine.compositor import finalize_token_traits, pick_token_variants

    slot_order = list(schema.traits["slots"].keys())
    picks = pick_token_variants(roll_id, schema, character)
    rerolled_slots: set[str] = set()
    dedupe_meta: dict[str, Any] = {
        "trait_vector_key": "",
        "near_dup_combo_key": "",
        "visual_combo_key": "",
        "dedupe_rerolls": [],
        "combo_cap_rerolls": [],
    }

    if batch is None:
        picks, render_picks, anti_stack = finalize_token_traits(roll_id, picks, schema, character)
        dedupe_meta["trait_vector_key"] = build_trait_vector_key(
            character, palette_key, render_picks, slot_order
        )
        dedupe_meta["near_dup_combo_key"] = build_near_dup_combo_key(character, render_picks)
        dedupe_meta["visual_combo_key"] = build_visual_combo_key(character, render_picks)
        return picks, render_picks, anti_stack, dedupe_meta

    rerolls: list[tuple[str, dict[str, Any]]] = []

    for dedupe_attempt in range(DEDUPE_REROLL_MAX + 1):
        trial_picks = _clone_picks(picks)
        for slot, variant in rerolls:
            _set_pick(trial_picks, slot, variant, schema, character)

        final_picks, render_picks, anti_stack = finalize_token_traits(
            roll_id, trial_picks, schema, character
        )
        trait_key = build_trait_vector_key(character, palette_key, render_picks, slot_order)

        if not batch.dedupe.is_duplicate(trait_key):
            picks = final_picks
            dedupe_meta["trait_vector_key"] = trait_key
            break

        if dedupe_attempt >= DEDUPE_REROLL_MAX:
            partner = batch.dedupe.partner_token(trait_key)
            raise RuntimeError(
                f"Duplicate trait vector for token {token_id} collides with token {partner}: {trait_key}"
            )

        partner = batch.dedupe.partner_token(trait_key)
        resolution = _find_dedupe_resolution(
            roll_id,
            final_picks,
            render_picks,
            character,
            palette_key,
            schema,
            batch,
            rerolled_slots,
        )
        if not resolution:
            raise RuntimeError(
                f"No dedupe resolution for token {token_id} (partner {partner}): {trait_key}"
            )

        slot, variant = resolution
        rerolls.append((slot, variant))
        rerolled_slots.add(slot)
        batch.log(
            PreventionEvent(
                event_type="dedupe_reroll",
                roll_id=roll_id,
                token_id=token_id,
                detail=f"trait vector collision with token {partner}",
                slot=slot,
                variant=str(variant.get("name")),
                partner_token_id=partner,
                attempt=dedupe_attempt + 1,
            )
        )
        dedupe_meta["dedupe_rerolls"].append(
            {"slot": slot, "variant": variant.get("name"), "attempt": dedupe_attempt + 1}
        )

    if not is_combo_cap_exempt(character):
        for cap_attempt in range(1, COMBO_CAP_REROLL_MAX + 1):
            near_dup_key = build_near_dup_combo_key(character, render_picks)
            visual_key = build_visual_combo_key(character, render_picks)
            if not batch.combo.is_visual_at_cap(visual_key):
                break

            original_visual = visual_key
            resolution = _find_combo_resolution(
                roll_id,
                cap_attempt,
                picks,
                render_picks,
                character,
                palette_key,
                schema,
                batch,
            )
            if not resolution:
                if cap_attempt >= COMBO_CAP_REROLL_MAX:
                    raise RuntimeError(
                        f"Combo cap: token {token_id} stuck on visual combo {original_visual}"
                    )
                continue

            slot, variant = resolution
            _set_pick(picks, slot, variant, schema, character)
            picks, render_picks, anti_stack = finalize_token_traits(
                roll_id, picks, schema, character
            )
            dedupe_meta["trait_vector_key"] = build_trait_vector_key(
                character, palette_key, render_picks, slot_order
            )
            near_dup_key = build_near_dup_combo_key(character, render_picks)
            visual_key = build_visual_combo_key(character, render_picks)

            batch.log(
                PreventionEvent(
                    event_type="combo_cap_reroll",
                    roll_id=roll_id,
                    token_id=token_id,
                    detail=f"visual combo cap hit for {original_visual}",
                    slot=slot,
                    variant=str(variant.get("name")),
                    attempt=cap_attempt,
                )
            )
            dedupe_meta["combo_cap_rerolls"].append(
                {"slot": slot, "variant": variant.get("name"), "attempt": cap_attempt}
            )

    dedupe_meta["near_dup_combo_key"] = build_near_dup_combo_key(character, render_picks)
    dedupe_meta["visual_combo_key"] = build_visual_combo_key(character, render_picks)
    visual_key = dedupe_meta["visual_combo_key"]
    near_dup_key = dedupe_meta["near_dup_combo_key"]

    batch.dedupe.register(dedupe_meta["trait_vector_key"], token_id)
    if not is_combo_cap_exempt(character):
        batch.combo.register(visual_key, near_dup_key)

    return picks, render_picks, anti_stack, dedupe_meta
