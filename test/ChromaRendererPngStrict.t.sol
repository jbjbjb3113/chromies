// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaRendererPngLib} from "../contracts/ChromaRendererPngLib.sol";
import {ChromaRendererCrc32} from "../contracts/ChromaRendererCrc32.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {TraitFixtures, WriterCaller} from "./Chroma.t.sol";
import {ChromaFixtures} from "./ChromaFixtures.sol";

/// @notice Spec-enforcing decode of the assembled on-chain PNG, added after the
/// IHDR height=0 bug (see ROBINHOOD_RENDERER_BUG.md) shipped undetected through
/// every prior test because they only ever hashed/pixel-diffed a render against
/// ANOTHER render of the same code path. A malformed-but-self-consistent PNG
/// always passes a hash-vs-self check; it does NOT always pass a real decode.
///
/// These checks independently re-parse the PNG chunk stream (not trusting the
/// library's own offset constants) and recompute every embedded CRC32, so a
/// regression in IHDR/PLTE/IDAT/IEND assembly cannot slip through as long as
/// this file is part of CI. Hash-vs-self MUST NOT be the only render check —
/// pair it with `_assertPngSpec` whenever a new render-output test is added.
contract ChromaRendererPngStrictTest is Test {
    WriterCaller internal writer;
    ChromaStorage internal storageContract;
    ChromaRenderer internal renderer;

    function setUp() public {
        writer = new WriterCaller();
        storageContract = new ChromaStorage(address(this), address(writer));
        renderer = ChromaFixtures.deployRendererOnly(storageContract, address(this));
    }

    function test_PngSpec_SparseSeed() public {
        _writeSparseFixture(1);
        _assertPngSpec(1);
    }

    function test_PngSpec_DenseCeiling() public {
        _writeDenseFixture(999_002);
        _assertPngSpec(999_002);
    }

    /// @dev IHDR_DATA regression guard: this test would have failed on the
    /// pre-fix constant (height encoded as 0x00000000).
    function test_IhdrHeightIsNotZero() public pure {
        bytes memory ihdr = ChromaRendererPngLib.IHDR_DATA;
        uint256 height = (uint256(uint8(ihdr[4])) << 24) | (uint256(uint8(ihdr[5])) << 16)
            | (uint256(uint8(ihdr[6])) << 8) | uint256(uint8(ihdr[7]));
        assertEq(height, 64, "IHDR height must be 64, not 0");
    }

    function _writeSparseFixture(uint256 tokenId) internal {
        bytes memory pixels = new bytes(2048);
        pixels[0] = 0x12;
        writer.write(storageContract, tokenId, pixels, TraitFixtures.traitsWithTotalPixels(1));
    }

    function _writeDenseFixture(uint256 tokenId) internal {
        bytes memory pixels = new bytes(2048);
        for (uint256 y = 0; y < 64; ++y) {
            for (uint256 x = 0; x < 64; ++x) {
                uint8 idx = uint8(1 + ((x + y) % 14));
                _setPixel(pixels, x, y, idx);
            }
        }
        writer.write(storageContract, tokenId, pixels, TraitFixtures.traitsWithTotalPixels(4096));
    }

    function _setPixel(bytes memory packedPixels, uint256 x, uint256 y, uint8 value) internal pure {
        uint256 flatIndex = y * 64 + x;
        uint256 byteIndex = flatIndex >> 1;
        uint8 current = uint8(packedPixels[byteIndex]);
        if ((flatIndex & 1) == 0) {
            packedPixels[byteIndex] = bytes1((current & 0x0f) | (value << 4));
        } else {
            packedPixels[byteIndex] = bytes1((current & 0xf0) | value);
        }
    }

    /// @dev Independently walks the chunk stream (signature, IHDR fields,
    /// per-chunk CRC32, IEND) rather than relying on ChromaRendererPngLib's
    /// own offset constants, so a bug in those constants cannot self-certify.
    function _assertPngSpec(uint256 tokenId) internal {
        (, bytes memory png,,,) = renderer.profileRenderParts(tokenId);

        assertEq(_readBytes8(png, 0), bytes8(hex"89504e470d0a1a0a"), "PNG signature");

        uint256 i = 8;
        bool sawIhdr = false;
        bool sawIend = false;
        uint256 table = ChromaRendererCrc32.allocTable();

        while (i + 12 <= png.length) {
            uint256 len = _readU32(png, i);
            bytes4 chunkType = bytes4(_readU32Bytes(png, i + 4));
            bytes memory data = _slice(png, i + 8, i + 8 + len);
            uint32 embeddedCrc = uint32(_readU32(png, i + 8 + len));
            // NOTE: deliberately NOT using ChromaRendererCrc32.crc32Chunk here —
            // that helper's chunk-type byte-mixing reads the wrong bit range for
            // a left-aligned bytes4 (only exercised by the diagnostic-only
            // profileCrcGas/profilePhases gas-profiling hooks, not the production
            // render path, which uses crc32ChunkMem instead). Using the plain,
            // straightforwardly-correct crc32(bytes) primitive over type+data
            // keeps this test's own oracle independent of that bug.
            uint32 computedCrc = ChromaRendererCrc32.crc32(table, abi.encodePacked(chunkType, data));
            assertEq(computedCrc, embeddedCrc, string.concat("CRC mismatch on chunk at offset ", vm.toString(i)));

            if (chunkType == bytes4("IHDR")) {
                sawIhdr = true;
                assertEq(i, 8, "IHDR must be the first chunk");
                assertEq(len, 13, "IHDR length must be 13");
                uint256 width = _readU32(data, 0);
                uint256 height = _readU32(data, 4);
                uint8 bitDepth = uint8(data[8]);
                uint8 colorType = uint8(data[9]);
                assertEq(width, 64, "IHDR width");
                assertEq(height, 64, "IHDR height");
                assertEq(bitDepth, 4, "IHDR bitDepth");
                assertEq(colorType, 3, "IHDR colorType (indexed)");
            }
            if (chunkType == bytes4("IEND")) {
                sawIend = true;
                assertEq(len, 0, "IEND must be empty");
                assertEq(i + 12, png.length, "IEND must be the last chunk");
            }

            i += 12 + len;
        }

        assertEq(i, png.length, "chunk stream must exactly cover the file");
        assertTrue(sawIhdr, "IHDR chunk missing");
        assertTrue(sawIend, "IEND chunk missing");
    }

    function _readBytes8(bytes memory buf, uint256 offset) private pure returns (bytes8 out) {
        for (uint256 i = 0; i < 8; ++i) {
            out |= bytes8(bytes1(buf[offset + i])) >> (i * 8);
        }
    }

    function _readU32(bytes memory buf, uint256 offset) private pure returns (uint256) {
        return (uint256(uint8(buf[offset])) << 24) | (uint256(uint8(buf[offset + 1])) << 16)
            | (uint256(uint8(buf[offset + 2])) << 8) | uint256(uint8(buf[offset + 3]));
    }

    function _readU32Bytes(bytes memory buf, uint256 offset) private pure returns (uint32) {
        return (uint32(uint8(buf[offset])) << 24) | (uint32(uint8(buf[offset + 1])) << 16)
            | (uint32(uint8(buf[offset + 2])) << 8) | uint32(uint8(buf[offset + 3]));
    }

    function _slice(bytes memory data, uint256 start, uint256 end) private pure returns (bytes memory out) {
        out = new bytes(end - start);
        for (uint256 i = 0; i < out.length; ++i) out[i] = data[start + i];
    }
}
