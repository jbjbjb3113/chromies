#!/usr/bin/env python3
"""Generate ChromaRendererCrc32.sol with embedded 256x4 lookup table.

CRC_IHDR/CRC_IEND are derived from the actual IHDR/IEND chunk bytes below
(not hand-pasted) specifically so they can never silently drift out of sync
with ChromaRendererPngLib.IHDR_DATA the way CRC_IHDR did previously (that
constant was a manually-computed literal for a height=0 IHDR -- see
ROBINHOOD_RENDERER_BUG.md). If you change the PNG's width/height/bit depth
here, re-run this script rather than hand-editing the .sol constants.
"""
import zlib
from pathlib import Path

GRID = 64  # must match ChromaRendererPngLib.GRID

hexstr = (Path(__file__).resolve().parents[1] / "generated" / "crc_table.hex").read_text().strip()
out = Path(__file__).resolve().parents[2] / "contracts" / "ChromaRendererCrc32.sol"

# IHDR data: width(4) height(4) bitDepth(1) colorType(1) compression(1) filter(1) interlace(1)
ihdr_data = GRID.to_bytes(4, "big") + GRID.to_bytes(4, "big") + bytes([4, 3, 0, 0, 0])
crc_ihdr = zlib.crc32(b"IHDR" + ihdr_data) & 0xFFFFFFFF
crc_iend = zlib.crc32(b"IEND") & 0xFFFFFFFF

lines = [
    "// SPDX-License-Identifier: MIT",
    "pragma solidity ^0.8.24;",
    "",
    "/// @notice Table-driven CRC32 + Adler32 for PNG zlib (Pass B.1 assembly path).",
    "library ChromaRendererCrc32 {",
    f"    // CRC32 over \"IHDR\" + width={GRID} height={GRID} bitDepth=4 colorType=3",
    "    // compression=0 filter=0 interlace=0. Derived by this script, not hand-pasted.",
    f"    uint32 internal constant CRC_IHDR = 0x{crc_ihdr:08x};",
    f"    uint32 internal constant CRC_IEND = 0x{crc_iend:08x};",
    "",
    "    function initTable(uint256 dest) internal pure {",
    '        assembly ("memory-safe") {',
]
for i in range(32):
    chunk = hexstr[i * 64 : (i + 1) * 64]
    lines.append(f"            mstore(add(dest, {i * 32}), 0x{chunk})")
