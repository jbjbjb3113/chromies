"""Generate Phase 1 placeholder trait PNG layers."""

from __future__ import annotations

import argparse
import json

from engine.config import RARITY_PATH, TRAITS_DIR
from engine.placeholder_art import (
    draw_body_layer,
    draw_clothing_layer,
    draw_eyes_layer,
    draw_hair_layer,
    draw_head_layer,
    draw_mark_layer,
    draw_mask_layer,
    save_layer,
    slug,
)


def load_rarity_values(category: str) -> list[str]:
    with open(RARITY_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return sorted(data["categories"][category]["values"].keys())


def build_all() -> int:
    heads = load_rarity_values("head_shape")
    masks = load_rarity_values("mask_type")
    eyes = load_rarity_values("eyes")
    hairs = load_rarity_values("hair")
    marks = load_rarity_values("forehead_mark")
    bodies = load_rarity_values("body_type")
    torsos = load_rarity_values("clothing_torso")

    count = 0

    for head in heads:
        path = TRAITS_DIR / "heads" / slug(head) / "base.png"
        save_layer(draw_head_layer(head), path)
        count += 1

        for mask in masks:
            path = TRAITS_DIR / "masks" / slug(mask) / f"{slug(head)}.png"
            save_layer(draw_mask_layer(head, mask), path)
            count += 1

        for hair in hairs:
            path = TRAITS_DIR / "hair" / slug(hair) / f"{slug(head)}.png"
            save_layer(draw_hair_layer(head, hair), path)
            count += 1

    for eye in eyes:
        path = TRAITS_DIR / "eyes" / f"{slug(eye)}.png"
        save_layer(draw_eyes_layer(eye), path)
        count += 1

    for mark in marks:
        path = TRAITS_DIR / "marks" / f"{slug(mark)}.png"
        save_layer(draw_mark_layer(mark), path)
        count += 1

    for body in bodies:
        path = TRAITS_DIR / "bodies" / slug(body) / "base.png"
        save_layer(draw_body_layer(body), path)
        count += 1

        for torso in torsos:
            path = TRAITS_DIR / "clothing" / slug(body) / f"{slug(torso)}.png"
            save_layer(draw_clothing_layer(body, torso), path)
            count += 1

    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Phase 1 placeholder trait PNGs")
    parser.add_argument("--force", action="store_true", help="Overwrite existing layers")
    args = parser.parse_args()
    total = build_all()
    print(f"Wrote {total} placeholder trait layers under {TRAITS_DIR}")


if __name__ == "__main__":
    main()
