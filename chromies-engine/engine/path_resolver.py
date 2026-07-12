"""Case-insensitive read-only component path resolution."""

from __future__ import annotations

import re
from pathlib import Path

from engine.art_safety import READ_ONLY_ART_ROOT

NORMIE_PATTERN = re.compile(r"normie", re.I)


class PathResolver:
    def __init__(self, art_root: Path | None = None) -> None:
        self.art_root = (art_root or READ_ONLY_ART_ROOT).resolve()
        self._lookup: dict[str, str] = {}
        self._build_index()

    def _build_index(self) -> None:
        if not self.art_root.is_dir():
            return
        for path in self.art_root.rglob("*.png"):
            rel = str(path.relative_to(self.art_root)).replace("\\", "/")
            self._lookup[rel.lower()] = rel

    def resolve(self, file_ref: str) -> Path | None:
        if not file_ref:
            return None
        norm = file_ref.replace("\\", "/")
        canonical = self._lookup.get(norm.lower())
        if canonical is None:
            return None
        return self.art_root / Path(canonical)

    def exists(self, file_ref: str) -> bool:
        return self.resolve(file_ref) is not None

    def canonical_ref(self, file_ref: str) -> str | None:
        norm = file_ref.replace("\\", "/")
        return self._lookup.get(norm.lower())

    @staticmethod
    def is_normie_named(*parts: str) -> bool:
        return any(NORMIE_PATTERN.search(part or "") for part in parts)