lines += [
    "        }",
    "    }",
    "",
    "    function allocTable() internal pure returns (uint256 table) {",
    '        assembly ("memory-safe") {',
    "            table := mload(0x40)",
    "            mstore(0x40, add(table, 0x400))",
    "        }",
    "        initTable(table);",
    "    }",
    "",
    "    // initTable() packs 256 uint32 entries at 4-byte stride (8 entries per",
    "    // 32-byte mstore above). mload(add(table, shl(2, b))) therefore returns a",
    "    // 32-byte word whose HIGH 4 bytes are table[b] and whose low 28 bytes are",
    "    // the next 7 packed entries -- every lookup below MUST shr(224, ...) that",
    "    // mload result to isolate table[b]. Omitting the shr(224, ...) silently",
    "    // corrupts every CRC32 this library computes -- see ROBINHOOD_RENDERER_BUG.md.",
    "    //",
    "    // Also note: the running `crc` register must stay a clean 32-bit value.",
    "    // `not(0)` is 2**256-1 (all 256 bits set), NOT the 32-bit CRC32 seed",
    "    // 0xffffffff -- using the former polluted every accumulation with garbage",
    "    // in bits [32:255] that leaked into the low 32 bits via shr(8, crc) on",
    "    // every iteration. Seed with the literal 0xffffffff instead, and mask the",
    "    // final not(crc) back down to 32 bits before returning.",
    "",
    "    function crc32(uint256 table, bytes memory data) internal pure returns (uint32 result) {",
    '        assembly ("memory-safe") {',
    "            let crc := 0xffffffff",
    "            let ptr := add(data, 0x20)",
    "            let end := add(ptr, mload(data))",
    "            for {} lt(ptr, end) { ptr := add(ptr, 1) } {",
    "                let b := xor(and(crc, 0xff), byte(0, mload(ptr)))",
    "                crc := xor(shr(8, crc), shr(224, mload(add(table, shl(2, b)))))",
    "            }",
    "            result := and(not(crc), 0xffffffff)",
    "        }",
    "    }",
    "",
    "    function crc32Chunk(uint256 table, bytes4 chunkType, bytes memory data) internal pure returns (uint32 result) {",
    '        assembly ("memory-safe") {',
    "            let crc := 0xffffffff",
    "            let t := chunkType",
    "            for { let i := 0 } lt(i, 4) { i := add(i, 1) } {",
    "                // chunkType is bytes4 (left-aligned: byte 0 is bits [255:248]).",
    "                let b := xor(and(crc, 0xff), and(shr(sub(248, mul(8, i)), t), 0xff))",
    "                crc := xor(shr(8, crc), shr(224, mload(add(table, shl(2, b)))))",
    "            }",
    "            let ptr := add(data, 0x20)",
    "            let end := add(ptr, mload(data))",
    "            for {} lt(ptr, end) { ptr := add(ptr, 1) } {",
    "                let b := xor(and(crc, 0xff), byte(0, mload(ptr)))",
    "                crc := xor(shr(8, crc), shr(224, mload(add(table, shl(2, b)))))",
    "            }",
    "            result := and(not(crc), 0xffffffff)",
    "        }",
    "    }",
    "",
    "    /// @dev `chunkType` is intentionally UNUSED in the loop below -- every call",
    "    /// site (ChromaRendererPngLib._writePlteChunk/_writeIdatChunk) passes memPtr",
    "    /// pointing AT the chunk's 4 type bytes in memory with totalLen already",
    "    /// covering type+data together (matching the PNG spec's CRC32(type||data)),",
    "    /// so a separate type-mixing pass here would double-count the type bytes.",
    "    /// The parameter is kept for call-site self-documentation / a future",
    "    /// memPtr-past-type calling convention, but must not be mixed in here.",
    "    function crc32ChunkMem(uint256 table, bytes4, uint256 memPtr, uint256 totalLen)",
    "        internal",
    "        pure",
    "        returns (uint32 result)",
    "    {",
    '        assembly ("memory-safe") {',
    "            let crc := 0xffffffff",
    "            let end := add(memPtr, totalLen)",
    "            for {} lt(memPtr, end) { memPtr := add(memPtr, 1) } {",
    "                let b := xor(and(crc, 0xff), byte(0, mload(memPtr)))",
    "                crc := xor(shr(8, crc), shr(224, mload(add(table, shl(2, b)))))",
    "            }",
    "            result := and(not(crc), 0xffffffff)",
    "        }",
    "    }",
    "",
    "    function adler32(bytes memory data) internal pure returns (uint32 result) {",
    '        assembly ("memory-safe") {',
    "            let a := 1",
    "            let b := 0",
    "            let k := 0",
    "            let ptr := add(data, 0x20)",
    "            let end := add(ptr, mload(data))",
    "            for {} lt(ptr, end) { ptr := add(ptr, 1) } {",
    "                a := add(a, byte(0, mload(ptr)))",
    "                b := add(b, a)",
    "                k := add(k, 1)",
    "                if eq(k, 256) {",
    "                    a := mod(a, 65521)",
    "                    b := mod(b, 65521)",
    "                    k := 0",
    "                }",
    "            }",
    "            a := mod(a, 65521)",
    "            b := mod(b, 65521)",
    "            result := or(shl(16, b), a)",
    "        }",
    "    }",
    "}",
    "",
]

out.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {out} ({len(lines)} lines)")
