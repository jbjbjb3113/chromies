// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

library ChromaRendererSvgLib {
    using Strings for uint256;

    uint256 internal constant GRID = 64;
    uint256 internal constant CELL = 16;
    uint256 internal constant MAX_RECTS = 4096;
    uint256 internal constant MAX_RECT_BYTES = 128;

    struct SvgRenderContext {
        uint256 tokenId;
        bytes pixels;
        string[16] palette;
        uint16[] diffIndexes;
        uint8[] diffColors;
    }

    function buildBody(SvgRenderContext memory ctx) internal pure returns (bytes memory) {
        bytes memory body = new bytes(MAX_RECTS * MAX_RECT_BYTES);
        uint256 written = _writeSvgBody(body, 0, ctx);
        assembly ("memory-safe") {
            mstore(body, written)
        }
        return body;
    }

    function wrapSvg(string memory background, bytes memory body) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" shape-rendering="crispEdges"><rect width="1024" height="1024" fill="',
                background,
                '"/>',
                body,
                "</svg>"
            )
        );
    }

    function _writeSvgBody(bytes memory body, uint256 offset, SvgRenderContext memory ctx)
        private
        pure
        returns (uint256)
    {
        for (uint256 y = 0; y < GRID; ++y) {
            uint256 x = 0;
            while (x < GRID) {
                uint8 idx = _getCompositePixelIndex(ctx.pixels, x, y, ctx.diffIndexes, ctx.diffColors);

                uint256 run = 1;
                while (x + run < GRID) {
                    uint256 nextFlat = y * GRID + x + run;
                    uint8 nextIdx = _getCompositePixelIndex(ctx.pixels, x + run, y, ctx.diffIndexes, ctx.diffColors);
                    if (nextIdx != idx) break;
                    ++run;
                }

                if (idx != 0) {
                    offset = _appendRect(body, offset, x, y, run, ctx.palette[idx]);
                }
                x += run;
            }
        }
        return offset;
    }

    function _appendRect(
        bytes memory body,
        uint256 offset,
        uint256 x,
        uint256 y,
        uint256 run,
        string memory color
    ) private pure returns (uint256) {
        bytes memory rect = abi.encodePacked(
            '<rect x="',
            (x * CELL).toString(),
            '" y="',
            (y * CELL).toString(),
            '" width="',
            (run * CELL).toString(),
            '" height="16" fill="',
            color,
            '"/>'
        );
        _copyBytes(body, offset, rect);
        return offset + rect.length;
    }

    function _copyBytes(bytes memory dest, uint256 destOffset, bytes memory src) private pure {
        uint256 n = src.length;
        for (uint256 i = 0; i < n; ++i) {
            dest[destOffset + i] = src[i];
        }
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
        uint16 flatIndex = uint16(y * GRID + x);
        for (uint256 i = diffIndexes.length; i > 0; --i) {
            uint256 idx = i - 1;
            if (diffIndexes[idx] == flatIndex) return diffColors[idx];
        }
        return _getPixelIndex(pixels, x, y);
    }
}
