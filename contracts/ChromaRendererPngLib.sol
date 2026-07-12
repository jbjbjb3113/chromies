// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {ChromaRendererCrc32} from "./ChromaRendererCrc32.sol";

/// @notice Indexed PNG (4bpp, PLTE, zlib STORED) + SVG shell for tokenURI image field.
library ChromaRendererPngLib {
    uint256 internal constant GRID = 64;
    uint256 internal constant FILTERED_ROW = 33;
    uint256 internal constant RAW_IDAT_LEN = GRID * FILTERED_ROW;
    uint256 internal constant IDAT_PAYLOAD_LEN = 2 + 5 + RAW_IDAT_LEN + 4;
    uint256 internal constant PNG_LEN = 8 + 25 + 60 + 12 + IDAT_PAYLOAD_LEN + 12;

    uint256 internal constant OFF_IHDR = 8;
    uint256 internal constant OFF_PLTE = 33;
    uint256 internal constant OFF_IDAT = 93;
    uint256 internal constant OFF_IDAT_TYPE = 97;
    uint256 internal constant OFF_IDAT_DATA = 101;
    uint256 internal constant OFF_IEND = 2228;

    bytes internal constant PNG_SIG = hex"89504e470d0a1a0a";
    // width=64 (0x40), height=64 (0x40), bitDepth=4, colorType=3 (indexed),
    // compression=0, filter=0, interlace=0. Height was previously hardcoded
    // to 0x00000000 instead of 0x00000040 -- see ROBINHOOD_RENDERER_BUG.md.
    bytes internal constant IHDR_DATA = hex"00000040000000400403000000";

    bytes internal constant SVG_SHELL_PREFIX =
        bytes(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" image-rendering="pixelated"><image width="1024" height="1024" href="data:image/png;base64,'
        );
    bytes internal constant SVG_SHELL_SUFFIX = bytes('"/></svg>');

    struct RenderContext {
        bytes pixels;
        bytes3[16] paletteRgb;
        uint16[] diffIndexes;
        uint8[] diffColors;
    }

    struct PhaseGas {
        uint256 pixelPack;
        uint256 plteBuild;
        uint256 adler;
        uint256 crcRuntime;
        uint256 zlibFrame;
        uint256 pngAssemble;
    }

    function buildPng(RenderContext memory ctx) internal pure returns (bytes memory png) {
        png = new bytes(PNG_LEN);
        uint256 table = ChromaRendererCrc32.allocTable();

        for (uint256 i = 0; i < 8; ++i) {
            png[i] = PNG_SIG[i];
        }
        _writeU32(png, OFF_IHDR, 13);
        _writeType(png, OFF_IHDR + 4, "IHDR");
        for (uint256 i = 0; i < 13; ++i) {
            png[OFF_IHDR + 8 + i] = IHDR_DATA[i];
        }
        _writeU32(png, OFF_IHDR + 21, ChromaRendererCrc32.CRC_IHDR);

        _writePlteChunk(png, ctx.paletteRgb, table);
        bytes memory raw = _buildFilteredImage(ctx);
        _writeIdatChunk(png, raw, table);

        _writeU32(png, OFF_IEND, 0);
        _writeType(png, OFF_IEND + 4, "IEND");
        _writeU32(png, OFF_IEND + 8, ChromaRendererCrc32.CRC_IEND);
        raw;
    }

    function buildImageShellSvg(bytes memory png) internal pure returns (bytes memory) {
        return abi.encodePacked(SVG_SHELL_PREFIX, Base64.encode(png), SVG_SHELL_SUFFIX);
    }

    function profileCrcGas(RenderContext memory ctx) internal view returns (uint256 gasUsed) {
        bytes memory plte = _plteBytes(ctx.paletteRgb);
        bytes memory raw = _buildFilteredImage(ctx);
        bytes memory idatBody = _idatBody(raw);
        uint256 table = ChromaRendererCrc32.allocTable();
        uint256 g = gasleft();
        ChromaRendererCrc32.crc32Chunk(table, "PLTE", plte);
        ChromaRendererCrc32.crc32Chunk(table, "IDAT", idatBody);
        gasUsed = g - gasleft();
        raw;
        idatBody;
    }

    function profilePhases(RenderContext memory ctx) internal view returns (PhaseGas memory g) {
        uint256 mark = gasleft();
        bytes memory raw = _buildFilteredImage(ctx);
        g.pixelPack = mark - gasleft();

        mark = gasleft();
        bytes memory plte = _plteBytes(ctx.paletteRgb);
        g.plteBuild = mark - gasleft();

        mark = gasleft();
        uint32 adler = ChromaRendererCrc32.adler32(raw);
        g.adler = mark - gasleft();

        mark = gasleft();
        bytes memory idatBody = _idatBodyWithAdler(raw, adler);
        g.zlibFrame = mark - gasleft();

        mark = gasleft();
        uint256 table = ChromaRendererCrc32.allocTable();
        ChromaRendererCrc32.crc32Chunk(table, "PLTE", plte);
        ChromaRendererCrc32.crc32Chunk(table, "IDAT", idatBody);
        g.crcRuntime = mark - gasleft();

        mark = gasleft();
        bytes memory png = buildPng(ctx);
        g.pngAssemble = mark - gasleft();
        png;
        plte;
        idatBody;
        adler;
        raw;
    }

    function extractPlteRgb(bytes memory png) internal pure returns (bytes3[16] memory out) {
        uint256 i = 8;
        while (i + 12 <= png.length) {
            uint256 len = _readU32(png, i);
            bytes4 typ = bytes4(_readU32Bytes(png, i + 4));
            if (typ == "PLTE") {
                require(len == 48, "bad PLTE");
                for (uint8 c = 0; c < 16; ++c) {
                    uint256 p = i + 8 + uint256(c) * 3;
                    out[c] = bytes3(_readU24(png, p));
                }
                return out;
            }
            i += 12 + len;
        }
        revert("PLTE missing");
    }

    function paletteHexToRgb(string[16] memory paletteHex) internal pure returns (bytes3[16] memory rgb) {
        for (uint8 i = 0; i < 16; ++i) {
            rgb[i] = _parseHexColor(paletteHex[i]);
        }
    }

    function _writePlteChunk(bytes memory png, bytes3[16] memory palette, uint256 table) private pure {
        _writeU32(png, OFF_PLTE, 48);
        _writeType(png, OFF_PLTE + 4, "PLTE");
        for (uint8 i = 0; i < 16; ++i) {
            uint24 v = uint24(palette[i]);
            uint256 p = OFF_PLTE + 8 + uint256(i) * 3;
            png[p] = bytes1(uint8(v >> 16));
            png[p + 1] = bytes1(uint8(v >> 8));
            png[p + 2] = bytes1(uint8(v));
        }
        uint256 base;
        assembly ("memory-safe") {
            base := add(png, 0x20)
        }
        uint32 crc = ChromaRendererCrc32.crc32ChunkMem(table, "PLTE", base + OFF_PLTE + 4, 52);
        _writeU32(png, OFF_PLTE + 56, crc);
    }

    function _writeIdatChunk(bytes memory png, bytes memory raw, uint256 table) private pure {
        _writeU32(png, OFF_IDAT, IDAT_PAYLOAD_LEN);
        _writeType(png, OFF_IDAT + 4, "IDAT");
        uint32 adler = ChromaRendererCrc32.adler32(raw);
        _writeZlibStored(png, OFF_IDAT_DATA, raw, adler);
        uint256 base;
        assembly ("memory-safe") {
            base := add(png, 0x20)
        }
        uint32 crc = ChromaRendererCrc32.crc32ChunkMem(table, "IDAT", base + OFF_IDAT_TYPE, 4 + IDAT_PAYLOAD_LEN);
        _writeU32(png, OFF_IDAT_DATA + IDAT_PAYLOAD_LEN, crc);
    }

    function _writeType(bytes memory buf, uint256 offset, bytes4 chunkType) private pure {
        buf[offset] = chunkType[0];
        buf[offset + 1] = chunkType[1];
        buf[offset + 2] = chunkType[2];
        buf[offset + 3] = chunkType[3];
    }

    function _writeZlibStored(bytes memory png, uint256 offset, bytes memory raw, uint32 adler) private pure {
        png[offset] = 0x78;
        png[offset + 1] = 0x01;
        png[offset + 2] = 0x01;
        png[offset + 3] = bytes1(uint8(RAW_IDAT_LEN & 0xff));
        png[offset + 4] = bytes1(uint8(RAW_IDAT_LEN >> 8));
        uint16 nlen = uint16(~uint16(RAW_IDAT_LEN));
        png[offset + 5] = bytes1(uint8(nlen & 0xff));
        png[offset + 6] = bytes1(uint8(nlen >> 8));
        assembly ("memory-safe") {
            let dest := add(add(png, 0x20), add(offset, 7))
            let src := add(raw, 0x20)
            let i := 0
            for {} lt(i, 2112) { i := add(i, 0x20) } {
                mstore(add(dest, i), mload(add(src, i)))
            }
        }
        uint256 tail = offset + 7 + RAW_IDAT_LEN;
        png[tail] = bytes1(uint8(adler >> 24));
        png[tail + 1] = bytes1(uint8(adler >> 16));
        png[tail + 2] = bytes1(uint8(adler >> 8));
        png[tail + 3] = bytes1(uint8(adler));
    }

    function _idatBody(bytes memory raw) private pure returns (bytes memory body) {
        uint32 adler = ChromaRendererCrc32.adler32(raw);
        return _idatBodyWithAdler(raw, adler);
    }

    function _idatBodyWithAdler(bytes memory raw, uint32 adler) private pure returns (bytes memory body) {
        body = new bytes(IDAT_PAYLOAD_LEN);
        _writeZlibStored(body, 0, raw, adler);
    }

    function _parseHexColor(string memory hexColor) private pure returns (bytes3) {
        bytes memory h = bytes(hexColor);
        require(h.length == 7 && h[0] == "#", "bad hex");
        uint8 r = (_hexNibble(h[1]) << 4) | _hexNibble(h[2]);
        uint8 g = (_hexNibble(h[3]) << 4) | _hexNibble(h[4]);
        uint8 b = (_hexNibble(h[5]) << 4) | _hexNibble(h[6]);
        return bytes3(uint24(r) << 16 | uint24(g) << 8 | uint24(b));
    }

    function _hexNibble(bytes1 c) private pure returns (uint8) {
        uint8 v = uint8(c);
        if (v >= 48 && v <= 57) return v - 48;
        if (v >= 97 && v <= 102) return v - 87;
        if (v >= 65 && v <= 70) return v - 55;
        revert("hex");
    }

    function _buildFilteredImage(RenderContext memory ctx) private pure returns (bytes memory raw) {
        raw = new bytes(RAW_IDAT_LEN);
        uint256 diffLen = ctx.diffIndexes.length;
        if (diffLen == 0) {
            for (uint256 y = 0; y < GRID; ++y) {
                uint256 rowStart = y * FILTERED_ROW;
                raw[rowStart] = 0x00;
                uint256 rowBase = y * GRID;
                for (uint256 x = 0; x < GRID; x += 2) {
                    uint256 flat = rowBase + x;
                    uint8 packed = uint8(ctx.pixels[flat >> 1]);
                    uint8 left = (flat & 1) == 0 ? packed >> 4 : packed & 0x0f;
                    uint8 rightPacked = uint8(ctx.pixels[(flat + 1) >> 1]);
                    uint8 right = ((flat + 1) & 1) == 0 ? rightPacked >> 4 : rightPacked & 0x0f;
                    raw[rowStart + 1 + (x >> 1)] = bytes1((left << 4) | (right & 0x0f));
                }
            }
            return raw;
        }
        for (uint256 y = 0; y < GRID; ++y) {
            uint256 rowStart = y * FILTERED_ROW;
            raw[rowStart] = 0x00;
            for (uint256 x = 0; x < GRID; x += 2) {
                uint8 left = _getCompositePixelIndex(ctx, x, y);
                uint8 right = _getCompositePixelIndex(ctx, x + 1, y);
                raw[rowStart + 1 + (x >> 1)] = bytes1((left << 4) | (right & 0x0f));
            }
        }
    }

    function _plteBytes(bytes3[16] memory palette) private pure returns (bytes memory plte) {
        plte = new bytes(48);
        for (uint8 i = 0; i < 16; ++i) {
            uint24 v = uint24(palette[i]);
            uint256 p = uint256(i) * 3;
            plte[p] = bytes1(uint8(v >> 16));
            plte[p + 1] = bytes1(uint8(v >> 8));
            plte[p + 2] = bytes1(uint8(v));
        }
    }

    function _getCompositePixelIndex(RenderContext memory ctx, uint256 x, uint256 y)
        private
        pure
        returns (uint8)
    {
        if (ctx.diffIndexes.length > 0) {
            uint16 flatIndex = uint16(y * GRID + x);
            for (uint256 i = ctx.diffIndexes.length; i > 0; --i) {
                if (ctx.diffIndexes[i - 1] == flatIndex) return ctx.diffColors[i - 1];
            }
        }
        uint256 flat = y * GRID + x;
        uint8 packed = uint8(ctx.pixels[flat >> 1]);
        if ((flat & 1) == 0) return packed >> 4;
        return packed & 0x0f;
    }

    function _writeU32(bytes memory buf, uint256 offset, uint256 value) private pure {
        buf[offset] = bytes1(uint8(value >> 24));
        buf[offset + 1] = bytes1(uint8(value >> 16));
        buf[offset + 2] = bytes1(uint8(value >> 8));
        buf[offset + 3] = bytes1(uint8(value));
    }

    function _readU32(bytes memory buf, uint256 offset) private pure returns (uint256) {
        return (uint256(uint8(buf[offset])) << 24) | (uint256(uint8(buf[offset + 1])) << 16)
            | (uint256(uint8(buf[offset + 2])) << 8) | uint256(uint8(buf[offset + 3]));
    }

    function _readU32Bytes(bytes memory buf, uint256 offset) private pure returns (uint32) {
        return (uint32(uint8(buf[offset])) << 24) | (uint32(uint8(buf[offset + 1])) << 16)
            | (uint32(uint8(buf[offset + 2])) << 8) | uint32(uint8(buf[offset + 3]));
    }

    function _readU24(bytes memory buf, uint256 offset) private pure returns (uint24) {
        return (uint24(uint8(buf[offset])) << 16) | (uint24(uint8(buf[offset + 1])) << 8) | uint24(uint8(buf[offset + 2]));
    }
}
