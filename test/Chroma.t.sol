// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;



import {Test} from "forge-std/Test.sol";

import {Chroma} from "../contracts/Chroma.sol";

import {ChromaCanvas} from "../contracts/ChromaCanvas.sol";

import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";

import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ChromaTestHelpers} from "./ChromaTestHelpers.sol";



library TraitFixtures {
    function zeroTraits() internal pure returns (bytes memory) {
        return traitsWithTotalPixels(0);
    }

    function traitsWithTotalPixels(uint16 count) internal pure returns (bytes memory traits) {
        traits = new bytes(32);
        traits[17] = bytes1(uint8(count >> 8));
        traits[18] = bytes1(uint8(count));
    }
}



contract WriterCaller {

    function write(ChromaStorage storageContract, uint256 tokenId, bytes memory pixels, bytes memory traits) external {

        storageContract.writeTokenData(tokenId, pixels, traits);

    }

}



contract MockRendererA {

    function tokenURI(uint256) external pure returns (string memory) {

        return "data:application/json;base64,QQ==";

    }

}



contract MockRendererB {

    function tokenURI(uint256) external pure returns (string memory) {

        return "data:application/json;base64,Qg==";

    }

}



contract CanvasActor {

    function approveCanvas(Chroma chroma, address canvas) external {

        chroma.setApprovalForAll(canvas, true);

    }



    function submit(ChromaCanvas canvas, bytes32 commitment) external {

        canvas.submitCommit(commitment);

    }



    function reveal(ChromaCanvas canvas, uint256 tokenId, uint256 burnedTokenId, bytes32 salt, bytes calldata diffData)

        external

    {

        canvas.revealBurnAndApplyDiff(tokenId, burnedTokenId, salt, diffData);

    }

}



contract ReentrantMintAttacker is IERC721Receiver {
    Chroma internal immutable chroma;
    bool internal reentering;

    constructor(Chroma chroma_) {
        chroma = chroma_;
    }

    function attackPublicMint() external payable {
        if (msg.value < chroma.MINT_PRICE() * 2) revert();
        reentering = false;
        chroma.mint{value: chroma.MINT_PRICE()}(1);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (!reentering) {
            reentering = true;
            chroma.mint{value: chroma.MINT_PRICE()}(1);
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}



contract ChromaStorageTest {

    function test_WriteAndReadRoundTrip() external {

        WriterCaller writer = new WriterCaller();

        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));



        bytes memory pixels = new bytes(2048);

        for (uint256 i = 0; i < 2048; ++i) {

            pixels[i] = bytes1(uint8(i % 256));

        }



        bytes memory traits = hex"0101010202000000000000000000000000000000000000000000000000000000";

        writer.write(storageContract, 7, pixels, traits);



        bytes memory storedPixels = storageContract.getPixels(7);

        bytes memory storedTraits = storageContract.getTraits(7);



        assert(keccak256(storedPixels) == keccak256(pixels));

        assert(keccak256(storedTraits) == keccak256(traits));

    }



    function test_RevertIfUnauthorizedWriter() external {

        WriterCaller writer = new WriterCaller();

        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));

        bytes memory pixels = new bytes(2048);

        bytes memory traits = hex"0101010202000000000000000000000000000000000000000000000000000000";



        (bool success,) = address(storageContract).call(

            abi.encodeWithSelector(storageContract.writeTokenData.selector, 1, pixels, traits)

        );



        assert(!success);

    }



    function test_RevertIfWrittenTwice() external {

        WriterCaller writer = new WriterCaller();

        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));

        bytes memory pixels = new bytes(2048);

        bytes memory traits = hex"0101010202000000000000000000000000000000000000000000000000000000";



        writer.write(storageContract, 3, pixels, traits);

        (bool success,) = address(writer).call(

            abi.encodeWithSelector(WriterCaller.write.selector, storageContract, 3, pixels, traits)

        );



        assert(!success);

    }



    function test_RevertIfInvalidLengths() external {

        WriterCaller writer = new WriterCaller();

        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));

        bytes memory invalidPixels = new bytes(2047);

        bytes memory invalidTraits = hex"01020304";

        bytes memory validPixels = new bytes(2048);

        bytes memory validTraits = hex"0101010202000000000000000000000000000000000000000000000000000000";



        (bool badPixels,) = address(writer).call(

            abi.encodeWithSelector(WriterCaller.write.selector, storageContract, 10, invalidPixels, validTraits)

        );

        (bool badTraits,) = address(writer).call(

            abi.encodeWithSelector(WriterCaller.write.selector, storageContract, 11, validPixels, invalidTraits)

        );



        assert(!badPixels);

        assert(!badTraits);

    }

}



