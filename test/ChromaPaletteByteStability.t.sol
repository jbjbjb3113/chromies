// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdJson} from "forge-std/Test.sol";
import {ChromaPaletteData} from "../contracts/generated/ChromaPaletteData.sol";

/// @notice Byte-stability vs pre-refactor deployed palette table (commit 9404326).
/// IDs 0–27 and 37 remain legacy-locked. Normie IDs 28–36 match registry JSON;
/// IDs 28, 29, 32, 33, 34 were deliberately repopulated 2026-07-08 (legendary finals JB approval).
contract ChromaPaletteByteStabilityTest is Test {
    using stdJson for string;

    ChromaPaletteData internal paletteData;

    function setUp() public {
        paletteData = new ChromaPaletteData();
    }

    function test_LegacyStableIds0Through27And37() public view {
        string memory root = vm.projectRoot();
        string memory json = vm.readFile(string.concat(root, "/chromies-engine/engine_data/legacy_deployed_palette_colors.json"));
        for (uint8 id = 0; id <= 27; ++id) {
            _assertMatchesLegacy(json, id);
        }
        _assertMatchesLegacy(json, 37);
    }

    function test_NormieIds28Through36_MatchRegistryNotWraparound() public view {
        string memory root = vm.projectRoot();
        string memory legacyJson =
            vm.readFile(string.concat(root, "/chromies-engine/engine_data/legacy_deployed_palette_colors.json"));
        string memory registryJson =
            vm.readFile(string.concat(root, "/chromies-engine/engine_data/palette_colors_expanded.json"));

        for (uint8 id = 28; id <= 36; ++id) {
            string[16] memory got = paletteData.paletteColors(id);
            string[16] memory expected = _registryColors(registryJson, id);
            for (uint256 i = 0; i < 16; ++i) {
                assertEq(got[i], expected[i], string(abi.encodePacked("registry slot ", vm.toString(i))));
            }
            // Wrapped legacy used paletteId % 26 — normie shirt slot (9) must differ.
            string[16] memory wrapped = _legacyColors(legacyJson, id % 26);
            assertTrue(
                keccak256(bytes(got[9])) != keccak256(bytes(wrapped[9])),
                "normie palette still matches wrapped alias at shirt slot"
            );
        }
    }

    function _assertMatchesLegacy(string memory json, uint8 id) private view {
        string[16] memory got = paletteData.paletteColors(id);
        string[16] memory expected = _legacyColors(json, id);
        for (uint256 i = 0; i < 16; ++i) {
            assertEq(got[i], expected[i], string(abi.encodePacked("legacy id ", vm.toString(id), " slot ", vm.toString(i))));
        }
    }

    function _legacyColors(string memory json, uint8 id) private view returns (string[16] memory colors) {
        string memory base = string.concat(".palettes.", vm.toString(id));
        for (uint256 i = 0; i < 16; ++i) {
            colors[i] = json.readString(string.concat(base, "[", vm.toString(i), "]"));
        }
    }

    function _registryColors(string memory json, uint8 id) private view returns (string[16] memory colors) {
        string memory base = string.concat(".palettes.", vm.toString(id), ".colors");
        for (uint256 i = 0; i < 16; ++i) {
            colors[i] = json.readString(string.concat(base, "[", vm.toString(i), "]"));
        }
    }
}
