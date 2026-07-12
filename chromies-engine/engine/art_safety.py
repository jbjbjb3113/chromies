"""Read-only guard for the canonical art-pipeline/components library."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

READ_ONLY_ART_ROOT = Path(r"X:\Cursor\Homies\art-pipeline\components").resolve()

STARTUP_BANNER = "Source Art Library: READ ONLY [OK]"


class ReadOnlyArtViolationError(PermissionError):
    """Raised when a script attempts to mutate canonical source art."""


def is_under_read_only_art(path: os.PathLike[str] | str) -> bool:
    try:
        resolved = Path(path).resolve()
    except (OSError, ValueError):
        return False
    try:
        resolved.relative_to(READ_ONLY_ART_ROOT)
        return True
    except ValueError:
        return False


def assert_read_only_art(path: os.PathLike[str] | str, operation: str = "write") -> None:
    if is_under_read_only_art(path):
        raise ReadOnlyArtViolationError(
            f"Refusing to {operation} inside read-only art root: {READ_ONLY_ART_ROOT}\n"
            f"Target: {Path(path).resolve()}"
        )


def compute_art_library_hash(root: Path | None = None) -> str:
    """Deterministic hash over all files under the source art root."""
    art_root = (root or READ_ONLY_ART_ROOT).resolve()
    if not art_root.is_dir():
        raise FileNotFoundError(f"Source art root not found: {art_root}")

    digest = hashlib.sha256()
    paths = sorted(p for p in art_root.rglob("*") if p.is_file())
    for path in paths:
        rel = path.relative_to(art_root).as_posix().encode("utf-8")
        digest.update(rel)
        digest.update(path.read_bytes())
    return digest.hexdigest()


class ReadOnlyArtGuard:
    """Snapshot and verify integrity of the immutable source art library."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or READ_ONLY_ART_ROOT).resolve()
        self._before_hash: str | None = None
        self._after_hash: str | None = None
        self.file_count: int = 0

    @staticmethod
    def print_startup_banner() -> None:
        print(STARTUP_BANNER)

    def snapshot_before(self) -> str:
        self._before_hash = compute_art_library_hash(self.root)
        self.file_count = sum(1 for p in self.root.rglob("*") if p.is_file())
        return self._before_hash

    def snapshot_after(self) -> str:
        self._after_hash = compute_art_library_hash(self.root)
        return self._after_hash

    def verify_unchanged(self) -> None:
        after = self.snapshot_after()
        if self._before_hash is None:
            raise ReadOnlyArtViolationError(
                "Cannot verify source art integrity — call snapshot_before() first."
            )
        if after != self._before_hash:
            raise ReadOnlyArtViolationError(
                "Source art library changed during operation.\n"
                f"  before: {self._before_hash}\n"
                f"  after:  {after}\n"
                f"  root:   {self.root}"
            )

    @property
    def before_hash(self) -> str | None:
        return self._before_hash

    @property
    def after_hash(self) -> str | None:
        return self._after_hash


def safe_open(path: os.PathLike[str] | str, mode: str = "r", **kwargs):
    if "w" in mode or "a" in mode or "x" in mode:
        assert_read_only_art(path, operation=f"open(mode={mode!r})")
    return open(path, mode, **kwargs)  # noqa: SIM115


def safe_write_text(path: os.PathLike[str] | str, *args, **kwargs) -> None:
    assert_read_only_art(path, operation="write_text")
    Path(path).write_text(*args, **kwargs)


def safe_write_bytes(path: os.PathLike[str] | str, *args, **kwargs) -> None:
    assert_read_only_art(path, operation="write_bytes")
    Path(path).write_bytes(*args, **kwargs)


def safe_unlink(path: os.PathLike[str] | str, *args, **kwargs) -> None:
    assert_read_only_art(path, operation="delete")
    Path(path).unlink(*args, **kwargs)


def safe_rename(src: os.PathLike[str] | str, dst: os.PathLike[str] | str, *args, **kwargs) -> None:
    assert_read_only_art(src, operation="rename (source)")
    assert_read_only_art(dst, operation="rename (destination)")
    Path(src).rename(dst, *args, **kwargs)


def safe_makedirs(path: os.PathLike[str] | str, *args, **kwargs) -> None:
    assert_read_only_art(path, operation="makedirs")
    Path(path).mkdir(*args, **kwargs)