contract ChromaRendererTest {

    function test_RenderSVG_MatchesReferenceByteForByte() external {

        WriterCaller writer = new WriterCaller();

        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));



        bytes memory pixels = new bytes(2048);

        _setPixel(pixels, 0, 0, 4);

        _setPixel(pixels, 1, 0, 5);

        _setPixel(pixels, 2, 0, 5);

        _setPixel(pixels, 3, 0, 5);

        _setPixel(pixels, 2, 1, 1);

        _setPixel(pixels, 3, 1, 1);



        bytes memory traits = TraitFixtures.traitsWithTotalPixels(6);

        writer.write(storageContract, 42, pixels, traits);



        string memory actual = renderer.renderSVG(42);

        string memory expected =

            '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" shape-rendering="crispEdges"><rect width="1024" height="1024" fill="#e3e5e4"/><rect x="0" y="0" width="16" height="16" fill="#4c270f"/><rect x="16" y="0" width="48" height="16" fill="#89532a"/><rect x="32" y="16" width="32" height="16" fill="#1a0d0e"/></svg>';



        assert(keccak256(bytes(actual)) == keccak256(bytes(expected)));

    }



    function test_TokenURI_IsDataURI() external {

        WriterCaller writer = new WriterCaller();

        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));



        bytes memory pixels = new bytes(2048);

        _setPixel(pixels, 0, 0, 15);

        bytes memory traits = TraitFixtures.traitsWithTotalPixels(1);

        writer.write(storageContract, 1, pixels, traits);



        string memory uri = renderer.tokenURI(1);

        bytes memory prefix = bytes("data:application/json;base64,");

        bytes memory uriBytes = bytes(uri);



        assert(uriBytes.length > prefix.length);

        for (uint256 i = 0; i < prefix.length; ++i) {

            assert(uriBytes[i] == prefix[i]);

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

}



