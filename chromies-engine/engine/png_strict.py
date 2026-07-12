"""Spec-enforcing PNG validation.

Added after the ChromaRendererPngLib IHDR height=0 bug (see
ROBINHOOD_RENDERER_BUG.md): every prior "parity" check compared a rendered
PNG's bytes/hash against ANOTHER rendering of the same (buggy) code path, so a
malformed-but-self-consistent PNG always "passed". This module instead
decodes the PNG against the actual PNG spec (chunk structure, CRC32 over each
chunk, and PIL's own `Image.verify()` / `Image.load()`) so a header bug like
the height field can never again slip through undetected.

Hash-vs-self comparisons are still useful for regression detection, but per
the corrected-renderer ruling they must never be the *only* check — every
render exercised by tests or by a live money-test should also pass
`validate_png_strict()`.
"""
from __future__ import annotations

import io
import struct
import zlib
from dataclasses import dataclass

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class PngValidationError(ValueError):
    pass


@dataclass
class PngChunk:
    chunk_type: bytes
    data: bytes
    crc: int


def _iter_chunks(png_bytes: bytes):
    if png_bytes[:8] != PNG_SIGNATURE:
        raise PngValidationError(f"bad PNG signature: {png_bytes[:8]!r}")
    i = 8
    n = len(png_bytes)
    while i + 12 <= n:
        length = int.from_bytes(png_bytes[i : i + 4], "big")
        chunk_type = png_bytes[i + 4 : i + 8]
        data_start = i + 8
        data_end = data_start + length
        if data_end + 4 > n:
            raise PngValidationError(f"chunk {chunk_type!r} declares length {length} past end of file")
        data = png_bytes[data_start:data_end]
        crc = int.from_bytes(png_bytes[data_end : data_end + 4], "big")
        yield PngChunk(chunk_type, data, crc)
        i = data_end + 4
    if i != n:
        raise PngValidationError(f"{n - i} trailing bytes after last chunk")


def validate_png_strict(
    png_bytes: bytes,
    *,
    expected_width: int = 64,
    expected_height: int = 64,
    expected_bit_depth: int = 4,
    expected_color_type: int = 3,
) -> dict:
    """Fully validate a PNG against spec. Raises PngValidationError on any
    violation. Returns a dict of parsed IHDR fields on success.

    Checks performed (all of them, not just one):
      1. PNG signature bytes.
      2. Chunk stream is well-formed (lengths sum to the file, no overrun).
      3. IHDR is the first chunk, exactly 13 bytes, with the expected
         width/height/bitDepth/colorType/compression/filter/interlace.
      4. CRC32 of every chunk (type + data) matches its trailing CRC field —
         this is the check that a hash-vs-self comparison can NEVER provide,
         since a self-consistent-but-wrong-header PNG always hashes stably.
      5. IEND is present, empty, and last.
      6. PIL can open AND verify() the image (structural decode, not just
         "some bytes"), and PIL's own reported size matches expectations.
    """
    chunks = list(_iter_chunks(png_bytes))
    if not chunks:
        raise PngValidationError("no chunks found")
    if chunks[0].chunk_type != b"IHDR":
        raise PngValidationError(f"first chunk is {chunks[0].chunk_type!r}, expected IHDR")

    ihdr = chunks[0]
    if len(ihdr.data) != 13:
        raise PngValidationError(f"IHDR length {len(ihdr.data)} != 13")
    width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(
        ">IIBBBBB", ihdr.data
    )
    if width != expected_width:
        raise PngValidationError(f"IHDR width {width} != {expected_width}")
    if height != expected_height:
        raise PngValidationError(f"IHDR height {height} != {expected_height}")
    if bit_depth != expected_bit_depth:
        raise PngValidationError(f"IHDR bitDepth {bit_depth} != {expected_bit_depth}")
    if color_type != expected_color_type:
        raise PngValidationError(f"IHDR colorType {color_type} != {expected_color_type}")
    if compression != 0 or filter_method != 0 or interlace != 0:
        raise PngValidationError(
            f"IHDR compression/filter/interlace = {compression}/{filter_method}/{interlace}, expected 0/0/0"
        )

    for chunk in chunks:
        computed = zlib.crc32(chunk.chunk_type + chunk.data) & 0xFFFFFFFF
        if computed != chunk.crc:
            raise PngValidationError(
                f"CRC mismatch on {chunk.chunk_type!r}: computed 0x{computed:08x} != embedded 0x{chunk.crc:08x}"
            )

    if chunks[-1].chunk_type != b"IEND":
        raise PngValidationError(f"last chunk is {chunks[-1].chunk_type!r}, expected IEND")
    if chunks[-1].data:
        raise PngValidationError("IEND has non-empty data")

    try:
        from PIL import Image
    except ImportError as exc:
        raise PngValidationError("Pillow (PIL) is required for strict PNG validation") from exc

    img = Image.open(io.BytesIO(png_bytes))
    img.verify()
    # verify() invalidates the image object for further loads in some Pillow
    # versions; reopen for the pixel-load sanity pass.
    img = Image.open(io.BytesIO(png_bytes))
    img.load()
    if img.size != (expected_width, expected_height):
        raise PngValidationError(f"PIL reports size {img.size} != ({expected_width}, {expected_height})")

    return {
        "width": width,
        "height": height,
        "bit_depth": bit_depth,
        "color_type": color_type,
        "pil_mode": img.mode,
        "pil_size": img.size,
    }
