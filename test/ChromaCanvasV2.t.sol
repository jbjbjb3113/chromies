// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {Chroma} from "../contracts/Chroma.sol";
import {ChromaCanvasV2} from "../contracts/ChromaCanvasV2.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {PixelMarketplace} from "../contracts/PixelMarketplace.sol";
import {TraitFixtures} from "./Chroma.t.sol";
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
        bytes memory traits = TraitFixtures.zeroTraits();
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
        bytes memory traits = TraitFixtures.zeroTraits();
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
        bytes memory traits = TraitFixtures.zeroTraits();
        chroma.mint(alice, fuelToken, pixels, traits);

        vm.prank(alice);
        chroma.setApprovalForAll(address(canvas), true);
        _revealBurn(alice, ALICE_TOKEN, fuelToken, bytes(""));

        string memory json = _decodeTokenUri(renderer.tokenURI(ALICE_TOKEN));
        assert(_contains(json, '{"display_type":"number","trait_type":"Burns Absorbed","value":1}'));
    }

    // ========================================================================
    // Customized + pixels edited + total pixels traits
    // ========================================================================

    function test_Customized_StartsFalse() external view {
        assert(!canvas.isCustomized(ALICE_TOKEN));
        assert(!canvas.customized(ALICE_TOKEN));
    }

    function test_Customized_TrueAfterApplyDiff() external {
        canvas.earnAP(ALICE_TOKEN, 10);
        vm.prank(alice);
        canvas.applyDiff(ALICE_TOKEN, hex"00000f");

        assert(canvas.isCustomized(ALICE_TOKEN));
        assert(canvas.customized(ALICE_TOKEN));
    }

    function test_Customized_TraitInTokenURI() external {
        ChromaRenderer renderer = _setupRenderer();

        canvas.earnAP(ALICE_TOKEN, 10);
        vm.prank(alice);
        canvas.applyDiff(ALICE_TOKEN, hex"00000f");

        string memory json = _decodeTokenUri(renderer.tokenURI(ALICE_TOKEN));
        assert(_contains(json, '{"trait_type":"Customized","value":"Yes"}'));
    }

    function test_PixelsEdited_StartsZero() external view {
        assert(canvas.getPixelsEdited(ALICE_TOKEN) == 0);
        assert(canvas.pixelsEdited(ALICE_TOKEN) == 0);
    }

    function test_PixelsEdited_AccumulatesOnApplyDiff() external {
        canvas.earnAP(ALICE_TOKEN, 10);

        vm.prank(alice);
        canvas.applyDiff(ALICE_TOKEN, hex"00010f00020f");
        assert(canvas.getPixelsEdited(ALICE_TOKEN) == 2);

        vm.prank(alice);
        canvas.applyDiff(ALICE_TOKEN, hex"00030f00040f00050f");
        assert(canvas.getPixelsEdited(ALICE_TOKEN) == 5);
    }

    function test_PixelsEdited_TraitInTokenURI() external {
        ChromaRenderer renderer = _setupRenderer();

        canvas.earnAP(ALICE_TOKEN, 10);
        vm.prank(alice);
        canvas.applyDiff(ALICE_TOKEN, hex"00010f00020f");

        string memory json = _decodeTokenUri(renderer.tokenURI(ALICE_TOKEN));
        assert(_contains(json, '{"display_type":"number","trait_type":"Pixels Edited","value":2}'));
    }

    function test_TotalPixels_CalculatedOnMint() external {
        uint256 tokenId = 20;
        bytes memory pixels = _pixelsWithNonZeroCount(3);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(3);
        chroma.mint(alice, tokenId, pixels, traits);

        assert(storageContract.getTotalPixels(tokenId) == 3);
        assert(storageContract.totalPixels(tokenId) == 3);
        assert(canvas.getTotalPixels(tokenId) == 3);
    }

    function test_Inscribe_PreservesCustomizedPixels() external {
        chroma.setCanvas(address(canvas));
        ChromaRenderer renderer = _setupRenderer();

        canvas.earnAP(ALICE_TOKEN, 10);
        vm.prank(alice);
        canvas.applyDiff(ALICE_TOKEN, hex"00000f");

        bytes memory beforeInscribe = storageContract.getPixels(ALICE_TOKEN);
        assert(_getPixel(beforeInscribe, 0) == 0);

        bytes memory maliciousPixels = new bytes(2048);
        _setPixel(maliciousPixels, 0, 0, 4);
        bytes memory traits = storageContract.getTraits(ALICE_TOKEN);

        vm.prank(alice);
        chroma.inscribe(ALICE_TOKEN, maliciousPixels, traits, new bytes32[](0));

        assert(chroma.isLocked(ALICE_TOKEN));

        bytes memory baked = storageContract.getPixels(ALICE_TOKEN);
        assert(_getPixel(baked, 0) == 15);
        assert(_getPixel(baked, 0) != _getPixel(maliciousPixels, 0));

        (uint16[] memory indexes,) = canvas.getDiff(ALICE_TOKEN);
        assert(indexes.length == 0);

        string memory svg = renderer.renderSVG(ALICE_TOKEN);
        assert(_contains(svg, 'fill="#db5a91"'));
    }

    function test_Inscribe_LockOnly_PreservesCustomizedPixels() external {
        chroma.setCanvas(address(canvas));

        canvas.earnAP(ALICE_TOKEN, 10);
        vm.prank(alice);
        canvas.applyDiff(ALICE_TOKEN, hex"00000f");

        vm.prank(alice);
        chroma.inscribe(ALICE_TOKEN);

        assert(chroma.isLocked(ALICE_TOKEN));
        bytes memory baked = storageContract.getPixels(ALICE_TOKEN);
        assert(_getPixel(baked, 0) == 15);
    }

    function test_TotalPixels_TraitInTokenURI() external {
        ChromaRenderer renderer = _setupRenderer();

        uint256 tokenId = 21;
        bytes memory pixels = _pixelsWithNonZeroCount(4);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(4);
        chroma.mint(alice, tokenId, pixels, traits);

        string memory json = _decodeTokenUri(renderer.tokenURI(tokenId));
        assert(_contains(json, '{"display_type":"number","trait_type":"Total Pixels","value":4}'));
    }

    function test_TotalPixels_UnchangedByEdits() external {
        uint256 tokenId = 22;
        bytes memory pixels = _pixelsWithNonZeroCount(5);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(5);
        chroma.mint(alice, tokenId, pixels, traits);

        uint256 before = storageContract.getTotalPixels(tokenId);
        canvas.earnAP(tokenId, 10);
        vm.prank(alice);
        canvas.applyDiff(tokenId, hex"00000f00010f");

        assert(storageContract.getTotalPixels(tokenId) == before);
        assert(before == 5);
        assert(canvas.getPixelsEdited(tokenId) == 2);
    }

    // ========================================================================
    // Tiered burn AP
    // ========================================================================

    function test_CalculateBurnAP_LowPixelCount() external {
        uint256 tokenId = 30;
        bytes memory pixels = _pixelsWithNonZeroCount(100);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(100);
        chroma.mint(alice, tokenId, pixels, traits);

        assert(canvas.calculateBurnAP(tokenId) == 1);
    }

    function test_CalculateBurnAP_MidPixelCount() external {
        uint256 tokenId = 31;
        bytes memory pixels = _pixelsWithNonZeroCount(500);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(500);
        chroma.mint(alice, tokenId, pixels, traits);

        assert(canvas.calculateBurnAP(tokenId) == 10);
    }

    function test_CalculateBurnAP_HighPixelCount() external {
        uint256 tokenId = 32;
        bytes memory pixels = _pixelsWithNonZeroCount(900);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(900);
        chroma.mint(alice, tokenId, pixels, traits);

        assert(canvas.calculateBurnAP(tokenId) == 27);
    }

    function test_RevealBurn_CreditsCalculatedAP() external {
        uint256 fuelToken = 33;
        bytes memory pixels = _pixelsWithNonZeroCount(500);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(500);
        chroma.mint(alice, fuelToken, pixels, traits);

        vm.prank(alice);
        chroma.setApprovalForAll(address(canvas), true);

        assert(canvas.actionPoints(ALICE_TOKEN) == 0);
        _revealBurn(alice, ALICE_TOKEN, fuelToken, bytes(""));

        assert(canvas.actionPoints(ALICE_TOKEN) == 10);
        assert(canvas.getBurnCount(ALICE_TOKEN) == 1);
    }

    function _setupRenderer() internal returns (ChromaRenderer renderer) {
        renderer = new ChromaRenderer(address(storageContract), address(this));
        renderer.setCanvas(address(canvas));
        renderer.setChroma(address(chroma));
        chroma.setRenderer(address(renderer));
    }

    function _pixelsWithNonZeroCount(uint256 count) internal pure returns (bytes memory pixels) {
        pixels = new bytes(2048);
        for (uint256 i = 0; i < count; ++i) {
            _setPixel(pixels, i, 0, 1);
        }
    }

    function _setPixel(bytes memory packedPixels, uint256 x, uint256 y, uint8 value) internal pure {
        uint256 flatIndex = y * 64 + x;
        uint256 byteIndex = flatIndex >> 1;
        uint8 current = uint8(packedPixels[byteIndex]);
        if ((flatIndex & 1) == 0) {
            packedPixels[byteIndex] = bytes1((current & 0x0f) | (value << 4));
        } else {
            packedPixels[byteIndex] = bytes1((current & 0xf0) | value);
        }
    }

    function _getPixel(bytes memory packedPixels, uint256 flatIndex) internal pure returns (uint8) {
        uint256 byteIndex = flatIndex >> 1;
        uint8 current = uint8(packedPixels[byteIndex]);
        if ((flatIndex & 1) == 0) {
            return current >> 4;
        }
        return current & 0x0f;
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
