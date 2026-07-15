// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";
import {ChromaRendererRobinhood} from "../../contracts/robinhood/ChromaRendererRobinhood.sol";
import {ChromaTraitLabels} from "../../contracts/generated/ChromaTraitLabels.sol";

/// @dev Deploys ChromaTraitLabels library bytecode via CREATE (libraries cannot use `new`).
contract ChromaTraitLabelsDeployer {
    function deploy() external returns (address addr) {
        bytes memory bytecode = type(ChromaTraitLabels).creationCode;
        assembly {
            addr := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(addr != address(0), "ChromaTraitLabels deploy failed");
    }
}

/// @notice Deploy ONLY a new ChromaRendererRobinhood (label-fix build with
/// ChromaTraitLabels.sol). Does NOT call setRenderer — that is a separate,
/// explicit JB-gated step after bytecode verification.
///
/// Wires the renderer immutables to the live commemorative + verified palette
/// (same constructor args as the current production renderer).
///
/// Usage:
///   COMMEMORATIVE_ADDRESS=0x3C8C9615889762bDcF9647a3C86C74aFA498a158 \
///   PALETTE_ADDRESS=0xb3ad67d60C44E6db461f8957AF7a2f664c01275a \
///   forge script script/robinhood/DeployLabelFixRendererMainnet.s.sol \
///     --rpc-url robinhood_mainnet --broadcast --gas-estimate-multiplier 400
contract DeployLabelFixRendererMainnetScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        address commemorativeAddress = vm.envAddress("COMMEMORATIVE_ADDRESS");
        address paletteAddress = vm.envAddress("PALETTE_ADDRESS");

        ChromiesCommemorative token = ChromiesCommemorative(payable(commemorativeAddress));

        console2.log("Pre-deploy state (read-only):");
        console2.log("  token.owner():", token.owner());
        console2.log("  token.renderer() (current live):", address(token.renderer()));
        console2.log("  token.mintOpen():", token.mintOpen());
        console2.log("  token.totalSupply():", token.totalSupply());
        console2.log("  paletteAddress (existing):", paletteAddress);

        vm.startBroadcast(deployerPrivateKey);
        ChromaTraitLabelsDeployer labelsDeployer = new ChromaTraitLabelsDeployer();
        address labelsLib = labelsDeployer.deploy();
        ChromaRendererRobinhood renderer =
            new ChromaRendererRobinhood(commemorativeAddress, paletteAddress, deployer);
        vm.stopBroadcast();

        console2.log("=== Label-fix renderer MAINNET deploy (deploy-only) ===");
        console2.log("Deployer/owner:", deployer);
        console2.log("ChromiesCommemorative (existing, unchanged):", commemorativeAddress);
        console2.log("ChromaPaletteData (existing):", paletteAddress);
        console2.log("ChromaTraitLabels (NEW, linked library):", labelsLib);
        console2.log("ChromaRendererRobinhood (NEW, label-fix):", address(renderer));
        console2.log("renderer.chromaStorage():", address(renderer.chromaStorage()));
        console2.log("renderer.paletteData():", address(renderer.paletteData()));
        console2.log("NOTE: setRenderer() NOT called - await explicit JB go.");
    }
}
