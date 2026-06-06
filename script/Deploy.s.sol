// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {Chroma} from "../contracts/Chroma.sol";
import {ChromaCanvas} from "../contracts/ChromaCanvas.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";

contract DeployScript is Script {
    uint96 internal constant ROYALTY_BPS = 500;
    bytes32 internal constant MERKLE_ROOT_ONE =
        0xcceafb12d73e8308dd30198441ec75aec79f825221be9645e174220231781c39;
    bytes32 internal constant MERKLE_ROOT_TWO =
        0xd582654aae27faf95fbd5d648a9bb2fc5b0d4f7b5154e419cfb59b6d154bb2ac;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        ChromaStorage chromaStorage = new ChromaStorage(deployer, address(0));
        Chroma chroma = new Chroma(address(chromaStorage), deployer, deployer, ROYALTY_BPS);
        chromaStorage.setWriter(address(chroma));

        ChromaCanvas chromaCanvas = new ChromaCanvas(address(chroma), address(chromaStorage), deployer);
        chromaStorage.setTraitUpdater(address(chromaCanvas));

        ChromaRenderer chromaRenderer = new ChromaRenderer(address(chromaStorage), deployer);
        chromaRenderer.setCanvas(address(chromaCanvas));
        chroma.setRenderer(address(chromaRenderer));

        // Set merkle roots for allowlists
        chroma.setMerkleRootOne(MERKLE_ROOT_ONE);
        chroma.setMerkleRootTwo(MERKLE_ROOT_TWO);

        vm.stopBroadcast();

        console2.log("ChromaStorage:", address(chromaStorage));
        console2.log("Chroma:", address(chroma));
        console2.log("ChromaCanvas:", address(chromaCanvas));
        console2.log("ChromaRenderer:", address(chromaRenderer));
        console2.log("MerkleRootOne:", vm.toString(MERKLE_ROOT_ONE));
        console2.log("MerkleRootTwo:", vm.toString(MERKLE_ROOT_TWO));
    }
}
