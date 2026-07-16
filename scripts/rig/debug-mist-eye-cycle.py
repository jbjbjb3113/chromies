#!/usr/bin/env python3
"""Compare eye patch paints vs canonical token #1 render at eye coords."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SCRIPTS = REPO / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from anim._canonical_token_source import canonical_grid_for_token, load_mint_records  # noqa: E402

PATCHES = REPO / "src" / "pages" / "AwakenDemo" / "mist-eye-patches.json"
OUT = REPO / "out" / "rig"

GRID = 64


def main() -> None:
    patches = json.loads(PATCHES.read_text(encoding="utf-8"))
    mint_records = load_mint_records()
    base = canonical_grid_for_token(1, mint_records)
    rgb = base[:, :, :3].astype(np.uint8)
    img = Image.fromarray(rgb, mode="RGB")
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / "debug-token1-canonical-64.png")

    coords = [(p["x"], p["y"]) for p in patches["baselinePixels"] if p["x"] != 29]
    baseline_map = {(p["x"], p["y"]): p["rgba"][:3] for p in patches["baselinePixels"]}

    print("=== CHECK 4: canonical render vs patch baseline at eye coords ===")
    for x, y in coords:
        live = tuple(int(v) for v in rgb[y, x])
        patch = tuple(baseline_map.get((x, y), ()))
        match = live == patch
        print(f"  ({x},{y}) canonical={live} patch_baseline={patch} match={match}")

    print("\n=== CHECK 2/5: forced variant pixel changes on canonical ===")
    for name in patches["variants"]:
        out = rgb.copy()
        changed = []
        for p in patches["variants"][name]:
            x, y = p["x"], p["y"]
            before = tuple(int(v) for v in out[y, x])
            after = tuple(p["rgba"][:3])
            out[y, x] = after
            if before != after:
                changed.append({"coord": [x, y], "before": before, "after": after})
        Image.fromarray(out, mode="RGB").save(OUT / f"debug-token1-forced-{name}.png")
        print(f"  {name}: {len(changed)} changed pixels", changed[:4])

    # Simulate timer logic (15-30s intervals)
    print("\n=== CHECK 1: production timer params (15-30s, 90s wall) ===")
    import random

    random.seed(42)
    state = {"active": None, "next_ms": 0}
    events = []

    def schedule():
        return 15000 + random.random() * 15000

    state["next_ms"] = schedule()
    for ms in range(0, 90001, round(1000 / 12)):
        frame = ms * 12 // 1000
        if not state["active"] and ms >= state["next_ms"]:
            state["active"] = random.choice(list(patches["variants"].keys()))
            state["hold_until"] = frame + 24
            events.append({"t": ms, "frame": frame, "event": "start", "variant": state["active"]})
        elif state["active"] and frame >= state["hold_until"]:
            events.append({"t": ms, "frame": frame, "event": "end", "variant": state["active"]})
            state["active"] = None
            state["next_ms"] = ms + schedule()
    print(f"  swaps in 90s: {len([e for e in events if e['event']=='start'])}")
    for e in events:
        print(f"  {e}")


if __name__ == "__main__":
    main()
