// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {TraitFixtures, WriterCaller} from "./Chroma.t.sol";
import {ChromaFixtures} from "./ChromaFixtures.sol";

/// @notice CI regression guard for Pass B PNG tokenURI gas (measured 2026-07-07).
contract ChromaRendererGasRegressionTest is Test {
    WriterCaller internal writer;
    ChromaStorage internal storageContract;
    ChromaRenderer internal renderer;

    /// @dev GasStressTokenURI 1000-seed sweep — worst baseline seed 680 (Pass B.1).
    uint256 internal constant WORST_REAL_SEED = 680;
    uint256 internal constant WORST_REAL_TOKENURI_GAS = 2_891_411;
    /// @dev Bumped after the corrected-renderer fix (ROBINHOOD_RENDERER_BUG.md):
    /// the ChromaRendererCrc32 table lookup/chunk-mixing/register-init bugs were
    /// producing WRONG PLTE/IDAT CRCs cheaply; computing them correctly costs a
    /// few thousand more gas per render. Baseline re-measured post-fix.
    uint256 internal constant WORST_REAL_RENDER_GAS = 2_337_594;

    /// @dev Synthetic ceiling token 999_001 — 64 distinct indices/row.
    uint256 internal constant SYNTHETIC_TOKEN_ID = 999_001;
    /// @dev Bumped for the same reason as WORST_REAL_RENDER_GAS above.
    uint256 internal constant SYNTHETIC_TOKENURI_GAS = 2_933_114;
    /// @dev Bumped for the same reason as WORST_REAL_RENDER_GAS above.
    uint256 internal constant SYNTHETIC_RENDER_GAS = 2_336_690;

    /// @dev Slack for solc / optimizer drift between CI runners.
    uint256 internal constant GAS_MARGIN = 50_000;

    function setUp() public {
        writer = new WriterCaller();
        storageContract = new ChromaStorage(address(this), address(writer));
        renderer = ChromaFixtures.deployRendererOnly(storageContract, address(this));
    }

    function test_GasRegression_WorstRealSeed680() public {
        _loadSeedFromCsv(WORST_REAL_SEED);
        uint256 renderGas = _measureRenderGas(WORST_REAL_SEED);
        uint256 tokenUriGas = _measureTokenURIGas(WORST_REAL_SEED);
        assertLe(renderGas, WORST_REAL_RENDER_GAS + GAS_MARGIN, "renderImageShell regressed");
        assertLe(tokenUriGas, WORST_REAL_TOKENURI_GAS + GAS_MARGIN, "tokenURI regressed");
    }

    function test_GasRegression_SyntheticCeiling() public {
        _writeSyntheticCeiling(SYNTHETIC_TOKEN_ID);
        uint256 renderGas = _measureRenderGas(SYNTHETIC_TOKEN_ID);
        uint256 tokenUriGas = _measureTokenURIGas(SYNTHETIC_TOKEN_ID);
        assertLe(renderGas, SYNTHETIC_RENDER_GAS + GAS_MARGIN, "renderImageShell ceiling regressed");
        assertLe(tokenUriGas, SYNTHETIC_TOKENURI_GAS + GAS_MARGIN, "tokenURI ceiling regressed");
    }

    function _measureRenderGas(uint256 tokenId) internal returns (uint256) {
        uint256 gasBefore = gasleft();
        renderer.renderImageShell(tokenId);
        return gasBefore - gasleft();
    }

    function _measureTokenURIGas(uint256 tokenId) internal returns (uint256) {
        uint256 gasBefore = gasleft();
        renderer.tokenURI(tokenId);
        return gasBefore - gasleft();
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
