// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChromaPaletteData} from "../contracts/generated/ChromaPaletteData.sol";
import {ChromaFixtures} from "./ChromaFixtures.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {TraitFixtures, WriterCaller} from "./Chroma.t.sol";

contract ChromaPaletteRegistryTest is Test {
    ChromaPaletteData internal paletteData;

    function setUp() public {
        paletteData = ChromaFixtures.deployPaletteData();
    }

    function test_PaletteBounds_InRange() public view {
        string[16] memory colors = paletteData.paletteColors(79);
        assertEq(colors[0], "#e3e5e4");
        assertEq(paletteData.paletteName(79), "MOSS_SHIRT_BLUE");
    }

    function test_PaletteBounds_OutOfRangeReturnsErrorMagenta() public view {
        string[16] memory bad = paletteData.paletteColors(80);
        for (uint256 i = 0; i < 16; ++i) {
            assertEq(bad[i], "#ff00ff");
        }
        assertEq(paletteData.paletteName(80), "ERROR");
    }

    function test_PaletteBounds_MaxUint8ReturnsErrorMagenta() public view {
        string[16] memory bad = paletteData.paletteColors(255);
        for (uint256 i = 0; i < 16; ++i) {
            assertEq(bad[i], "#ff00ff");
        }
    }

    function test_NormiePalettes28To36_NotWrappedAliases() public view {
        // Palette 28 % 26 == 2 (CYAN). Normie slot 0 must differ from CYAN background.
        string[16] memory normie28 = paletteData.paletteColors(28);
        string[16] memory cyan = paletteData.paletteColors(2);
        assertEq(normie28[0], "#000001");
        assertNotEq(normie28[0], cyan[0]);
        assertEq(normie28[1], "#140a0a");
        assertNotEq(normie28[9], cyan[9]);

        string[16] memory normie36 = paletteData.paletteColors(36);
        assertEq(normie36[0], "#e8e8e8");
        assertEq(normie36[12], "#aaaaaa");
    }

    function test_ShirtPaletteSpotChecks() public view {
        _assertSlot9(38, "#79241e"); // SIGNAL_SHIRT_RED
        _assertSlot9(45, "#6e2014"); // ACID_SHIRT_RED
        _assertSlot9(52, "#6e1428"); // CYAN_SHIRT_RED
        _assertSlot9(59, "#5c1a2e"); // GHOST_SHIRT_RED
        _assertSlot9(66, "#8a1a12"); // BLOOD_SHIRT_RED
    }

    function test_ErrorPaletteIdReserved() public view {
        assertEq(paletteData.ERROR_PALETTE_ID(), 255);
        assertEq(paletteData.MAX_VALID_PALETTE_ID(), 79);
    }

    function test_RenderSVG_OutOfRangePaletteUsesMagenta() public {
        WriterCaller writer = new WriterCaller();
        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));
        ChromaRenderer renderer = ChromaFixtures.deployRendererOnly(storageContract, address(this));

        bytes memory pixels = new bytes(2048);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(1);
        traits[1] = bytes1(uint8(200)); // out of range
        writer.write(storageContract, 1, pixels, traits);

        string memory svg = renderer.renderSVG(1);
        assertTrue(_contains(svg, "#ff00ff"));
    }

    function _assertSlot9(uint8 paletteId, string memory expected) private view {
        string[16] memory colors = paletteData.paletteColors(paletteId);
        assertEq(colors[9], expected);
    }

    function _contains(string memory haystack, string memory needle) private pure returns (bool) {
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
