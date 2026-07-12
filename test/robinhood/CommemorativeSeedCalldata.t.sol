// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";
import {ChromaRenderer} from "../../contracts/ChromaRenderer.sol";
import {ChromaPaletteData} from "../../contracts/generated/ChromaPaletteData.sol";

/// @notice End-to-end check that scripts/robinhood/select-commemorative-100.js's real
/// output (reports/robinhood/seed-calldata.json) round-trips through
/// ChromiesCommemorative.seedPayloads() exactly as the on-chain seeding flow will use
/// it — catching any JS<->Solidity hex/encoding mismatch the unit tests (which use
/// hand-picked fixtures) wouldn't. Run `node scripts/robinhood/select-commemorative-100.js`
/// first to (re)generate the input file.
contract CommemorativeSeedCalldataTest is Test {
    ChromiesCommemorative internal token;
    ChromaRenderer internal renderer;
    ChromaPaletteData internal paletteData;
    address internal owner = address(this);

    string internal constant SEED_CALLDATA_PATH = "reports/robinhood/seed-calldata.json";

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {}

    function setUp() public {
        token = new ChromiesCommemorative(owner);
        paletteData = new ChromaPaletteData();
        renderer = new ChromaRenderer(address(token), address(paletteData), owner);
        token.setRenderer(address(renderer));
    }

    function test_SeedCalldataBatchesApplyCleanlyAndReachFullSupply() public {
        string memory json = vm.readFile(SEED_CALLDATA_PATH);
        uint256 batchCount = vm.parseJsonUint(json, ".batchCount");
        assertGt(batchCount, 0, "no batches found - did you run the selection script?");

        for (uint256 i = 0; i < batchCount; i++) {
            string memory idsKey = string.concat(".batches[", vm.toString(i), "].ids");
            string memory pixelsKey = string.concat(".batches[", vm.toString(i), "].pixelsHex");
            string memory traitsKey = string.concat(".batches[", vm.toString(i), "].traitsHex");

            uint256[] memory ids = vm.parseJsonUintArray(json, idsKey);
            bytes[] memory pixelsHex = vm.parseJsonBytesArray(json, pixelsKey);
            bytes[] memory traitsHex = vm.parseJsonBytesArray(json, traitsKey);

            assertEq(ids.length, pixelsHex.length, "ids/pixelsHex length mismatch");
            assertEq(ids.length, traitsHex.length, "ids/traitsHex length mismatch");

            token.seedPayloads(ids, pixelsHex, traitsHex);
        }

        // All 100 commemorative IDs must now be seeded and ready to mint.
        for (uint256 tokenId = 1; tokenId <= 100; tokenId++) {
            assertTrue(token.hasData(tokenId), string.concat("token ", vm.toString(tokenId), " not seeded"));
        }

        token.setMintOpen(true);
        uint256 priceForTwo = token.MINT_PRICE() * 2;
        for (uint256 w = 0; w < 50; w++) {
            address wallet = vm.addr(w + 1);
            vm.deal(wallet, 1 ether);
            vm.prank(wallet);
            token.mint{value: priceForTwo}(2);
        }
        assertEq(token.totalSupply(), 100, "full mint from real seed-calldata.json failed");

        // Spot-check tokenURI renders without reverting for the first and last commemorative IDs.
        string memory firstUri = token.tokenURI(1);
        string memory lastUri = token.tokenURI(100);
        assertTrue(bytes(firstUri).length > 0, "empty tokenURI for token 1");
        assertTrue(bytes(lastUri).length > 0, "empty tokenURI for token 100");
    }

    /// @notice Local reference hash for commemorative token #1, using the correct
    /// self-storing wiring (renderer.chromaStorage == address(token)) — for diffing
    /// against a live mainnet/testnet eth_call on the real deploy.
    function test_LocalReferenceHash_CommemorativeToken1() public {
        string memory json = vm.readFile(SEED_CALLDATA_PATH);
        uint256[] memory ids = vm.parseJsonUintArray(json, ".batches[0].ids");
        bytes[] memory pixelsHex = vm.parseJsonBytesArray(json, ".batches[0].pixelsHex");
        bytes[] memory traitsHex = vm.parseJsonBytesArray(json, ".batches[0].traitsHex");
        token.seedPayloads(ids, pixelsHex, traitsHex);

        token.setMintOpen(true);
        token.mint{value: token.MINT_PRICE()}(1);

        string memory uri = token.tokenURI(1);
        console2.log("commemorative token 1 tokenURI byte length:", bytes(uri).length);
        console2.logBytes32(keccak256(bytes(uri)));
    }
}
