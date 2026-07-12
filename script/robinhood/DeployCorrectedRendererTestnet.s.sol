// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";
import {ChromaRendererRobinhood} from "../../contracts/robinhood/ChromaRendererRobinhood.sol";
import {ChromaPaletteData} from "../../contracts/generated/ChromaPaletteData.sol";

/// @notice Cheap testnet insurance for the corrected-renderer fix
/// (ROBINHOOD_RENDERER_BUG.md). Deploys a brand-new, disposable stack
/// (palette -> commemorative -> ChromaRendererRobinhood(wired) -> setRenderer),
/// seeds batch 0 (tokens 1-10) from the real seed-calldata.json, flips mintOpen,
/// and mints token 1 -- exercising the exact live ChromiesCommemorative.tokenURI()
/// path (including _requireOwned) before the same renderer is deployed to mainnet.
///
/// Usage:
///   forge script script/robinhood/DeployCorrectedRendererTestnet.s.sol \
///     --rpc-url robinhood_testnet --broadcast --gas-estimate-multiplier 400
contract DeployCorrectedRendererTestnetScript is Script {
    string internal constant SEED_CALLDATA_PATH = "reports/robinhood/seed-calldata.json";

    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        ChromaPaletteData palette = new ChromaPaletteData();
        ChromiesCommemorative token = new ChromiesCommemorative(deployer);
        ChromaRendererRobinhood renderer = new ChromaRendererRobinhood(address(token), address(palette), deployer);
        token.setRenderer(address(renderer));

        string memory json = vm.readFile(SEED_CALLDATA_PATH);
        uint256[] memory ids = vm.parseJsonUintArray(json, ".batches[0].ids");
        bytes[] memory pixelsHex = vm.parseJsonBytesArray(json, ".batches[0].pixelsHex");
        bytes[] memory traitsHex = vm.parseJsonBytesArray(json, ".batches[0].traitsHex");
        token.seedPayloads(ids, pixelsHex, traitsHex);

        token.setMintOpen(true);
        token.mint{value: token.MINT_PRICE()}(1);

        vm.stopBroadcast();

        console2.log("=== Corrected-renderer testnet insurance deploy ===");
        console2.log("Deployer/owner:", deployer);
        console2.log("ChromaPaletteData (throwaway):", address(palette));
        console2.log("ChromiesCommemorative (throwaway):", address(token));
        console2.log("ChromaRendererRobinhood (corrected):", address(renderer));
        console2.log("token.renderer():", address(token.renderer()));
        console2.log("renderer.chromaStorage():", address(renderer.chromaStorage()));
        console2.log("token.totalSupply():", token.totalSupply());
        console2.log("token.ownerOf(1):", token.ownerOf(1));
    }
}
