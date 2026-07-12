// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaRendererPngLib} from "../contracts/ChromaRendererPngLib.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {TraitFixtures, WriterCaller} from "./Chroma.t.sol";
import {ChromaFixtures} from "./ChromaFixtures.sol";

/// @notice On-chain PLTE bytes must match registry paletteColors for each token.
contract ChromaRendererPlteTest is Test {
    WriterCaller internal writer;
    ChromaStorage internal storageContract;
    ChromaRenderer internal renderer;

    function setUp() public {
        writer = new WriterCaller();
        storageContract = new ChromaStorage(address(this), address(writer));
        renderer = ChromaFixtures.deployRendererOnly(storageContract, address(this));
    }

    function test_PlteMatchesRegistry_Seed260() public {
        _loadSeedFromCsv(260);
        _assertPlteForToken(260);
    }

    function test_PlteMatchesRegistry_SyntheticCeiling() public {
        _writeSyntheticCeiling(999_001);
        _assertPlteForToken(999_001);
    }

    function _assertPlteForToken(uint256 tokenId) internal {
        bytes memory traits = storageContract.getTraits(tokenId);
        string[16] memory paletteHex = renderer.paletteData().paletteColors(uint8(traits[1]));
        bytes3[16] memory expected = ChromaRendererPngLib.paletteHexToRgb(paletteHex);
        expected[0] = 0xE3E5E4; // universal renderer background

        (, bytes memory png,,,) = renderer.profileRenderParts(tokenId);
        bytes3[16] memory plte = ChromaRendererPngLib.extractPlteRgb(png);

        for (uint8 i = 0; i < 16; ++i) {
            assertEq(plte[i], expected[i], "PLTE entry mismatch");
        }
    }

    function _loadSeedFromCsv(uint256 seed) internal {
        string memory csvPath = vm.envOr(
            "GAS_REGRESSION_CSV_PATH",
            string.concat(vm.projectRoot(), "/chromies-engine/generated/gas_regression_fixtures.csv")
        );
        string memory data = vm.readFile(csvPath);
        string[] memory lines = vm.split(data, "\n");
        for (uint256 i = 0; i < lines.length; ++i) {
            if (bytes(lines[i]).length == 0) continue;
            if (_startsWith(lines[i], "token_id")) continue;
            (uint256 tokenId, string memory pixelsHex, string memory traitsHex) = _parseCsvLine(lines[i]);
            if (tokenId != seed) continue;
            writer.write(storageContract, tokenId, vm.parseBytes(pixelsHex), vm.parseBytes(traitsHex));
            return;
        }
        revert("seed missing from parity fixture csv");
    }

    function _writeSyntheticCeiling(uint256 tokenId) internal {
        bytes memory pixels = new bytes(2048);
        for (uint256 y = 0; y < 64; ++y) {
            for (uint256 x = 0; x < 64; ++x) {
                uint8 idx = uint8(1 + ((x + y) % 14));
                _setPixel(pixels, x, y, idx);
            }
        }
        writer.write(storageContract, tokenId, pixels, TraitFixtures.traitsWithTotalPixels(4096));
    }

    function _parseCsvLine(string memory line)
        internal
        pure
        returns (uint256 tokenId, string memory pixelsHex, string memory traitsHex)
    {
        bytes memory raw = bytes(line);
        uint256 p0 = _indexOfByte(raw, bytes1(","), 0);
        uint256 p1 = _indexOfByte(raw, bytes1(","), p0 + 1);
        tokenId = vm.parseUint(string(_slice(raw, 0, p0)));
        pixelsHex = _trimCarriageReturn(string(_slice(raw, p0 + 1, p1)));
        traitsHex = _trimCarriageReturn(string(_slice(raw, p1 + 1, raw.length)));
    }

    function _trimCarriageReturn(string memory value) private pure returns (string memory) {
        bytes memory raw = bytes(value);
        if (raw.length > 0 && raw[raw.length - 1] == bytes1("\r")) {
            bytes memory out = new bytes(raw.length - 1);
            for (uint256 i = 0; i < out.length; ++i) out[i] = raw[i];
            return string(out);
        }
        return value;
    }

    function _startsWith(string memory value, string memory prefix) private pure returns (bool) {
        bytes memory v = bytes(value);
        bytes memory p = bytes(prefix);
        if (p.length > v.length) return false;
        for (uint256 i = 0; i < p.length; ++i) {
            if (v[i] != p[i]) return false;
        }
        return true;
    }

    function _indexOfByte(bytes memory data, bytes1 needle, uint256 from) private pure returns (uint256) {
        for (uint256 i = from; i < data.length; ++i) {
            if (data[i] == needle) return i;
        }
        return type(uint256).max;
    }

    function _slice(bytes memory data, uint256 start, uint256 end) private pure returns (bytes memory) {
        bytes memory out = new bytes(end - start);
        for (uint256 i = 0; i < out.length; ++i) out[i] = data[start + i];
        return out;
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
}
