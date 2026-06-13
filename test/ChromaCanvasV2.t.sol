// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {Chroma} from "../contracts/Chroma.sol";
import {ChromaCanvasV2} from "../contracts/ChromaCanvasV2.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {PixelMarketplace} from "../contracts/PixelMarketplace.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract ChromaCanvasV2Test is Test {
    ChromaStorage internal storageContract;
    Chroma internal chroma;
    ChromaCanvasV2 internal canvas;
    PixelMarketplace internal marketplace;

    address internal alice;
    address internal bob;

    uint256 internal constant ALICE_TOKEN = 1;
    uint256 internal constant BOB_TOKEN = 2;

    function setUp() public {
        alice = makeAddr("alice");
        bob = makeAddr("bob");

        storageContract = new ChromaStorage(address(this), address(0));
        chroma = new Chroma(address(storageContract), address(this), address(this), 500);
        storageContract.setWriter(address(chroma));

        canvas = new ChromaCanvasV2(address(chroma), address(storageContract), address(this));
        storageContract.setTraitUpdater(address(canvas));

        marketplace = new PixelMarketplace();
        canvas.setOperatorApproval(address(marketplace), true);

        bytes memory pixels = new bytes(2048);
        bytes memory traits = new bytes(32);
        chroma.mint(alice, ALICE_TOKEN, pixels, traits);
        chroma.mint(bob, BOB_TOKEN, pixels, traits);
    }

    // ========================================================================
    // AP balances
    // ========================================================================

    function test_AP_StartsAtZero() external view {
        assert(canvas.actionPoints(ALICE_TOKEN) == 0);
        assert(canvas.actionPoints(BOB_TOKEN) == 0);
    }

    function test_EarnAP_CreditsToken() external {
        canvas.earnAP(ALICE_TOKEN, 250);
        assert(canvas.actionPoints(ALICE_TOKEN) == 250);
        assert(canvas.actionPoints(BOB_TOKEN) == 0);
    }

    function test_SpendAP_DeductsFromToken() external {
        canvas.earnAP(ALICE_TOKEN, 250);

        vm.prank(alice);
        canvas.spendAP(ALICE_TOKEN, 100);

        assert(canvas.actionPoints(ALICE_TOKEN) == 150);
        assert(canvas.totalApSpent(ALICE_TOKEN) == 100);
    }

    function test_SpendAP_NonOwner_Reverts() external {
        canvas.earnAP(ALICE_TOKEN, 250);

        vm.prank(bob);
        vm.expectRevert(ChromaCanvasV2.NotTokenOwner.selector);
        canvas.spendAP(ALICE_TOKEN, 100);
    }

    // ========================================================================
    // Token-to-token transfer
    // ========================================================================

    function test_TransferAP_TokenToToken() external {
        canvas.earnAP(ALICE_TOKEN, 200);

        vm.prank(alice);
        canvas.transferAP(ALICE_TOKEN, BOB_TOKEN, 75);

        assert(canvas.actionPoints(ALICE_TOKEN) == 125);
        assert(canvas.actionPoints(BOB_TOKEN) == 75);
        // Transfers do not count as spend — levels stay put
        assert(canvas.totalApSpent(ALICE_TOKEN) == 0);
        assert(canvas.totalApSpent(BOB_TOKEN) == 0);
    }

    function test_TransferAP_NonOwner_Reverts() external {
        canvas.earnAP(ALICE_TOKEN, 200);

        vm.prank(bob);
        vm.expectRevert(ChromaCanvasV2.NotTokenOwner.selector);
        canvas.transferAP(ALICE_TOKEN, BOB_TOKEN, 75);
    }

    // ========================================================================
    // Levels
    // ========================================================================

    function test_Level_StartsAtOne() external view {
        assert(canvas.level(ALICE_TOKEN) == 1);
    }

    function test_Level_IncreasesWithSpend() external {
        canvas.earnAP(ALICE_TOKEN, 250);

        vm.prank(alice);
        canvas.spendAP(ALICE_TOKEN, 100);

        assert(canvas.level(ALICE_TOKEN) == 2);

        vm.prank(alice);
        canvas.spendAP(ALICE_TOKEN, 100);

        assert(canvas.level(ALICE_TOKEN) == 3);
    }

    // ========================================================================
    // Operator transfers
    // ========================================================================

    function test_OperatorTransferAP() external {
        canvas.earnAP(ALICE_TOKEN, 200);

        vm.prank(address(marketplace));
        canvas.operatorTransferAP(alice, ALICE_TOKEN, BOB_TOKEN, 60);

        assert(canvas.actionPoints(ALICE_TOKEN) == 140);
        assert(canvas.actionPoints(BOB_TOKEN) == 60);
    }

    function test_OperatorTransferAP_Unauthorized_Reverts() external {
        canvas.earnAP(ALICE_TOKEN, 200);

        vm.prank(bob);
        vm.expectRevert(ChromaCanvasV2.NotApprovedOperator.selector);
        canvas.operatorTransferAP(alice, ALICE_TOKEN, BOB_TOKEN, 60);
    }

    // ========================================================================
    // Marketplace
    // ========================================================================

    function test_Marketplace_List() external {
        canvas.earnAP(ALICE_TOKEN, 200);

        vm.prank(alice);
        uint256 listingId = marketplace.list(address(canvas), ALICE_TOKEN, 100, 1 ether);

        (address seller, address listedCanvas, uint256 tokenId, uint256 amount, uint256 price) =
            marketplace.listings(listingId);
        assert(seller == alice);
        assert(listedCanvas == address(canvas));
        assert(tokenId == ALICE_TOKEN);
        assert(amount == 100);
        assert(price == 1 ether);

        // Non-custodial: AP untouched by listing
        assert(canvas.actionPoints(ALICE_TOKEN) == 200);
    }

    function test_Marketplace_Buy() external {
        canvas.earnAP(ALICE_TOKEN, 200);

        vm.prank(alice);
        uint256 listingId = marketplace.list(address(canvas), ALICE_TOKEN, 100, 1 ether);

        vm.deal(bob, 1 ether);
        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(bob);
        marketplace.buy{value: 1 ether}(listingId, BOB_TOKEN);

        assert(canvas.actionPoints(ALICE_TOKEN) == 100);
        assert(canvas.actionPoints(BOB_TOKEN) == 100);
        assert(alice.balance == aliceBalanceBefore + 1 ether);

        // Listing consumed
        (address seller,,,,) = marketplace.listings(listingId);
        assert(seller == address(0));
    }

    function test_Marketplace_Cancel() external {
        canvas.earnAP(ALICE_TOKEN, 200);

        vm.prank(alice);
        uint256 listingId = marketplace.list(address(canvas), ALICE_TOKEN, 100, 1 ether);

        vm.prank(alice);
        marketplace.cancel(listingId);

        (address seller,,,,) = marketplace.listings(listingId);
        assert(seller == address(0));

        // Buying a cancelled listing reverts
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(PixelMarketplace.ListingNotFound.selector);
        marketplace.buy{value: 1 ether}(listingId, BOB_TOKEN);
    }

    function test_Marketplace_StaleListing_Reverts() external {
        canvas.earnAP(ALICE_TOKEN, 200);

        vm.prank(alice);
        uint256 listingId = marketplace.list(address(canvas), ALICE_TOKEN, 100, 1 ether);

        // Seller transfers the token away — listing goes stale
        vm.prank(alice);
        chroma.transferFrom(alice, bob, ALICE_TOKEN);

        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(PixelMarketplace.StaleListing.selector);
        marketplace.buy{value: 1 ether}(listingId, BOB_TOKEN);
    }

    // ========================================================================
    // Recursive burn count
    // ========================================================================

    function test_BurnCount_StartsAtZero() external view {
        assert(canvas.getBurnCount(ALICE_TOKEN) == 0);
        assert(canvas.getBurnCount(BOB_TOKEN) == 0);
    }

    function test_BurnCount_IncrementsOnBurn() external {
        uint256 fuelOne = 10;
        uint256 fuelTwo = 11;
        bytes memory pixels = new bytes(2048);
        bytes memory traits = new bytes(32);
        chroma.mint(alice, fuelOne, pixels, traits);
        chroma.mint(alice, fuelTwo, pixels, traits);

        vm.prank(alice);
        chroma.setApprovalForAll(address(canvas), true);

        _revealBurn(alice, ALICE_TOKEN, fuelOne, bytes(""));
        assert(canvas.getBurnCount(ALICE_TOKEN) == 1);

        _revealBurn(alice, ALICE_TOKEN, fuelTwo, bytes(""));
        assert(canvas.getBurnCount(ALICE_TOKEN) == 2);
    }

    function test_BurnCount_TraitInTokenURI() external {
        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));
        renderer.setCanvas(address(canvas));
        renderer.setChroma(address(chroma));
        chroma.setRenderer(address(renderer));

        uint256 fuelToken = 12;
        bytes memory pixels = new bytes(2048);
        bytes memory traits = new bytes(32);
        chroma.mint(alice, fuelToken, pixels, traits);

        vm.prank(alice);
        chroma.setApprovalForAll(address(canvas), true);
        _revealBurn(alice, ALICE_TOKEN, fuelToken, bytes(""));

        string memory json = _decodeTokenUri(renderer.tokenURI(ALICE_TOKEN));
        assert(_contains(json, '{"display_type":"number","trait_type":"Burns Absorbed","value":1}'));
    }

    function _revealBurn(address user, uint256 receiver, uint256 burned, bytes memory diffData) internal {
        bytes32 salt = keccak256(abi.encodePacked("burn", receiver, burned, diffData));
        bytes32 commitment = keccak256(abi.encode(user, receiver, burned, diffData, salt));
        vm.prank(user);
        canvas.submitCommit(commitment);
        vm.prank(user);
        canvas.revealBurnAndApplyDiff(receiver, burned, salt, diffData);
    }

    function _decodeTokenUri(string memory uri) internal pure returns (string memory) {
        bytes memory prefix = bytes("data:application/json;base64,");
        bytes memory raw = bytes(uri);
        bytes memory encoded = new bytes(raw.length - prefix.length);
        for (uint256 i = 0; i < encoded.length; ++i) {
            encoded[i] = raw[i + prefix.length];
        }
        return string(Base64.decode(string(encoded)));
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; ++i) {
            bool matchFound = true;
            for (uint256 j = 0; j < n.length; ++j) {
                if (h[i + j] != n[j]) {
                    matchFound = false;
                    break;
                }
            }
            if (matchFound) return true;
        }
        return false;
    }
}
