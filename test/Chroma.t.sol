// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;



import {Test} from "forge-std/Test.sol";

import {Chroma} from "../contracts/Chroma.sol";

import {ChromaCanvas} from "../contracts/ChromaCanvas.sol";

import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";

import {ChromaStorage} from "../contracts/ChromaStorage.sol";



library TraitFixtures {
    function zeroTraits() internal pure returns (bytes memory) {
        return hex"0000000000000000000000000000000000000000000000000000000000000000";
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



        bytes memory traits = TraitFixtures.zeroTraits();

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

        bytes memory traits = TraitFixtures.zeroTraits();

        writer.write(storageContract, 1, pixels, traits);



        string memory uri = renderer.tokenURI(1);

        bytes memory prefix = bytes("data:application/json;base64,");

        bytes memory uriBytes = bytes(uri);



        assert(uriBytes.length > prefix.length);

        for (uint256 i = 0; i < prefix.length; ++i) {

            assert(uriBytes[i] == prefix[i]);

        }

    }



    function test_MutationTier_AffectsRender() external {

        WriterCaller writer = new WriterCaller();

        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));



        bytes memory pixels = new bytes(2048);

        for (uint256 x = 0; x < 64; ++x) {

            _setPixel(pixels, x, 10, 6);

        }



        bytes memory pristineTraits = TraitFixtures.zeroTraits();

        bytes memory offKilterTraits =

            hex"0000000000000000000000000000000300000000000000000000000000000000";



        writer.write(storageContract, 100, pixels, pristineTraits);

        writer.write(storageContract, 101, pixels, offKilterTraits);



        string memory svgPristine = renderer.renderSVG(100);

        string memory svgMutated = renderer.renderSVG(101);



        assert(keccak256(bytes(svgPristine)) != keccak256(bytes(svgMutated)));

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



contract ChromaTokenTest is Test {

    function test_Mint_WritesStorage_AndMintsERC721() external {

        ChromaStorage storageContract = new ChromaStorage(address(this), address(0));

        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));



        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));

        chroma.setRenderer(address(renderer));



        bytes memory pixels = new bytes(2048);

        _setPixel(pixels, 0, 0, 12);

        bytes memory traits = TraitFixtures.zeroTraits();

        address recipient = address(0xBEEF);

        chroma.mint(recipient, 100, pixels, traits);



        assert(chroma.ownerOf(100) == recipient);

        assert(chroma.totalSupply() == 1);

        assert(keccak256(storageContract.getPixels(100)) == keccak256(pixels));

        assert(keccak256(storageContract.getTraits(100)) == keccak256(traits));

    }



    function test_TokenURI_ReturnsDataURI() external {

        ChromaStorage storageContract = new ChromaStorage(address(this), address(0));

        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));

        chroma.setRenderer(address(renderer));



        bytes memory pixels = new bytes(2048);

        _setPixel(pixels, 1, 0, 15);

        bytes memory traits = hex"0101000000000000000000000201000000000000000000000000000000000000";

        address recipient = address(0xBEEF);

        chroma.mint(recipient, 101, pixels, traits);



        string memory uri = chroma.tokenURI(101);

        bytes memory prefix = bytes("data:application/json;base64,");

        bytes memory uriBytes = bytes(uri);

        assert(uriBytes.length > prefix.length);

        for (uint256 i = 0; i < prefix.length; ++i) {

            assert(uriBytes[i] == prefix[i]);

        }

    }



    function test_RoyaltyInfo_DefaultRoyalty() external {

        ChromaStorage storageContract = new ChromaStorage(address(this), address(0));

        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);



        (address receiver, uint256 royaltyAmount) = chroma.royaltyInfo(1, 1 ether);

        assert(receiver == address(this));

        assert(royaltyAmount == 0.05 ether);

    }



    function test_RendererSwap_Works() external {

        ChromaStorage storageContract = new ChromaStorage(address(this), address(0));

        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));



        MockRendererA rendererA = new MockRendererA();

        MockRendererB rendererB = new MockRendererB();



        bytes memory pixels = new bytes(2048);

        bytes memory traits = TraitFixtures.zeroTraits();

        address recipient = address(0xBEEF);

        chroma.mint(recipient, 102, pixels, traits);



        chroma.setRenderer(address(rendererA));

        string memory uriA = chroma.tokenURI(102);



        chroma.setRenderer(address(rendererB));

        string memory uriB = chroma.tokenURI(102);



        assert(keccak256(bytes(uriA)) != keccak256(bytes(uriB)));

        assert(keccak256(bytes(uriA)) == keccak256(bytes("data:application/json;base64,QQ==")));

        assert(keccak256(bytes(uriB)) == keccak256(bytes("data:application/json;base64,Qg==")));

    }



    function test_SupplyCap_Enforced() external {

        ChromaStorage storageContract = new ChromaStorage(address(this), address(0));

        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));



        bytes memory pixels = new bytes(2048);

        bytes memory traits = TraitFixtures.zeroTraits();



        vm.store(address(chroma), bytes32(uint256(17)), bytes32(uint256(5149)));

        assert(chroma.totalSupply() == 5149);



        address holder = address(0xBEEF);

        chroma.mint(holder, 5150, pixels, traits);

        assert(chroma.totalSupply() == 5150);



        vm.expectRevert(Chroma.MaxSupplyReached.selector);

        chroma.mint(holder, 5151, pixels, traits);

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



