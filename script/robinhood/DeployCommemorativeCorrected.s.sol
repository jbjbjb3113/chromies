// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";
import {ChromaRenderer} from "../../contracts/ChromaRenderer.sol";
import {ChromaPaletteData} from "../../contracts/generated/ChromaPaletteData.sol";

/// @notice Correct-order deploy for a real (non-smoke-test) ChromiesCommemorative launch.
/// Chain-agnostic — used both for a cheap testnet insurance run and the real Robinhood
/// Chain mainnet deploy (same script, different --rpc-url).
///
/// ChromiesCommemorative is self-storing (implements getPixels/getTraits/getTotalPixels
/// itself — see src/robinhood/ChromiesCommemorative.sol). ChromaRenderer.chromaStorage is
/// IMMUTABLE (set once at construction, no setter — contracts/ChromaRenderer.sol), so the
/// renderer MUST be deployed with `storageAddress = address(chromiesCommemorative)`, which
/// means ChromiesCommemorative must exist before the renderer is deployed. No standalone
/// ChromaStorage is deployed — there is nothing that would ever write to or read from it.
///
/// Order: ChromaPaletteData -> ChromiesCommemorative -> ChromaRenderer(wired to the
/// commemorative contract) -> setRenderer. Matches the pattern already exercised in
/// test/robinhood/CommemorativeSeedCalldata.t.sol's setUp().
///
/// On mainnet, ChromaPaletteData is deployed SEPARATELY first via
/// script/robinhood/DeployPaletteOnly.s.sol and gated by
/// script/robinhood/VerifyPaletteReadback.s.sol (zero drift required) before this script
/// ever runs, so a palette drift halt never wastes gas on the other two contracts. Pass
/// the already-verified palette address via PALETTE_ADDRESS. On testnet (cheap insurance
/// runs), PALETTE_ADDRESS may be left unset to deploy a fresh throwaway palette inline.
///
/// Usage:
///   PALETTE_ADDRESS=0x... forge script script/robinhood/DeployCommemorativeCorrected.s.sol \
///     --rpc-url <robinhood_testnet|robinhood_mainnet> --broadcast --gas-estimate-multiplier 400
contract DeployCommemorativeCorrectedScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        address paletteAddress = vm.envOr("PALETTE_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        if (paletteAddress == address(0)) {
            ChromaPaletteData freshPalette = new ChromaPaletteData();
            paletteAddress = address(freshPalette);
        }
        ChromiesCommemorative token = new ChromiesCommemorative(deployer);
        ChromaRenderer renderer = new ChromaRenderer(address(token), paletteAddress, deployer);
        token.setRenderer(address(renderer));

        vm.stopBroadcast();

        console2.log("=== ChromiesCommemorative correct-order deploy ===");
        console2.log("Deployer/owner:", deployer);
        console2.log("ChromaPaletteData (pre-verified or fresh):", paletteAddress);
        console2.log("ChromiesCommemorative:", address(token));
        console2.log("ChromaRenderer:", address(renderer));
        console2.log("renderer.chromaStorage() ==", address(renderer.chromaStorage()));
        console2.log("(should equal ChromiesCommemorative address above)");
    }
}
