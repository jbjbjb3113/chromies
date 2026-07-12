// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromaPaletteData} from "../../contracts/generated/ChromaPaletteData.sol";

/// @notice Deploys ONLY ChromaPaletteData, standalone, so the mainnet gate (live 80-ID
/// palette read-back vs palette-registry.json, KNOWN_DRIFT.md, ruled 2026-07-11) can be
/// checked BEFORE spending any further gas on ChromiesCommemorative/ChromaRenderer.
/// If drift is found here, nothing else has been deployed yet — clean halt.
///
/// Usage:
///   forge script script/robinhood/DeployPaletteOnly.s.sol \
///     --rpc-url robinhood_mainnet --broadcast --gas-estimate-multiplier 400
contract DeployPaletteOnlyScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));

        vm.startBroadcast(deployerPrivateKey);
        ChromaPaletteData paletteData = new ChromaPaletteData();
        vm.stopBroadcast();

        console2.log("=== ChromaPaletteData standalone deploy ===");
        console2.log("ChromaPaletteData:", address(paletteData));
        console2.log("Next: run VerifyPaletteReadback.s.sol with PALETTE_ADDRESS set to this.");
    }
}
