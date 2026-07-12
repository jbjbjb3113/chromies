// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromaStorage} from "../../contracts/ChromaStorage.sol";
import {ChromaRenderer} from "../../contracts/ChromaRenderer.sol";
import {ChromaPaletteData} from "../../contracts/generated/ChromaPaletteData.sol";
import {RobinhoodTestHarness} from "../../test/robinhood/RobinhoodTestHarness.sol";

/// @notice Robinhood Chain testnet dry-run for the Chromies commemorative edition.
/// @dev Deploys ChromaStorage, ChromaPaletteData, and ChromaRenderer UNCHANGED (same
/// contracts/bytecode used on Sepolia — see script/RedeployPaletteStack.s.sol) plus a
/// minimal RobinhoodTestHarness (test/robinhood/RobinhoodTestHarness.sol) that seeds an
/// existing Sepolia test fixture (art-pipeline/output/test-reveal.json) and exposes
/// tokenURI(uint256) as a passthrough to the renderer. No canvas/marketplace/Chroma
/// token is deployed — out of scope for this read-back + parity dry-run.
///
/// Runbook:
///   1. Fund the deployer (see chromies-engine/reports/SEPOLIA_DEPLOY_LOG.md for the
///      shared deployer address) via https://faucet.testnet.chain.robinhood.com
///   2. Set ROBINHOOD_TESTNET_RPC_URL in .env (Alchemy app URL, or leave the public
///      RPC default — see .env.example).
///   3. forge script script/robinhood/DeployRobinhoodDryRun.s.sol \
///        --rpc-url robinhood_testnet --broadcast
///   4. Blockscout verify (optional, no Etherscan-style key required):
///        forge verify-contract <paletteData> contracts/generated/ChromaPaletteData.sol:ChromaPaletteData \
///          --chain-id 46630 --rpc-url robinhood_testnet \
///          --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
///        forge verify-contract <renderer> contracts/ChromaRenderer.sol:ChromaRenderer \
///          --chain-id 46630 --rpc-url robinhood_testnet \
///          --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/ \
///          --constructor-args $(cast abi-encode "address,address,address" <storage> <paletteData> <owner>)
///   5. Record addresses in chromies-engine/reports/ (see ROBINHOOD_TESTNET_DRY_RUN.md).
contract DeployRobinhoodDryRunScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        ChromaStorage chromaStorage = new ChromaStorage(deployer, deployer);
        ChromaPaletteData paletteData = new ChromaPaletteData();
        ChromaRenderer renderer = new ChromaRenderer(address(chromaStorage), address(paletteData), deployer);
        RobinhoodTestHarness harness = new RobinhoodTestHarness(address(chromaStorage), address(renderer));

        chromaStorage.setWriter(address(harness));
        harness.seed();

        vm.stopBroadcast();

        console2.log("=== Robinhood Chain testnet dry-run deploy ===");
        console2.log("Deployer:", deployer);
        console2.log("ChromaStorage:", address(chromaStorage));
        console2.log("ChromaPaletteData:", address(paletteData));
        console2.log("ChromaRenderer:", address(renderer));
        console2.log("RobinhoodTestHarness:", address(harness));
        console2.log("Sample tokenId:", harness.SAMPLE_TOKEN_ID());
    }
}
