// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaPaletteData} from "../contracts/generated/ChromaPaletteData.sol";

/// @notice Sepolia migration: deploy split palette stack and wire existing Chroma.
/// @dev Runbook (do NOT execute without approval):
///   1. forge script script/RedeployPaletteStack.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
///   2. Etherscan: verify ChromaPaletteData (no constructor args)
///   3. Etherscan: verify ChromaRenderer with (storage, paletteData, owner) args
///   4. chroma.setRenderer(newRenderer) — paletteData is immutable on renderer; no setter exists.
contract RedeployPaletteStackScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        address chromaAddress = vm.envAddress("CHROMA_ADDRESS");
        address storageAddress = vm.envAddress("CHROMA_STORAGE_ADDRESS");
        address canvasAddress = vm.envAddress("CHROMA_CANVAS_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Ownerless immutable palette table (no admin, no storage writes after deploy).
        ChromaPaletteData paletteData = new ChromaPaletteData();

        // 2. Slim renderer with immutable paletteData reference.
        ChromaRenderer renderer = new ChromaRenderer(storageAddress, address(paletteData), deployer);
        renderer.setCanvas(canvasAddress);
        renderer.setChroma(chromaAddress);

        Chroma chroma = Chroma(payable(chromaAddress));
        chroma.setRenderer(address(renderer));

        vm.stopBroadcast();

        console2.log("=== Palette stack migration (Sepolia) ===");
        console2.log("ChromaPaletteData:", address(paletteData));
        console2.log("  immutable: yes (no owner, packed constants only)");
        console2.log("ChromaRenderer:", address(renderer));
        console2.log("  paletteData (immutable):", address(paletteData));
        console2.log("Chroma:", chromaAddress);
        console2.log("ChromaStorage:", storageAddress);
        console2.log("ChromaCanvas:", canvasAddress);
        console2.log("");
        console2.log("Etherscan verification (required):");
        console2.log("  forge verify-contract <paletteData> contracts/generated/ChromaPaletteData.sol:ChromaPaletteData");
        console2.log("  forge verify-contract <renderer> contracts/ChromaRenderer.sol:ChromaRenderer \\");
        console2.log("    --constructor-args $(cast abi-encode \"address,address,address\" storage paletteData owner)");
    }
}
