// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";
import {ChromaRendererRobinhood} from "../../contracts/robinhood/ChromaRendererRobinhood.sol";

/// @notice Robinhood commemorative RE-DO — fresh ChromiesCommemorative wired from the
/// start to the CORRECTED renderer (ChromaRendererRobinhood: fixed IHDR height,
/// fixed CRC32, Robinhood-specific "Chromie #N" token metadata), pointed at the
/// already-verified live palette (0xb3ad67d60C44E6db461f8957AF7a2f664c01275a).
/// Same constants as the original deploy (0.0169 ether, 100 supply, cap 2/wallet,
/// 5% royalty) — see src/robinhood/ChromiesCommemorative.sol, unchanged.
///
/// Order: ChromiesCommemorative -> ChromaRendererRobinhood(wired to the new
/// commemorative + existing verified palette) -> setRenderer. Does NOT deploy a
/// new palette (reuses the already-verified one) and does NOT seed or flip
/// mintOpen — seeding is a separate script/step, mintOpen stays false.
///
/// Usage:
///   PALETTE_ADDRESS=0xb3ad67d60C44E6db461f8957AF7a2f664c01275a \
///   forge script script/robinhood/DeployCommemorativeRedoMainnet.s.sol \
///     --rpc-url robinhood_mainnet --broadcast --gas-estimate-multiplier 400
contract DeployCommemorativeRedoMainnetScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        address paletteAddress = vm.envAddress("PALETTE_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        ChromiesCommemorative token = new ChromiesCommemorative(deployer);
        ChromaRendererRobinhood renderer =
            new ChromaRendererRobinhood(address(token), paletteAddress, deployer);
        token.setRenderer(address(renderer));

        vm.stopBroadcast();

        console2.log("=== ChromiesCommemorative RE-DO deploy ===");
        console2.log("Deployer/owner:", deployer);
        console2.log("ChromiesCommemorative (NEW):", address(token));
        console2.log("ChromaRendererRobinhood (NEW, corrected from deploy):", address(renderer));
        console2.log("ChromaPaletteData (existing, verified):", paletteAddress);
        console2.log("renderer.chromaStorage() ==", address(renderer.chromaStorage()));
        console2.log("(should equal ChromiesCommemorative address above)");
        console2.log("token.renderer() ==", address(token.renderer()));
        console2.log("token.mintOpen() (should be false):", token.mintOpen());
        console2.log("token.MINT_PRICE():", token.MINT_PRICE());
        console2.log("token.MAX_SUPPLY():", token.MAX_SUPPLY());
    }
}