contract ChromaTokenTest is Test, ChromaTestHelpers {

    function test_OwnerMint_PlaceholderOnly() external {

        ChromaStorage storageContract = new ChromaStorage(address(this), address(this));

        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));

        address recipient = address(0xBEEF);

        chroma.mint(recipient, 1);

        assert(chroma.ownerOf(1) == recipient);

        assert(chroma.totalSupply() == 1);

        assert(!storageContract.hasData(1));

        assert(!chroma.revealed(1));

    }



    function test_MintRevealInscribe_WritesStorage() external {

        ChromaStorage storageContract = new ChromaStorage(address(this), address(this));

        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));

        chroma.setRenderer(address(renderer));

        bytes memory pixels = new bytes(2048);

        _setPixel(pixels, 0, 0, 12);

        bytes memory traits = TraitFixtures.traitsWithTotalPixels(1);

        address recipient = address(0xBEEF);

        chroma.mint(recipient, 1);

        inscribeToken(chroma, recipient, 1, pixels, traits);

        assert(keccak256(storageContract.getPixels(1)) == keccak256(pixels));

        assert(keccak256(storageContract.getTraits(1)) == keccak256(traits));

    }



    function test_TokenURI_ReturnsDataURI() external {

        ChromaStorage storageContract = new ChromaStorage(address(this), address(this));

        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));

        chroma.setRenderer(address(renderer));



        bytes memory pixels = new bytes(2048);

        _setPixel(pixels, 1, 0, 15);

        bytes memory traits = hex"0101000000000000000000000201000000000000000000000000000000000000";

        address recipient = address(0xBEEF);

        chroma.mint(recipient, 1);

        inscribeToken(chroma, recipient, 1, pixels, traits);

        string memory uri = chroma.tokenURI(1);

        bytes memory prefix = bytes("data:application/json;base64,");

        bytes memory uriBytes = bytes(uri);

        assert(uriBytes.length > prefix.length);

        for (uint256 i = 0; i < prefix.length; ++i) {

            assert(uriBytes[i] == prefix[i]);

        }

    }



    function test_RoyaltyInfo_DefaultRoyalty() external {

        ChromaStorage storageContract = new ChromaStorage(address(this), address(this));

        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);



        (address receiver, uint256 royaltyAmount) = chroma.royaltyInfo(1, 1 ether);

        assert(receiver == address(this));

        assert(royaltyAmount == 0.05 ether);

    }



    function test_RendererSwap_Works() external {

        ChromaStorage storageContract = new ChromaStorage(address(this), address(this));

        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));



        MockRendererA rendererA = new MockRendererA();

        MockRendererB rendererB = new MockRendererB();



        bytes memory pixels = new bytes(2048);

        bytes memory traits = TraitFixtures.zeroTraits();

        address recipient = address(0xBEEF);

        chroma.mint(recipient, 1);

        inscribeToken(chroma, recipient, 1, pixels, traits);

        chroma.setRenderer(address(rendererA));

        string memory uriA = chroma.tokenURI(1);

        chroma.setRenderer(address(rendererB));

        string memory uriB = chroma.tokenURI(1);



        assert(keccak256(bytes(uriA)) != keccak256(bytes(uriB)));

        assert(keccak256(bytes(uriA)) == keccak256(bytes("data:application/json;base64,QQ==")));

        assert(keccak256(bytes(uriB)) == keccak256(bytes("data:application/json;base64,Qg==")));

    }



    function test_SupplyCap_Enforced() external {

        ChromaStorage storageContract = new ChromaStorage(address(this), address(this));

        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));



        address holder = address(0xBEEF);

        for (uint256 i = 1; i <= 5149; ++i) {
            chroma.mint(holder, i);
        }

        chroma.mint(holder, 5150);

        assert(chroma.totalSupply() == 5150);

        vm.expectRevert(Chroma.MaxSupplyReached.selector);

        chroma.mint(holder, 5151);

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

}



