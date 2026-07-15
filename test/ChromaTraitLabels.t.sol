// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChromaTraitLabels} from "../contracts/generated/ChromaTraitLabels.sol";

/// @dev Spot-check registry-backed labels (full table is compiler-generated from trait-byte-registry.json).
contract ChromaTraitLabelsTest is Test {
    function test_commemorative1_hair_byte14() public pure {
        assertEq(ChromaTraitLabels.hairLabel(14), "Chubby_FadeRight");
    }

    function test_byteZero_noneSlots() public pure {
        assertEq(ChromaTraitLabels.hoodLabel(0), "None");
        assertEq(ChromaTraitLabels.shirtLabel(0), "None");
        assertEq(ChromaTraitLabels.bodyLabel(0), "None");
        assertEq(ChromaTraitLabels.hairLabel(0), "None");
    }

    function test_eyes_byteZero_signal_not_none() public pure {
        assertEq(ChromaTraitLabels.eyesLabel(0), "Signal");
    }

    function test_character_chubbyMale() public pure {
        assertEq(ChromaTraitLabels.characterLabel(7), "Chubby_Male");
    }

    function test_unmapped_fallsThrough_none() public pure {
        assertEq(ChromaTraitLabels.hairLabel(255), "None");
        assertEq(ChromaTraitLabels.characterLabel(255), "None");
    }
}
