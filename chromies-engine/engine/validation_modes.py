"""Validation mode definitions and art-pipeline thresholds."""

from __future__ import annotations

import json
from enum import Enum
from functools import lru_cache
from typing import Any

from engine.config import ENGINE_DATA_DIR, THRESHOLDS_VERSION


class ValidationMode(str, Enum):
    LENIENT = "lenient"
    ART_PIPELINE = "art_pipeline"
    STRICT = "strict"

    @classmethod
    def from_str(cls, value: str | None) -> ValidationMode:
        if value is None:
            return cls.ART_PIPELINE
        normalized = value.strip().lower()
        for mode in cls:
            if mode.value == normalized:
                return mode
        raise ValueError(f"Unknown validation mode: {value!r}. Use lenient, art_pipeline, or strict.")


DEFAULT_VALIDATION_MODE = ValidationMode.ART_PIPELINE


@lru_cache(maxsize=1)
def load_thresholds() -> dict[str, Any]:
    path = ENGINE_DATA_DIR / "validation_thresholds.json"
    if path.is_file():
        data = json.loads(path.read_text(encoding="utf-8"))
        data["version"] = data.get("version", THRESHOLDS_VERSION)
        return data
    return _builtin_thresholds()


def _builtin_thresholds() -> dict[str, Any]:
    return {
        "version": THRESHOLDS_VERSION,
        "modes": {
            "lenient": {
                "pixel": {
                    "max_orphans": 999,
                    "max_non_binary_alpha": 999,
                    "fail_on_edge_touch": False,
                },
                "palette": {
                    "max_distinct_colors": 64,
                    "min_distinct_hues": 1,
                    "require_in_palette": False,
                },
                "silhouette": {
                    "min_bbox_width": 10,
                    "max_bbox_width": 64,
                    "min_bbox_height": 20,
                    "max_bbox_height": 64,
                    "min_asymmetry_pct": 0.0,
                    "min_defects": 0,
                    "require_width_breaks": False,
                    "allow_full_canvas_bbox": True,
                    "check_forehead_mark": False,
                    "check_mask_zone": False,
                },
                "side_profile": {
                    "min_bbox_width": 10,
                    "max_bbox_width": 64,
                    "min_bbox_height": 20,
                    "max_bbox_height": 64,
                    "min_asymmetry_pct": 0.0,
                    "min_defects": 0,
                    "require_width_breaks": False,
                    "allow_full_canvas_bbox": True,
                },
            },
            "art_pipeline": {
                "pixel": {
                    "max_orphans": 0,
                    "max_non_binary_alpha": 0,
                    "fail_on_edge_touch": False,
                    "full_canvas_opaque_pixels": 4096,
                },
                "palette": {
                    "max_distinct_colors": 24,
                    "min_distinct_hues": 1,
                    "require_in_palette": True,
                },
                "silhouette": {
                    "min_bbox_width": 18,
                    "max_bbox_width": 64,
                    "min_bbox_height": 28,
                    "max_bbox_height": 64,
                    "min_asymmetry_pct": 0.0,
                    "min_defects": 1,
                    "require_width_breaks": False,
                    "allow_full_canvas_bbox": True,
                    "check_forehead_mark": False,
                    "check_mask_zone": False,
                },
                "side_profile": {
                    "min_bbox_width": 16,
                    "max_bbox_width": 64,
                    "min_bbox_height": 24,
                    "max_bbox_height": 64,
                    "min_asymmetry_pct": 0.0,
                    "min_defects": 0,
                    "require_width_breaks": False,
                    "allow_full_canvas_bbox": True,
                },
            },
            "strict": {
                "pixel": {
                    "max_orphans": 0,
                    "max_non_binary_alpha": 0,
                    "fail_on_edge_touch": True,
                },
                "palette": {
                    "max_distinct_colors": 16,
                    "min_distinct_hues": 3,
                    "require_in_palette": True,
                },
                "silhouette": {
                    "min_bbox_width": 30,
                    "max_bbox_width": 46,
                    "min_bbox_height": 48,
                    "max_bbox_height": 60,
                    "min_asymmetry_pct": 8.0,
                    "min_defects": 3,
                    "max_defects": 7,
                    "require_width_breaks": True,
                    "allow_full_canvas_bbox": False,
                    "check_forehead_mark": True,
                    "check_mask_zone": True,
                },
                "side_profile": {
                    "min_bbox_width": 24,
                    "max_bbox_width": 56,
                    "min_bbox_height": 36,
                    "max_bbox_height": 64,
                    "min_asymmetry_pct": 4.0,
                    "min_defects": 1,
                    "require_width_breaks": False,
                    "allow_full_canvas_bbox": True,
                },
            },
        },
    }


def mode_thresholds(mode: ValidationMode) -> dict[str, Any]:
    table = load_thresholds()
    return table["modes"][mode.value]
