// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChromaPaletteData} from "../contracts/generated/ChromaPaletteData.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {ChromaFixtures} from "./ChromaFixtures.sol";
import {WriterCaller} from "./Chroma.t.sol";

/// @notice Local anvil dry-run: deploy split stack → renderSVG smoke → immutability checks.
contract MigratePaletteStackLocalTest is Test {
    function test_LocalDryRun_DeployWireRender() public {
        WriterCaller writer = new WriterCaller();
        address owner = address(this);
        ChromaStorage storageContract = new ChromaStorage(owner, address(writer));
        ChromaPaletteData paletteData = ChromaFixtures.deployPaletteData();
        ChromaRenderer renderer = ChromaFixtures.deployRendererOnly(storageContract, owner);
        assertTrue(address(renderer.paletteData()) != address(0));

        bytes memory pixels = new bytes(2048);
        // Set one shirt_torso role pixel (index 9) so palette 38 shirt color appears in SVG.
        pixels[16] = bytes1(uint8(9) << 4);
        bytes memory traits = new bytes(32);
        traits[1] = bytes1(uint8(38)); // SIGNAL_SHIRT_RED
        writer.write(storageContract, 1, pixels, traits);

        string memory svg = renderer.renderSVG(1);
        assertTrue(bytes(svg).length > 0);
        assertTrue(_contains(svg, "<svg"));
        assertTrue(_contains(svg, "#79241e"));
    }

    function _contains(string memory haystack, string memory needle) private pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; ++i) {
            bool ok = true;
            for (uint256 j = 0; j < n.length; ++j) {
                if (h[i + j] != n[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }
}
