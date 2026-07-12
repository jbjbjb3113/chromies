// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";

/// @notice One-off admin action: withdraw the accumulated mint proceeds from the
/// old (pre-flip-off) `ChromiesCommemorative` mainnet deployment
/// (0x10953E4975C35529a5034D54eBC9266cec0CE69D). Does NOT touch mintOpen,
/// seeding, or the renderer — withdraw() only sweeps address(this).balance to
/// owner() per src/robinhood/ChromiesCommemorative.sol:166-169.
///
/// Usage:
///   COMMEMORATIVE_ADDRESS=0x10953E4975C35529a5034D54eBC9266cec0CE69D \
///   forge script script/robinhood/WithdrawCommemorativeMainnet.s.sol \
///     --rpc-url robinhood_mainnet --broadcast --gas-estimate-multiplier 400
contract WithdrawCommemorativeMainnetScript is Script {
    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        address commemorativeAddress = vm.envAddress("COMMEMORATIVE_ADDRESS");
        ChromiesCommemorative token = ChromiesCommemorative(payable(commemorativeAddress));

        console2.log("Pre-withdraw state:");
        console2.log("  token.owner():", token.owner());
        console2.log("  deployer:", deployer);
        console2.log("  contract balance (wei):", commemorativeAddress.balance);
        console2.log("  deployer balance (wei):", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);
        token.withdraw();
        vm.stopBroadcast();

        console2.log("=== Withdraw complete ===");
        console2.log("  contract balance after (wei):", commemorativeAddress.balance);
        console2.log("  deployer balance after (wei):", deployer.balance);
    }
}
