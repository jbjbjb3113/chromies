// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";

/// @notice Flips `mintOpen` on a ChromiesCommemorative mainnet contract. Owner-only,
/// one-way seeding lock trigger — seedPayloads reverts (SeedingLocked) forever after
/// this runs once with `open = true`.
///
/// Usage:
///   TOKEN_ADDRESS=0x... MINT_OPEN=true forge script \
///     script/robinhood/SetMintOpenMainnet.s.sol \
///     --rpc-url robinhood_mainnet --broadcast
contract SetMintOpenMainnetScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        address tokenAddress = vm.envAddress("TOKEN_ADDRESS");
        bool open = vm.envBool("MINT_OPEN");

        ChromiesCommemorative token = ChromiesCommemorative(payable(tokenAddress));

        console2.log("Pre-flip state:");
        console2.log("  token.owner():", token.owner());
        console2.log("  deployer:", deployer);
        console2.log("  mintOpen (before):", token.mintOpen());
        console2.log("  totalSupply (before):", token.totalSupply());

        vm.startBroadcast(deployerPrivateKey);
        token.setMintOpen(open);
        vm.stopBroadcast();

        console2.log("=== setMintOpen complete ===");
        console2.log("  mintOpen (after):", token.mintOpen());
        console2.log("  seedingLocked (after):", token.seedingLocked());
    }
}
