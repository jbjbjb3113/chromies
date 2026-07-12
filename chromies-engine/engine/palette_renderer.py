"""Role-index extraction and palette rendering for Chromie compositor."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from engine.art_schema_loader import ArtSchemaBundle


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    dr, dg, db = a[0] - b[0], a[1] - b[1], a[2] - b[2]
    return dr * dr + dg * dg + db * db


def palette_colors_to_draw_colors(palette_colors: list[str], roles: list[str]) -> dict[str, str]:
    draw_colors: dict[str, str] = {}
    for i, hex_color in enumerate(palette_colors):
        key = hex_color.lower()
        if key not in draw_colors and i < len(roles):
            draw_colors[key] = roles[i]
    return draw_colors


def build_role_index(roles: list[str]) -> dict[str, int]:
    return {role: idx for idx, role in enumerate(roles)}


def resolve_extraction_draw_colors(
    slot: str,
    pick: dict[str, Any],
    character: dict[str, Any] | None,
    slot_def: dict[str, Any],
    schema: ArtSchemaBundle,
) -> dict[str, str]:
    variant = pick.get("variant") or {}
    file_ref = str(pick.get("file") or variant.get("file") or "")

    if character and character.get("name") == "Zombie" and "zombie/" in file_ref.replace("\\", "/").lower():
        return _zombie_draw_colors(schema)
    if character and character.get("name") == "Agent" and file_ref.replace("\\", "/").lower().startswith("agent/"):
        return _agent_draw_colors(schema)

    if variant.get("drawColors"):
        return {k.lower(): v for k, v in variant["drawColors"].items()}

    extraction_palette = variant.get("extractionPalette")
    if extraction_palette and extraction_palette in schema.palettes:
        colors = schema.palettes[extraction_palette]["colors"]
        return palette_colors_to_draw_colors(colors, schema.roles)

    slot_draw = slot_def.get("drawColors") or {}
    return {k.lower(): v for k, v in slot_draw.items()}


def _zombie_draw_colors(schema: ArtSchemaBundle) -> dict[str, str]:
    colors = schema.palettes["ZOMBIE"]["colors"]
    return palette_colors_to_draw_colors(colors, schema.roles)


def _agent_draw_colors(schema: ArtSchemaBundle) -> dict[str, str]:
    colors = schema.palettes["AGENT"]["colors"]
    return palette_colors_to_draw_colors(colors, schema.roles)


def extract_to_buffer(
    png_path: Path,
    draw_colors: dict[str, str],
    role_index: dict[str, int],
    *,
    grid: int,
    bg_knockout_threshold: int,
    skip_rgb_knockout: bool = False,
) -> np.ndarray | None:
    if not png_path.is_file():
        return None

    with Image.open(png_path) as im:
        rgba = im.convert("RGBA")
        if rgba.size != (grid, grid):
            return None
        arr = np.array(rgba, dtype=np.uint8)

    targets = []
    for hex_key, role in draw_colors.items():
        rgb = hex_to_rgb(hex_key)
        idx = role_index.get(role, 0)
        targets.append((rgb, idx))

    buf = np.zeros(grid * grid, dtype=np.uint8)
    for y in range(grid):
        for x in range(grid):
            r, g, b, a = arr[y, x]
            if a == 0:
                continue
            if (
                not skip_rgb_knockout
                and r <= bg_knockout_threshold
                and g <= bg_knockout_threshold
                and b <= bg_knockout_threshold
            ):
                continue
            best_idx = 0
            best_dist = 10**9
            for rgb, slot_idx in targets:
                dist = color_distance((int(r), int(g), int(b)), rgb)
                if dist < best_dist:
                    best_dist = dist
                    best_idx = slot_idx
            buf[y * grid + x] = best_idx
    return buf


def composite_layers(
    layers: list[tuple[int, np.ndarray | None]],
    grid: int,
) -> np.ndarray:
    buf = np.zeros(grid * grid, dtype=np.uint8)
    for _z, layer_buf in sorted(layers, key=lambda item: item[0]):
        if layer_buf is None:
            continue
        mask = layer_buf != 0
        buf[mask] = layer_buf[mask]
    return buf


def render_palette_png(
    role_buf: np.ndarray,
    palette_key: str,
    schema: ArtSchemaBundle,
    *,
    grid: int,
    transparent_index0: bool = False,
) -> np.ndarray:
    palette = schema.palettes[palette_key]
    colors = palette["colors"]
    rgba = np.zeros((grid, grid, 4), dtype=np.uint8)
    universal_bg = hex_to_rgb("#e3e5e4")

    for i in range(grid * grid):
        idx = int(role_buf[i])
        y, x = divmod(i, grid)
        if idx == 0:
            if transparent_index0:
                rgba[y, x] = (0, 0, 0, 0)
            else:
                rgba[y, x] = (*universal_bg, 255)
            continue
        hex_color = colors[idx] if idx < len(colors) else colors[0]
        r, g, b = hex_to_rgb(hex_color)
        rgba[y, x] = (r, g, b, 255)
    return rgba


def load_pick_buffers(
    picks: dict[str, dict[str, Any]],
    schema: ArtSchemaBundle,
    character: dict[str, Any] | None,
) -> None:
    role_index = build_role_index(schema.roles)
    grid = schema.grid
    threshold = schema.bg_knockout_threshold

    for slot, pick in picks.items():
        file_ref = pick.get("file")
        resolved = schema.path_resolver.resolve(str(file_ref))
        if resolved is None:
            pick["buffer"] = None
            continue
        slot_def = schema.slot_def(slot)
        draw_colors = resolve_extraction_draw_colors(slot, pick, character, slot_def, schema)
        file_ref_str = str(file_ref).replace("\\", "/")
        skip_knockout = (
            character
            and character.get("name") == "Zombie"
            and "zombie/" in file_ref_str.lower()
        ) or (
            character
            and character.get("name") == "Agent"
            and file_ref_str.lower().startswith("agent/")
        )
        pick["buffer"] = extract_to_buffer(
            resolved,
            draw_colors,
            role_index,
            grid=grid,
            bg_knockout_threshold=threshold,
            skip_rgb_knockout=skip_knockout,
        )