contract ChromaCanvasTest is Test, ChromaTestHelpers {

    ChromaStorage internal storageContract;

    Chroma internal chroma;

    ChromaCanvas internal canvas;

    bytes internal basePixels;

    bytes internal baseTraits;



    function setUp() public {

        storageContract = new ChromaStorage(address(this), address(this));

        chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));

        canvas = new ChromaCanvas(address(chroma), address(storageContract), address(this));

        basePixels = new bytes(2048);

        baseTraits = TraitFixtures.zeroTraits();

    }



    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {

        return this.onERC721Received.selector;

    }



    function _mintAt(address to, uint256 tokenId) internal {
        while (chroma.totalSupply() + 1 < tokenId) {
            chroma.mint(address(this), chroma.totalSupply() + 1);
        }
        chroma.mint(to, tokenId);
    }

    function _mintRevealed(uint256 tokenId, bytes memory pixels, bytes memory traits) internal {
        _mintAt(address(this), tokenId);
        revealToken(chroma, address(this), tokenId, pixels, traits);
    }

    function _mintInscribed(uint256 tokenId, bytes memory pixels, bytes memory traits) internal {
        _mintAt(address(this), tokenId);
        inscribeToken(chroma, address(this), tokenId, pixels, traits);
    }

    function _revealOnly(uint256 tokenId, bytes memory pixels, bytes memory traits) internal {
        revealToken(chroma, address(this), tokenId, pixels, traits);
    }

    function test_CommitRevealBurnApplyDiff_AndCompositeRender() external {

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));

        renderer.setCanvas(address(canvas));

        chroma.setRenderer(address(renderer));



        address artTokenOwner = address(0xBEEF);

        _mintAt(artTokenOwner, 200);

        _revealOnly(200, basePixels, baseTraits);

        _mintInscribed(201, basePixels, baseTraits);

        chroma.setApprovalForAll(address(canvas), true);



        bytes memory diffData = hex"00000f";

        bytes32 salt = keccak256("salt");

        bytes32 commitment = keccak256(abi.encode(address(this), uint256(200), uint256(201), diffData, salt));



        canvas.submitCommit(commitment);

        canvas.revealBurnAndApplyDiff(200, 201, salt, diffData);



        (uint16[] memory indexes, uint8[] memory colors) = canvas.getDiff(200);

        assert(indexes.length == 1);

        assert(indexes[0] == 0);

        assert(colors[0] == 15);



        (uint256 points,, bool customized,) = canvas.getCanvasInfo(address(this), 200);

        assert(customized);

        assert(points == 99);

        chroma.setCanvas(address(canvas));

        bytes32 leaf = keccak256(abi.encode(uint256(200), basePixels, baseTraits));
        chroma.setRevealRoot(leaf);
        bytes32[] memory proof = emptyProof();

        vm.prank(artTokenOwner);
        chroma.inscribe(200, basePixels, baseTraits, proof);

        string memory svg = renderer.renderSVG(200);

        assert(_contains(svg, 'fill="#db5a91"'));

        assert(_contains(svg, '<rect x="0" y="0" width="16" height="16"'));

    }



    function test_RecursiveBurnMultiplier() external {

        _mintRevealed(300, basePixels, baseTraits);

        _mintRevealed(301, basePixels, baseTraits);

        _mintRevealed(302, basePixels, baseTraits);

        chroma.setApprovalForAll(address(canvas), true);



        bytes32 saltFuel = keccak256("fuel");

        bytes32 commitFuel = keccak256(abi.encode(address(this), uint256(300), uint256(302), bytes(""), saltFuel));

        canvas.submitCommit(commitFuel);

        canvas.revealBurnAndApplyDiff(300, 302, saltFuel, bytes(""));



        bytes memory diffData = new bytes(150);

        for (uint256 i = 0; i < 50; ++i) {

            uint16 pixelIndex = uint16(i + 1);

            diffData[i * 3] = bytes1(uint8(pixelIndex >> 8));

            diffData[i * 3 + 1] = bytes1(uint8(pixelIndex));

            diffData[i * 3 + 2] = bytes1(uint8(1));

        }

        canvas.applyDiff(301, diffData);



        bytes32 saltBurn = keccak256("burn");

        bytes32 commitBurn = keccak256(abi.encode(address(this), uint256(300), uint256(301), bytes(""), saltBurn));

        canvas.submitCommit(commitBurn);

        canvas.revealBurnAndApplyDiff(300, 301, saltBurn, bytes(""));



        (uint256 points,,,) = canvas.getCanvasInfo(address(this), 300);

        assert(points == 155);

    }



    function _grantActionPoints(uint256 tokenId, uint256 burnedTokenId) internal {
        bytes32 salt = keccak256(abi.encodePacked("ap", tokenId, burnedTokenId));
        bytes32 commitment = keccak256(abi.encode(address(this), tokenId, burnedTokenId, bytes(""), salt));
        canvas.submitCommit(commitment);
        canvas.revealBurnAndApplyDiff(tokenId, burnedTokenId, salt, bytes(""));
    }

    function test_ActionPointsTransfer() external {

        _mintRevealed(500, basePixels, baseTraits);

        _mintRevealed(501, basePixels, baseTraits);

        chroma.setApprovalForAll(address(canvas), true);



        bytes32 salt = keccak256("transfer");

        bytes32 commitment = keccak256(abi.encode(address(this), uint256(500), uint256(501), bytes(""), salt));

        canvas.submitCommit(commitment);

        canvas.revealBurnAndApplyDiff(500, 501, salt, bytes(""));



        address recipient = address(0xCAFE);

        canvas.transferActionPoints(recipient, 40);



        assert(canvas.actionPoints(address(this)) == 60);

        assert(canvas.actionPoints(recipient) == 40);



        vm.expectRevert(ChromaCanvas.InsufficientActionPoints.selector);

        canvas.transferActionPoints(recipient, 100);

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



    function _inscribeLeaf(uint256 tokenId, bytes memory pixels, bytes memory traits)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(tokenId, pixels, traits));
    }



    function _lockToken(uint256 tokenId, bytes memory pixels, bytes memory traits) internal {
        if (!chroma.revealed(tokenId)) {
            _revealOnly(tokenId, pixels, traits);
        }
        inscribeToken(chroma, address(this), tokenId, pixels, traits);
    }

    function test_Canvas_Blocked_WhenLocked() external {
        _mintAt(address(this), 600);
        _lockToken(600, basePixels, baseTraits);

        vm.expectRevert(ChromaCanvas.TokenLocked.selector);
        canvas.applyDiff(600, hex"00000f");
    }



    function test_Level_StartsAtOne() external {
        _mintAt(address(this), 700);
        assert(canvas.level(700) == 1);
        assert(canvas.totalApSpent(700) == 0);
    }

    function test_Level_IncreasesWithApSpend() external {
        _mintRevealed(701, basePixels, baseTraits);
        _mintRevealed(702, basePixels, baseTraits);
        chroma.setApprovalForAll(address(canvas), true);
        _grantActionPoints(701, 702);

        bytes memory diffData = new bytes(300);
        for (uint256 i = 0; i < 100; ++i) {
            uint16 pixelIndex = uint16(i + 1);
            diffData[i * 3] = bytes1(uint8(pixelIndex >> 8));
            diffData[i * 3 + 1] = bytes1(uint8(pixelIndex));
            diffData[i * 3 + 2] = bytes1(uint8(1));
        }

        canvas.applyDiff(701, diffData);

        assert(canvas.totalApSpent(701) == 100);
        assert(canvas.level(701) == 2);
    }

    function test_Level_TraitInTokenURI() external {
        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));
        renderer.setCanvas(address(canvas));
        chroma.setRenderer(address(renderer));

        _mintRevealed(703, basePixels, baseTraits);
        _mintInscribed(704, basePixels, baseTraits);
        chroma.setApprovalForAll(address(canvas), true);
        _grantActionPoints(703, 704);

        bytes memory diffData = new bytes(300);
        for (uint256 i = 0; i < 100; ++i) {
            uint16 pixelIndex = uint16(i + 1);
            diffData[i * 3] = bytes1(uint8(pixelIndex >> 8));
            diffData[i * 3 + 1] = bytes1(uint8(pixelIndex));
            diffData[i * 3 + 2] = bytes1(uint8(1));
        }
        canvas.applyDiff(703, diffData);

        inscribeToken(chroma, address(this), 703, basePixels, baseTraits);

        string memory json = _decodeTokenUri(renderer.tokenURI(703));
        assert(_contains(json, '{"display_type":"number","trait_type":"Level","value":0}'));
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

}



