"""Ensure canonical art library is never written by engine helpers."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from engine.art_safety import (
    READ_ONLY_ART_ROOT,
    STARTUP_BANNER,
    ReadOnlyArtGuard,
    ReadOnlyArtViolationError,
    assert_read_only_art,
    compute_art_library_hash,
    safe_write_bytes,
    safe_write_text,
)


def test_read_only_art_root_points_at_components() -> None:
    assert READ_ONLY_ART_ROOT.name == "components"
    assert READ_ONLY_ART_ROOT.is_dir()


def test_blocks_write_inside_components() -> None:
    target = READ_ONLY_ART_ROOT / "_cursor_write_test.png"
    with pytest.raises(ReadOnlyArtViolationError):
        safe_write_bytes(target, b"blocked")
    with pytest.raises(ReadOnlyArtViolationError):
        safe_write_text(target, "blocked")
    with pytest.raises(ReadOnlyArtViolationError):
        assert_read_only_art(target, operation="write")


def test_allows_write_outside_components() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "ok.txt"
        safe_write_text(path, "allowed")
        assert path.read_text(encoding="utf-8") == "allowed"


def test_art_library_hash_is_stable() -> None:
    first = compute_art_library_hash()
    second = compute_art_library_hash()
    assert first == second
    assert len(first) == 64


def test_read_only_art_guard_detects_unchanged() -> None:
    guard = ReadOnlyArtGuard()
    before = guard.snapshot_before()
    guard.verify_unchanged()
    assert guard.snapshot_after() == before


def test_startup_banner_text() -> None:
    assert "READ ONLY" in STARTUP_BANNER
