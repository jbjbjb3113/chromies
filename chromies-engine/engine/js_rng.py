"""JavaScript-compatible deterministic RNG (mulberry32 + seedFromStr)."""

from __future__ import annotations

from typing import Callable


def seed_from_str(value: str) -> int:
    seed = 0
    for ch in value:
        seed = (seed * 31 + ord(ch)) & 0xFFFFFFFF
    if seed >= 0x80000000:
        seed -= 0x100000000
    return seed


def mulberry32(seed: int) -> Callable[[], float]:
    state = seed & 0xFFFFFFFF

    def rng() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = (t ^ ((t >> 15) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t = (t * (1 | t)) & 0xFFFFFFFF
        t = (t ^ ((t >> 7) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t = (t * (61 | t)) & 0xFFFFFFFF
        t = (t ^ ((t >> 14) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rng


def weighted_pick(variants: list[dict], rng: Callable[[], float]) -> dict:
    total = sum(float(v.get("weight") or 0) for v in variants)
    if total <= 0:
        return variants[-1]
    roll = rng() * total
    for variant in variants:
        roll -= float(variant.get("weight") or 0)
        if roll < 0:
            return variant
    return variants[-1]