contract ChromaPhaseMintTest is Test, ChromaTestHelpers {

    Chroma internal chroma;

    ChromaStorage internal storageContract;



    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {

        return this.onERC721Received.selector;

    }



    function setUp() public {

        storageContract = new ChromaStorage(address(this), address(this));

        chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));

    }



    function _leaf(address account) internal pure returns (bytes32) {

        return keccak256(abi.encodePacked(account));

    }



    function _revealLeaf(uint256 tokenId, bytes memory pixels, bytes memory traits)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(tokenId, pixels, traits));
    }



    function test_AllowlistOne_Mint() external {

        bytes32[] memory proof = new bytes32[](0);

        chroma.setMerkleRootOne(_leaf(address(this)));

        chroma.setPhase(Chroma.Phase.AllowlistOne);



        chroma.mint{value: 0.0025 ether}(proof, 1);



        assert(chroma.ownerOf(1) == address(this));

        assert(chroma.claimedOne(address(this)) == 1);

        assert(chroma.totalSupply() == 1);

        assert(!chroma.revealed(1));

    }



    function test_AllowlistTwo_Mint() external {

        bytes32[] memory proof = new bytes32[](0);

        chroma.setMerkleRootTwo(_leaf(address(this)));

        chroma.setPhase(Chroma.Phase.AllowlistTwo);



        chroma.mint{value: 0.0035 ether}(proof, 1);



        assert(chroma.ownerOf(1) == address(this));

        assert(chroma.claimedTwo(address(this)) == 1);

        assert(chroma.totalSupply() == 1);

    }



    function test_Public_Mint() external {

        chroma.setPhase(Chroma.Phase.Public);



        chroma.mint{value: 0.0045 ether}(1);



        assert(chroma.ownerOf(1) == address(this));

        assert(chroma.claimedPublic(address(this)) == 1);

        assert(chroma.totalSupply() == 1);

    }



    function test_ReentrantPublicMint_Reverts() external {
        chroma.setPhase(Chroma.Phase.Public);

        ReentrantMintAttacker attacker = new ReentrantMintAttacker(chroma);
        vm.deal(address(attacker), 1 ether);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        attacker.attackPublicMint{value: 0.009 ether}();

        assertEq(chroma.totalSupply(), 0);
    }



    function test_Reveal_StoresTraitsNotPixels() external {

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));

        chroma.setRenderer(address(renderer));

        chroma.setPhase(Chroma.Phase.Public);

        chroma.mint{value: 0.0045 ether}(1);

        assert(!storageContract.hasData(1));

        assert(!chroma.revealed(1));

        bytes memory pixels = new bytes(2048);

        _setPixel(pixels, 0, 0, 4);

        bytes memory traits = TraitFixtures.traitsWithTotalPixels(1);

        bytes32 leaf = _revealLeaf(1, pixels, traits);

        chroma.setRevealRoot(leaf);

        bytes32[] memory proof = new bytes32[](0);

        chroma.reveal(1, pixels, traits, proof);

        assert(chroma.revealed(1));

        assert(!storageContract.hasData(1));

        assert(chroma.revealedTraits(1) == bytes32(traits));

        chroma.setRevealedBaseURI("ipfs://test/metadata/");

        string memory uri = chroma.tokenURI(1);

        assert(_containsPhase(uri, "ipfs://test/metadata/1.json"));

    }



    function test_Inscribe_WritesPixelsAndLocks() external {
        chroma.setPhase(Chroma.Phase.Public);
        chroma.mint{value: 0.0045 ether}(1);

        bytes memory pixels = new bytes(2048);
        _setPixel(pixels, 0, 0, 4);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(1);

        bytes32 leaf = _revealLeaf(1, pixels, traits);
        chroma.setRevealRoot(leaf);
        bytes32[] memory proof = new bytes32[](0);

        chroma.reveal(1, pixels, traits, proof);

        chroma.inscribe(1, pixels, traits, proof);

        assert(chroma.locked(1));
        assert(chroma.isLocked(1));
        assert(chroma.revealed(1));
        assert(storageContract.hasData(1));
        assert(keccak256(storageContract.getPixels(1)) == keccak256(pixels));
    }



    function test_Inscribe_LocksToken() external {
        chroma.setPhase(Chroma.Phase.Public);
        chroma.mint{value: 0.0045 ether}(1);

        bytes memory pixels = new bytes(2048);
        _setPixel(pixels, 0, 0, 4);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(1);

        bytes32 leaf = _revealLeaf(1, pixels, traits);
        chroma.setRevealRoot(leaf);
        bytes32[] memory proof = new bytes32[](0);

        chroma.reveal(1, pixels, traits, proof);
        chroma.inscribe(1, pixels, traits, proof);

        assert(chroma.locked(1));
        assert(chroma.isLocked(1));
        assert(chroma.revealed(1));
        assert(storageContract.hasData(1));
        assert(keccak256(storageContract.getPixels(1)) == keccak256(pixels));
    }



    function test_Inscribe_NonOwner_Reverts() external {
        chroma.setPhase(Chroma.Phase.Public);
        chroma.mint{value: 0.0045 ether}(1);

        bytes memory pixels = new bytes(2048);
        bytes memory traits = TraitFixtures.zeroTraits();
        bytes32 leaf = _revealLeaf(1, pixels, traits);
        chroma.setRevealRoot(leaf);
        bytes32[] memory proof = new bytes32[](0);

        vm.prank(address(0xBEEF));
        vm.expectRevert(Chroma.NotTokenOwner.selector);
        chroma.inscribe(1, pixels, traits, proof);
    }



    function test_Reveal_InvalidProof_Reverts() external {

        chroma.setPhase(Chroma.Phase.Public);

        chroma.mint{value: 0.0045 ether}(1);



        bytes memory pixels = new bytes(2048);

        _setPixel(pixels, 0, 0, 4);

        bytes memory traits = TraitFixtures.traitsWithTotalPixels(1);



        chroma.setRevealRoot(bytes32(uint256(0xdeadbeef)));



        bytes32[] memory proof = new bytes32[](1);

        proof[0] = bytes32(uint256(1));



        vm.expectRevert(Chroma.InvalidMerkleProof.selector);

        chroma.reveal(1, pixels, traits, proof);

    }



    function test_WrongPhase_Reverts() external {

        bytes32[] memory proof = new bytes32[](0);

        chroma.setMerkleRootOne(_leaf(address(this)));



        vm.expectRevert(Chroma.WrongPhase.selector);

        chroma.mint{value: 0.0025 ether}(proof, 1);



        vm.expectRevert(Chroma.WrongPhase.selector);

        chroma.mint{value: 0.0045 ether}(1);

    }



    function test_MaxPerWallet_AllowlistOne_FiveThenSixthReverts() external {
        bytes32[] memory proof = new bytes32[](0);
        chroma.setMerkleRootOne(_leaf(address(this)));
        chroma.setPhase(Chroma.Phase.AllowlistOne);

        uint256 unitPrice = chroma.ALLOWLIST_ONE_PRICE();
        chroma.mint{value: unitPrice * 5}(proof, 5);
        assert(chroma.claimedOne(address(this)) == 5);
        assert(chroma.totalSupply() == 5);

        vm.expectRevert(Chroma.MaxPerWalletExceeded.selector);
        chroma.mint{value: unitPrice}(proof, 1);
    }

    function test_MaxPerWallet_AllowlistTwo_FiveThenSixthReverts() external {
        bytes32[] memory proof = new bytes32[](0);
        chroma.setMerkleRootTwo(_leaf(address(this)));
        chroma.setPhase(Chroma.Phase.AllowlistTwo);

        uint256 unitPrice = chroma.ALLOWLIST_TWO_PRICE();
        chroma.mint{value: unitPrice * 5}(proof, 5);
        assert(chroma.claimedTwo(address(this)) == 5);

        vm.expectRevert(Chroma.MaxPerWalletExceeded.selector);
        chroma.mint{value: unitPrice}(proof, 1);
    }

    function test_MaxPerWallet_Public_FiveThenSixthReverts() external {
        chroma.setPhase(Chroma.Phase.Public);

        uint256 unitPrice = chroma.MINT_PRICE();
        chroma.mint{value: unitPrice * 5}(5);
        assert(chroma.claimedPublic(address(this)) == 5);

        vm.expectRevert(Chroma.MaxPerWalletExceeded.selector);
        chroma.mint{value: unitPrice}(1);
    }

    function test_Public_Rollover_UnsoldAllowlistSupplyStillMintable() external {
        bytes32[] memory proof = new bytes32[](0);
        chroma.setMerkleRootOne(_leaf(address(this)));
        chroma.setPhase(Chroma.Phase.AllowlistOne);
        uint256 tierOnePrice = chroma.ALLOWLIST_ONE_PRICE();
        chroma.mint{value: tierOnePrice * 5}(proof, 5);
        assert(chroma.mintedAllowlistOne() == 5);
        assert(chroma.mintedAllowlistOne() < chroma.MAX_MINT_ALLOWLIST_ONE());

        chroma.setPhase(Chroma.Phase.Public);
        uint256 publicPrice = chroma.MINT_PRICE();
        chroma.mint{value: publicPrice * 5}(5);
        assert(chroma.totalSupply() == 10);
        assert(chroma.claimedPublic(address(this)) == 5);
    }

    function test_CommunityCap_ProtectsTeamReserve() external {
        for (uint256 i = 0; i < 4949; ++i) {
            chroma.mint(address(this), i + 1);
        }
        assert(chroma.totalSupply() == 4949);

        chroma.setPhase(Chroma.Phase.Public);
        uint256 publicPrice = chroma.MINT_PRICE();
        chroma.mint{value: publicPrice}(1);
        assert(chroma.totalSupply() == 4950);

        vm.expectRevert(Chroma.MaxSupplyReached.selector);
        chroma.mint{value: publicPrice}(1);

        chroma.mint(address(this), 4951);
        assert(chroma.totalSupply() == 4951);
    }

    function test_PhaseSupply_AllowlistOne_Capped() external {
        address buyer = makeAddr("buyer");
        bytes32[] memory proof = new bytes32[](0);
        chroma.setMerkleRootOne(_leaf(buyer));
        chroma.setPhase(Chroma.Phase.AllowlistOne);

        uint256 unitPrice = chroma.ALLOWLIST_ONE_PRICE();
        vm.deal(buyer, 10_000 ether);
        vm.startPrank(buyer);
        for (uint256 i = 0; i < 500; ++i) {
            chroma.mint{value: unitPrice * 5}(proof, 5);
            vm.stopPrank();
            chroma.resetClaimed(buyer);
            vm.startPrank(buyer);
        }
        vm.stopPrank();
        assert(chroma.mintedAllowlistOne() == 2500);

        vm.prank(buyer);
        vm.expectRevert(Chroma.PhaseSupplyExceeded.selector);
        chroma.mint{value: unitPrice}(proof, 1);
    }



    function test_TokenURI_ThreeStates() external {
        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));
        chroma.setRenderer(address(renderer));
        chroma.setRevealedBaseURI("ipfs://collection/metadata/");

        chroma.setPhase(Chroma.Phase.Public);
        chroma.mint{value: 0.0045 ether}(1);

        string memory unrevealed = chroma.tokenURI(1);
        assert(_containsPhase(_decodePhaseTokenUri(unrevealed), "Unrevealed"));

        bytes memory pixels = new bytes(2048);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(42);
        bytes32 leaf = _revealLeaf(1, pixels, traits);
        chroma.setRevealRoot(leaf);
        bytes32[] memory proof = new bytes32[](0);

        chroma.reveal(1, pixels, traits, proof);
        string memory revealed = chroma.tokenURI(1);
        assert(_containsPhase(revealed, "ipfs://collection/metadata/1.json"));

        chroma.inscribe(1, pixels, traits, proof);
        string memory inscribed = chroma.tokenURI(1);
        bytes memory prefix = bytes("data:application/json;base64,");
        assert(bytes(inscribed).length > prefix.length);
    }

    function test_Gas_RevealUnderBudget() external {
        chroma.setPhase(Chroma.Phase.Public);
        chroma.mint{value: 0.0045 ether}(1);

        bytes memory pixels = new bytes(2048);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(10);
        chroma.setRevealRoot(_revealLeaf(1, pixels, traits));
        bytes32[] memory proof = new bytes32[](0);

        uint256 gasBefore = gasleft();
        chroma.reveal(1, pixels, traits, proof);
        uint256 gasUsed = gasBefore - gasleft();
        assert(gasUsed < 120_000);
    }

    function test_Gas_InscribeOverRevealBudget() external {
        chroma.setPhase(Chroma.Phase.Public);
        chroma.mint{value: 0.0045 ether}(1);

        bytes memory pixels = new bytes(2048);
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(10);
        chroma.setRevealRoot(_revealLeaf(1, pixels, traits));
        bytes32[] memory proof = new bytes32[](0);

        chroma.reveal(1, pixels, traits, proof);

        uint256 gasBefore = gasleft();
        chroma.inscribe(1, pixels, traits, proof);
        uint256 gasUsed = gasBefore - gasleft();
        assert(gasUsed > 400_000);
    }

    function test_Inscribe_RequiresPriorReveal() external {
        chroma.setPhase(Chroma.Phase.Public);
        chroma.mint{value: 0.0045 ether}(1);

        bytes memory pixels = new bytes(2048);
        bytes memory traits = TraitFixtures.zeroTraits();
        chroma.setRevealRoot(_revealLeaf(1, pixels, traits));
        bytes32[] memory proof = new bytes32[](0);

        vm.expectRevert(Chroma.NotRevealed.selector);
        chroma.inscribe(1, pixels, traits, proof);
    }

    function _decodePhaseTokenUri(string memory uri) internal pure returns (string memory) {
        bytes memory prefix = bytes("data:application/json;base64,");
        bytes memory raw = bytes(uri);
        bytes memory encoded = new bytes(raw.length - prefix.length);
        for (uint256 i = 0; i < encoded.length; ++i) {
            encoded[i] = raw[i + prefix.length];
        }
        return string(Base64.decode(string(encoded)));
    }

    function _containsPhase(string memory haystack, string memory needle) internal pure returns (bool) {
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

}


