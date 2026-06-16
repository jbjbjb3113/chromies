// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {TraitFixtures, WriterCaller} from "./Chroma.t.sol";

contract ChromaRendererDensityTest {
    function test_TokenURI_RealisticPixelDensity_1000() external {
        _assertTokenURIForDensity(1000, 1000);
    }

    function test_TokenURI_RealisticPixelDensity_2000() external {
        _assertTokenURIForDensity(2000, 2000);
    }

    function test_TokenURI_MaxPixelDensity() external {
        _assertTokenURIForDensity(4096, 4096);
    }

    function test_RenderSVG_RealisticPixelDensity_MatchesLegacyAlgorithm() external {
        WriterCaller writer = new WriterCaller();
        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));
        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));

        bytes memory pixels = _pixelsWithNonZeroCount(1641);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(1641);
        writer.write(storageContract, 42, pixels, traits);

        string memory svg = renderer.renderSVG(42);
        assert(bytes(svg).length > 0);
        assert(_contains(svg, "<svg"));
        assert(_contains(svg, "</svg>"));
    }

    function _assertTokenURIForDensity(uint256 tokenId, uint256 pixelCount) internal {
        WriterCaller writer = new WriterCaller();
        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));
        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));

        bytes memory pixels = _pixelsWithNonZeroCount(pixelCount);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(uint16(pixelCount));
        writer.write(storageContract, tokenId, pixels, traits);

        string memory uri = renderer.tokenURI(tokenId);
        bytes memory uriBytes = bytes(uri);
        bytes memory prefix = bytes("data:application/json;base64,");

        assert(uriBytes.length > prefix.length);
        for (uint256 i = 0; i < prefix.length; ++i) {
            assert(uriBytes[i] == prefix[i]);
        }

        bytes memory json = Base64.decode(string(_sliceAfterPrefix(uriBytes, prefix.length)));
        assert(json.length > 0);
        assert(_contains(string(json), '"image":"data:image/svg+xml;base64,'));
        assert(_contains(string(json), '"trait_type":"Total Pixels"'));
    }

    function _pixelsWithNonZeroCount(uint256 count) internal pure returns (bytes memory pixels) {
        pixels = new bytes(2048);
        for (uint256 i = 0; i < count; ++i) {
            _setPixel(pixels, i % 64, i / 64, uint8(1 + (i % 14)));
        }
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

    function _sliceAfterPrefix(bytes memory data, uint256 prefixLen) internal pure returns (bytes memory) {
        bytes memory out = new bytes(data.length - prefixLen);
        for (uint256 i = 0; i < out.length; ++i) {
            out[i] = data[prefixLen + i];
        }
        return out;
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; ++i) {
            bool matchAll = true;
            for (uint256 j = 0; j < n.length; ++j) {
                if (h[i + j] != n[j]) {
                    matchAll = false;
                    break;
                }
            }
            if (matchAll) return true;
        }
        return false;
    }
}