contract ChromaCanvasTest is Test {

    ChromaStorage internal storageContract;

    Chroma internal chroma;

    ChromaCanvas internal canvas;

    bytes internal basePixels;

    bytes internal baseTraits;



    function setUp() public {

        storageContract = new ChromaStorage(address(this), address(0));

        chroma = new Chroma(address(storageContract), address(this), address(this), 500);

        storageContract.setWriter(address(chroma));

        canvas = new ChromaCanvas(address(chroma), address(storageContract), address(this));

        storageContract.setTraitUpdater(address(canvas));



        basePixels = new bytes(2048);

        baseTraits = TraitFixtures.zeroTraits();

    }



    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {

        return this.onERC721Received.selector;

    }



    function test_CommitRevealBurnApplyDiff_AndCompositeRender() external {

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));

        renderer.setCanvas(address(canvas));

        chroma.setRenderer(address(renderer));



        address artTokenOwner = address(0xBEEF);

        chroma.mint(artTokenOwner, 200, basePixels, baseTraits);

        chroma.mint(address(this), 201, basePixels, baseTraits);

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



        string memory svg = renderer.renderSVG(200);

        assert(_contains(svg, 'fill="#db5a91"'));

        assert(_contains(svg, '<rect x="0" y="0" width="16" height="16"'));

    }



    function test_RecursiveBurnMultiplier() external {

        chroma.mint(address(this), 300, basePixels, baseTraits);

        chroma.mint(address(this), 301, basePixels, baseTraits);

        chroma.mint(address(this), 302, basePixels, baseTraits);

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

    function test_MutationTierShift_Valid() external {
        bytes memory traits =
            hex"0000000000000000000000000000000300000000000000000000000000000000";
        chroma.mint(address(this), 400, basePixels, traits);
        chroma.setApprovalForAll(address(canvas), true);

        for (uint256 i = 0; i < 5; ++i) {
            chroma.mint(address(this), 410 + i, basePixels, baseTraits);
            _grantActionPoints(400, 410 + i);
        }

        canvas.shiftMutationTier(400, 2);

        bytes memory updated = storageContract.getTraits(400);
        assert(uint8(updated[15]) == 2);
        assert(canvas.actionPoints(address(this)) == 0);
    }

    function test_MutationTierShift_Invalid() external {
        bytes memory traits =
            hex"0000000000000000000000000000000200000000000000000000000000000000";
        chroma.mint(address(this), 401, basePixels, traits);
        chroma.mint(address(this), 420, basePixels, baseTraits);
        chroma.setApprovalForAll(address(canvas), true);
        _grantActionPoints(401, 420);

        vm.expectRevert(ChromaCanvas.InvalidMutationShift.selector);
        canvas.shiftMutationTier(401, 3);

        vm.expectRevert(ChromaCanvas.InsufficientActionPoints.selector);
        canvas.shiftMutationTier(401, 1);
    }



    function test_ActionPointsTransfer() external {

        chroma.mint(address(this), 500, basePixels, baseTraits);

        chroma.mint(address(this), 501, basePixels, baseTraits);

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

}



contract ChromaPhaseMintTest is Test {

    Chroma internal chroma;

    ChromaStorage internal storageContract;



    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {

        return this.onERC721Received.selector;

    }



    function setUp() public {

        storageContract = new ChromaStorage(address(this), address(0));

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
        return keccak256(abi.encodePacked(tokenId, pixels, traits));
    }



    function test_AllowlistOne_Mint() external {

        bytes32[] memory proof = new bytes32[](0);

        chroma.setMerkleRootOne(_leaf(address(this)));

        chroma.setPhase(Chroma.Phase.AllowlistOne);



        chroma.mint{value: 0.003 ether}(proof);



        assert(chroma.ownerOf(1) == address(this));

        assert(chroma.claimedOne(address(this)) == 1);

        assert(chroma.totalSupply() == 1);

        assert(!chroma.revealed(1));

    }



    function test_AllowlistTwo_Mint() external {

        bytes32[] memory proof = new bytes32[](0);

        chroma.setMerkleRootTwo(_leaf(address(this)));

        chroma.setPhase(Chroma.Phase.AllowlistTwo);



        chroma.mint{value: 0.005 ether}(proof);



        assert(chroma.ownerOf(1) == address(this));

        assert(chroma.claimedTwo(address(this)) == 1);

        assert(chroma.totalSupply() == 1);

    }



    function test_Public_Mint() external {

        chroma.setPhase(Chroma.Phase.Public);



        chroma.mint{value: 0.006 ether}();



        assert(chroma.ownerOf(1) == address(this));

        assert(chroma.claimedPublic(address(this)) == 1);

        assert(chroma.totalSupply() == 1);

    }



    function test_Reveal_WritesPixels() external {

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));

        chroma.setRenderer(address(renderer));

        chroma.setPhase(Chroma.Phase.Public);

        chroma.mint{value: 0.006 ether}();



        assert(!storageContract.hasData(1));

        assert(!chroma.revealed(1));



        bytes memory pixels = new bytes(2048);

        _setPixel(pixels, 0, 0, 4);

        bytes memory traits = TraitFixtures.zeroTraits();



        bytes32 leaf = _revealLeaf(1, pixels, traits);

        chroma.setRevealRoot(leaf);

        bytes32[] memory proof = new bytes32[](0);

        chroma.reveal(1, pixels, traits, proof);



        assert(chroma.revealed(1));

        assert(keccak256(storageContract.getPixels(1)) == keccak256(pixels));



        string memory uri = chroma.tokenURI(1);

        bytes memory prefix = bytes("data:application/json;base64,");

        bytes memory uriBytes = bytes(uri);

        assert(uriBytes.length > prefix.length);

    }



    function test_Reveal_InvalidProof_Reverts() external {

        chroma.setPhase(Chroma.Phase.Public);

        chroma.mint{value: 0.006 ether}();



        bytes memory pixels = new bytes(2048);

        _setPixel(pixels, 0, 0, 4);

        bytes memory traits = TraitFixtures.zeroTraits();



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

        chroma.mint{value: 0.003 ether}(proof);



        vm.expectRevert(Chroma.WrongPhase.selector);

        chroma.mint{value: 0.006 ether}();

    }



    function test_MaxPerWallet_Enforced() external {

        bytes32[] memory proof = new bytes32[](0);

        chroma.setMerkleRootOne(_leaf(address(this)));

        chroma.setPhase(Chroma.Phase.AllowlistOne);



        chroma.mint{value: 0.003 ether}(proof);

        chroma.mint{value: 0.003 ether}(proof);

        assert(chroma.claimedOne(address(this)) == 2);

        assert(chroma.totalSupply() == 2);



        vm.expectRevert(Chroma.MaxPerWalletExceeded.selector);

        chroma.mint{value: 0.003 ether}(proof);

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


