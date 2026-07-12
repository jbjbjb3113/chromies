// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";

/// @notice Robinhood Chain testnet SMOKE TEST deploy for ChromiesCommemorative.
/// @dev Wires the new contract's `renderer` field to the EXISTING testnet ChromaRenderer
/// deployed during the earlier dry-run (chromies-engine/reports/ROBINHOOD_TESTNET_DRY_RUN.md),
/// instead of deploying a fresh ChromaRenderer/ChromaPaletteData pair. This is a deliberate
/// smoke-test shortcut, NOT the real mainnet wiring pattern:
///
///   - That renderer's `chromaStorage` pointer is immutable and was set at ITS construction
///     to the OLD RobinhoodTestHarness-backed ChromaStorage from the dry run — it does NOT
///     read from THIS contract's own storage.
///   - Consequently `tokenURI(1)` on this contract will render the SAME bytes as the original
///     dry-run's tokenURI(1) (that old storage has token 1 seeded), while `tokenURI(2..100)`
///     will revert `TokenNotWritten` on the OLD ChromaStorage even after THIS contract's own
///     `seedPayloads` has populated its own storage for those ids. This is intentional here:
///     it gives us a live, freshly-called tokenURI(1) data point to reconcile against the
///     dry-run's recorded hash (see ROBINHOOD_COMMEMORATIVE_EDITION.md hash-reconciliation
///     section) without redeploying the palette/renderer stack.
///   - A real mainnet deploy must deploy its OWN ChromaRenderer (or an equivalent) constructed
///     with `storageAddress = address(thisContract)` so seeded payloads actually render.
///
/// Usage:
///   forge script script/robinhood/DeployCommemorativeTestnet.s.sol \
///     --rpc-url robinhood_testnet --broadcast --gas-estimate-multiplier 400
contract DeployCommemorativeTestnetScript is Script {
    address internal constant EXISTING_TESTNET_RENDERER = 0x9d868268a8774EdA4D257A856aD9EF0aAfAAf437;

    function run() external {
        bytes memory keyBytes = vm.envBytes("PRIVATE_KEY");
        uint256 deployerPrivateKey = uint256(bytes32(keyBytes));
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        ChromiesCommemorative token = new ChromiesCommemorative(deployer);
        token.setRenderer(EXISTING_TESTNET_RENDERER);

        vm.stopBroadcast();

        console2.log("=== ChromiesCommemorative testnet smoke-test deploy ===");
        console2.log("Deployer/owner:", deployer);
        console2.log("ChromiesCommemorative:", address(token));
        console2.log("Wired renderer (existing, reused):", EXISTING_TESTNET_RENDERER);
        console2.log("MINT_PRICE (wei):", token.MINT_PRICE());
        console2.log("name:", token.name());
        console2.log("symbol:", token.symbol());
    }
}
