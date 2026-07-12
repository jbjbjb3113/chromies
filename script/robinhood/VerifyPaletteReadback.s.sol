// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IChromaPaletteData} from "../../contracts/IChromaPaletteData.sol";

/// @notice Live palette read-back verification (Proof B, adapted from
/// scripts/verify_deployed_artifacts.py for a Robinhood Chain deploy target).
/// Reads all 80 palettes x 16 color slots from a live ChromaPaletteData and diffs
/// against chromies-engine/engine_data/palette_colors_expanded.json (compiled from
/// palette-registry.json at HEAD). Per the per-target KNOWN_DRIFT.md gate
/// (chromies-engine/reports/KNOWN_DRIFT.md, ruled 2026-07-11): this is a HARD gate for
/// mainnet — the script reverts on ANY divergence, waived or not, since the existing
/// waivers are tagged target: sepolia and do not apply to a fresh mainnet deploy.
///
/// Read-only — makes no state changes, no --broadcast needed. Not a "script" in the
/// deploy sense; run via `forge script` purely to get vm.parseJson + live eth_call in
/// one place (JSON reads require the Script/Test cheatcode context).
///
/// Usage:
///   PALETTE_ADDRESS=0x... forge script script/robinhood/VerifyPaletteReadback.s.sol \
///     --rpc-url robinhood_mainnet
contract VerifyPaletteReadbackScript is Script {
    string internal constant REGISTRY_PATH = "chromies-engine/engine_data/palette_colors_expanded.json";
    uint256 internal constant PALETTE_COUNT = 80;
    uint256 internal constant SLOTS_PER_PALETTE = 16;

    function run() external {
        address paletteAddress = vm.envAddress("PALETTE_ADDRESS");
        IChromaPaletteData paletteData = IChromaPaletteData(paletteAddress);

        string memory json = vm.readFile(REGISTRY_PATH);

        uint256 totalSlotsChecked = 0;
        uint256 mismatchCount = 0;
        uint256 palettesDiffering = 0;

        for (uint256 pid = 0; pid < PALETTE_COUNT; pid++) {
            string memory key = string.concat(".palettes[\"", vm.toString(pid), "\"].colors");
            string[] memory expected = vm.parseJsonStringArray(json, key);
            require(expected.length == SLOTS_PER_PALETTE, "registry: unexpected color count");

            string[16] memory live = paletteData.paletteColors(uint8(pid));

            bool paletteOk = true;
            for (uint256 slot = 0; slot < SLOTS_PER_PALETTE; slot++) {
                totalSlotsChecked++;
                if (!_eqCaseInsensitive(expected[slot], live[slot])) {
                    paletteOk = false;
                    mismatchCount++;
                    console2.log("MISMATCH palette id:", pid);
                    console2.log("  slot:", slot);
                    console2.log("  expected:", expected[slot]);
                    console2.log("  live:", live[slot]);
                }
            }
            if (!paletteOk) palettesDiffering++;
        }

        console2.log("=== Palette read-back verification ===");
        console2.log("Palette address:", paletteAddress);
        console2.log("Palettes checked:", PALETTE_COUNT);
        console2.log("Slots checked:", totalSlotsChecked);
        console2.log("Mismatches:", mismatchCount);
        console2.log("Palettes differing:", palettesDiffering);

        require(mismatchCount == 0, "PALETTE DRIFT DETECTED - see MISMATCH lines above - HALT");
        console2.log("PASS - zero drift across all 80 palettes / 1280 slots.");
    }

    function _eqCaseInsensitive(string memory a, string memory b) internal pure returns (bool) {
        bytes memory ba = _lower(bytes(a));
        bytes memory bb = _lower(bytes(b));
        return keccak256(ba) == keccak256(bb);
    }

    function _lower(bytes memory input) internal pure returns (bytes memory) {
        bytes memory out = new bytes(input.length);
        for (uint256 i = 0; i < input.length; i++) {
            bytes1 c = input[i];
            if (c >= 0x41 && c <= 0x5A) {
                out[i] = bytes1(uint8(c) + 32);
            } else {
                out[i] = c;
            }
        }
        return out;
    }
}
