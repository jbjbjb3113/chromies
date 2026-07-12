// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";
import {ChromaRendererRobinhood} from "../../contracts/robinhood/ChromaRendererRobinhood.sol";

/// @notice Deploys the corrected-renderer fix (ROBINHOOD_RENDERER_BUG.md: IHDR
/// height=0 + ChromaRendererCrc32 table/chunk/accumulator bugs) to Robinhood Chain
/// MAINNET, wired to the already-live `ChromiesCommemorative` and `ChromaPaletteData`,
/// and re-points the commemorative at it via `setRenderer`. Does NOT touch `mintOpen`
/// or seeding — both are already finalized on this contract.
///
/// Usage:
///   COMMEMORATIVE_ADDRESS=0x10953E4975C35529a5034D54eBC9266cec0CE69D \
///   PALETTE_ADDRESS=0xb3ad67d60C44E6db461f8957AF7a2f664c01275a \
///   forge script script/robinhood/DeployCorrectedRendererMainnet.s.sol \
///     --rpc-url robinhood_mainnet --broadcast --gas-estimate-multiplier 400
contract DeployCorrectedRendererMainnetScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        address commemorativeAddress = vm.envAddress("COMMEMORATIVE_ADDRESS");
        address paletteAddress = vm.envAddress("PALETTE_ADDRESS");

        ChromiesCommemorative token = ChromiesCommemorative(payable(commemorativeAddress));

        console2.log("Pre-deploy state:");
        console2.log("  token.owner():", token.owner());
        console2.log("  token.renderer() (old, buggy):", address(token.renderer()));
        console2.log("  token.mintOpen():", token.mintOpen());
        console2.log("  token.totalSupply():", token.totalSupply());

        vm.startBroadcast(deployerPrivateKey);
        ChromaRendererRobinhood renderer =
            new ChromaRendererRobinhood(commemorativeAddress, paletteAddress, deployer);
        token.setRenderer(address(renderer));
        vm.stopBroadcast();

        console2.log("=== Corrected-renderer MAINNET redeploy ===");
        console2.log("Deployer/owner:", deployer);
        console2.log("ChromiesCommemorative (existing):", commemorativeAddress);
        console2.log("ChromaPaletteData (existing):", paletteAddress);
        console2.log("ChromaRendererRobinhood (NEW, corrected):", address(renderer));
        console2.log("token.renderer() (post-set):", address(token.renderer()));
        console2.log("renderer.chromaStorage():", address(renderer.chromaStorage()));
        console2.log("renderer.paletteData():", address(renderer.paletteData()));
        console2.log("token.mintOpen() (unchanged):", token.mintOpen());
        console2.log("token.totalSupply() (unchanged):", token.totalSupply());
    }
}
