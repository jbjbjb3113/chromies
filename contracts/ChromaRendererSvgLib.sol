// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library ChromaRendererSvgLib {
    uint256 internal constant GRID = 64;
    uint256 internal constant CELL = 16;
    uint256 internal constant PATH_OPEN_BYTES = 12; // <path fill="
    uint256 internal constant PATH_MID_BYTES = 5; // " d="
    uint256 internal constant PATH_SUFFIX_BYTES = 2; // "/>
    bytes internal constant SVG_PREFIX =
        bytes(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" shape-rendering="crispEdges"><path fill="'
        );
    bytes internal constant SVG_MID = bytes('" d="M0,0h1024v1024h-1024z"/>');
    bytes internal constant SVG_SUFFIX = bytes("</svg>");

    struct SvgRenderContext {
        uint256 tokenId;
        bytes pixels;
        string[16] palette;
        uint16[] diffIndexes;
        uint8[] diffColors;
    }

    struct RunRecord {
        uint8 x;
        uint8 y;
        uint8 run;
        uint8 color;
    }

    function buildBody(SvgRenderContext memory ctx) internal pure returns (bytes memory) {
        (uint256 runCount, uint256 bodySize) = _scanMeta(ctx);
        if (runCount == 0) {
            return new bytes(0);
        }
        RunRecord[] memory runs = new RunRecord[](runCount);
        _fillRuns(ctx, runs);
        bytes memory body = new bytes(bodySize);
        uint256 written = _writeBodyFromRuns(body, 0, ctx, runs, runCount);
        assembly ("memory-safe") {
            mstore(body, written)
        }
        return body;
    }

    function buildSvgBytes(SvgRenderContext memory ctx) internal pure returns (bytes memory) {
        (uint256 runCount, uint256 bodySize) = _scanMeta(ctx);
        bytes memory bg = bytes(ctx.palette[0]);
        uint256 totalSize = SVG_PREFIX.length + bg.length + SVG_MID.length + bodySize + SVG_SUFFIX.length;
        bytes memory svg = new bytes(totalSize);
        uint256 offset;
        offset = _copyBytes(svg, offset, SVG_PREFIX);
        offset = _copyBytes(svg, offset, bg);
        offset = _copyBytes(svg, offset, SVG_MID);
        if (runCount > 0) {
            RunRecord[] memory runs = new RunRecord[](runCount);
            _fillRuns(ctx, runs);
            offset = _writeBodyFromRuns(svg, offset, ctx, runs, runCount);
        }
        offset = _copyBytes(svg, offset, SVG_SUFFIX);
        assembly ("memory-safe") {
            mstore(svg, offset)
        }
        return svg;
    }

    function wrapSvg(string memory background, bytes memory body) internal pure returns (string memory) {
        bytes memory svg = abi.encodePacked(
            SVG_PREFIX,
            bytes(background),
            SVG_MID,
            body,
            SVG_SUFFIX
        );
        return string(svg);
    }

    function countRuns(SvgRenderContext memory ctx) internal pure returns (uint256 runCount) {
        (runCount,) = _scanMeta(ctx);
    }

    function _scanMeta(SvgRenderContext memory ctx)
        private
        pure
        returns (uint256 runCount, uint256 bodySize)
    {
        bool[16] memory seen;
        for (uint256 y = 0; y < GRID; ++y) {
            uint256 x = 0;
            while (x < GRID) {
                uint8 idx = _getCompositePixelIndex(ctx.pixels, x, y, ctx.diffIndexes, ctx.diffColors);
                uint256 run = 1;
                while (x + run < GRID) {
                    uint8 nextIdx =
                        _getCompositePixelIndex(ctx.pixels, x + run, y, ctx.diffIndexes, ctx.diffColors);
                    if (nextIdx != idx) break;
                    ++run;
                }
                if (idx != 0) {
                    ++runCount;
                    seen[idx] = true;
                    bodySize += _measureRunBytes(uint256(x) * CELL, uint256(y) * CELL, run * CELL);
                }
                x += run;
            }
        }
        for (uint8 colorIdx = 1; colorIdx < 16; ++colorIdx) {
            if (!seen[colorIdx]) continue;
            bodySize += PATH_OPEN_BYTES + bytes(ctx.palette[colorIdx]).length + PATH_MID_BYTES + PATH_SUFFIX_BYTES;
        }
    }

    function _fillRuns(SvgRenderContext memory ctx, RunRecord[] memory runs) private pure {
        uint256 runCount;
        for (uint256 y = 0; y < GRID; ++y) {
            uint256 x = 0;
            while (x < GRID) {
                uint8 idx = _getCompositePixelIndex(ctx.pixels, x, y, ctx.diffIndexes, ctx.diffColors);
                uint256 run = 1;
                while (x + run < GRID) {
                    uint8 nextIdx =
                        _getCompositePixelIndex(ctx.pixels, x + run, y, ctx.diffIndexes, ctx.diffColors);
                    if (nextIdx != idx) break;
                    ++run;
                }
                if (idx != 0) {
                    runs[runCount] = RunRecord(uint8(x), uint8(y), uint8(run), idx);
                    ++runCount;
                }
                x += run;
            }
        }
    }

    function _writeBodyFromRuns(
        bytes memory body,
        uint256 offset,
        SvgRenderContext memory ctx,
        RunRecord[] memory runs,
        uint256 runCount
    ) private pure returns (uint256) {
        bool[16] memory seen;
        for (uint256 i = 0; i < runCount; ++i) {
            seen[runs[i].color] = true;
        }
        for (uint8 colorIdx = 1; colorIdx < 16; ++colorIdx) {
            if (!seen[colorIdx]) continue;
            offset = _writeLiteral(body, offset, '<path fill="');
            offset = _writeString(body, offset, ctx.palette[colorIdx]);
            offset = _writeLiteral(body, offset, '" d="');
            for (uint256 i = 0; i < runCount; ++i) {
                if (runs[i].color != colorIdx) continue;
                offset = _writeRunPath(
                    body,
                    offset,
                    uint256(runs[i].x) * CELL,
                    uint256(runs[i].y) * CELL,
                    uint256(runs[i].run) * CELL
                );
            }
            offset = _writeLiteral(body, offset, '"/>');
        }
        return offset;
    }

    function _measureRunBytes(uint256 x, uint256 y, uint256 width) private pure returns (uint256) {
        return 1 + _decimalLength(x) + 1 + _decimalLength(y) + 1 + _decimalLength(width) + 5 + 1
            + _decimalLength(width) + 1;
    }

    function _writeRunPath(bytes memory body, uint256 offset, uint256 x, uint256 y, uint256 width)
        private
        pure
        returns (uint256)
    {
        offset = _writeChar(body, offset, "M");
        offset = _writeUint(body, offset, x);
        offset = _writeChar(body, offset, ",");
        offset = _writeUint(body, offset, y);
        offset = _writeChar(body, offset, "h");
        offset = _writeUint(body, offset, width);
        offset = _writeLiteral(body, offset, "v16h-");
        offset = _writeUint(body, offset, width);
        offset = _writeChar(body, offset, "z");
        return offset;
    }

    function _decimalLength(uint256 value) private pure returns (uint256) {
        if (value == 0) return 1;
        uint256 len;
        while (value != 0) {
            ++len;
            value /= 10;
        }
        return len;
    }

    function _writeUint(bytes memory body, uint256 offset, uint256 value) private pure returns (uint256) {
        if (value == 0) {
            body[offset] = 0x30;
            return offset + 1;
        }
        uint256 temp = value;
        uint256 len;
        while (temp != 0) {
            ++len;
            temp /= 10;
        }
        temp = value;
        uint256 end = offset + len;
        for (uint256 i = len; i > 0; --i) {
            body[offset + i - 1] = bytes1(uint8(48 + (temp % 10)));
            temp /= 10;
        }
        return end;
    }

    function _writeChar(bytes memory body, uint256 offset, bytes1 char) private pure returns (uint256) {
        body[offset] = char;
        return offset + 1;
    }

    function _writeLiteral(bytes memory body, uint256 offset, string memory literal) private pure returns (uint256) {
        bytes memory raw = bytes(literal);
        for (uint256 i = 0; i < raw.length; ++i) {
            body[offset + i] = raw[i];
        }
        return offset + raw.length;
    }

    function _writeString(bytes memory body, uint256 offset, string memory value) private pure returns (uint256) {
        bytes memory raw = bytes(value);
        for (uint256 i = 0; i < raw.length; ++i) {
            body[offset + i] = raw[i];
        }
        return offset + raw.length;
    }

    function _copyBytes(bytes memory dest, uint256 offset, bytes memory src) private pure returns (uint256) {
        for (uint256 i = 0; i < src.length; ++i) {
            dest[offset + i] = src[i];
        }
        return offset + src.length;
    }

    function _getPixelIndex(bytes memory pixels, uint256 x, uint256 y) private pure returns (uint8) {
        uint256 flatIndex = y * GRID + x;
        uint8 packed = uint8(pixels[flatIndex >> 1]);
        if ((flatIndex & 1) == 0) return packed >> 4;
        return packed & 0x0f;
    }

    function _getCompositePixelIndex(
        bytes memory pixels,
        uint256 x,
        uint256 y,
        uint16[] memory diffIndexes,
        uint8[] memory diffColors
    ) private pure returns (uint8) {
        if (diffIndexes.length > 0) {
            uint16 flatIndex = uint16(y * GRID + x);
            for (uint256 i = diffIndexes.length; i > 0; --i) {
                uint256 idx = i - 1;
                if (diffIndexes[idx] == flatIndex) return diffColors[idx];
            }
        }
        return _getPixelIndex(pixels, x, y);
    }
}
