"""Validation context passed to art-pipeline validators."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ValidationContext:
    """Runtime context for compositor-aware validation."""

    palette_key: str = "SIGNAL"
    render_pipeline: str = "front_facing"
    forehead_mark_gated: bool = True
    mask_gated: bool = True
    gated_slots: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_compositor(cls, compositor_block: dict) -> ValidationContext:
        character = compositor_block.get("character") or {}
        gated = compositor_block.get("gated_slots") or {}
        return cls(
            palette_key=str(compositor_block.get("palette") or "SIGNAL"),
            render_pipeline=str(character.get("render_pipeline") or "front_facing"),
            forehead_mark_gated="forehead_mark" in gated,
            mask_gated=gated.get("mask", "").lower().find("none") >= 0 or True,
            gated_slots=dict(gated),
        )

    @property
    def is_side_profile(self) -> bool:
        return self.render_pipeline == "side_profile"
