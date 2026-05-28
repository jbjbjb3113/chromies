// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Chroma} from "../contracts/Chroma.sol";
import {ChromaCanvas} from "../contracts/ChromaCanvas.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";

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

        bytes memory traits = hex"0102030405";
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
        bytes memory traits = hex"0102030405";

        (bool success,) = address(storageContract).call(
            abi.encodeWithSelector(storageContract.writeTokenData.selector, 1, pixels, traits)
        );

        assert(!success);
    }

    function test_RevertIfWrittenTwice() external {
        WriterCaller writer = new WriterCaller();
        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));
        bytes memory pixels = new bytes(2048);
        bytes memory traits = hex"0102030405";

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
        bytes memory validTraits = hex"0102030405";

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

        bytes memory traits = hex"0102030400";
        writer.write(storageContract, 42, pixels, traits);

        string memory actual = renderer.renderSVG(42);
        string memory expected =
            '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" shape-rendering="crispEdges"><rect width="1024" height="1024" fill="#1a1014"/><rect x="0" y="0" width="16" height="16" fill="#7a3340"/><rect x="16" y="0" width="48" height="16" fill="#9c4050"/><rect x="32" y="16" width="32" height="16" fill="#2d161c"/></svg>';

        assert(keccak256(bytes(actual)) == keccak256(bytes(expected)));
    }

    function test_TokenURI_IsDataURI() external {
        WriterCaller writer = new WriterCaller();
        ChromaStorage storageContract = new ChromaStorage(address(this), address(writer));
        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));

        bytes memory pixels = new bytes(2048);
        _setPixel(pixels, 0, 0, 15);
        bytes memory traits = hex"0000000000";
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

contract ChromaTokenTest {
    function test_Mint_WritesStorage_AndMintsERC721() external {
        ChromaStorage storageContract = new ChromaStorage(address(this), address(0));
        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);
        storageContract.setWriter(address(chroma));

        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));
        chroma.setRenderer(address(renderer));

        bytes memory pixels = new bytes(2048);
        _setPixel(pixels, 0, 0, 12);
        bytes memory traits = hex"0000000000";
        address recipient = address(0xBEEF);
        chroma.mint(recipient, 100, pixels, traits);

        assert(chroma.ownerOf(100) == recipient);
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
        bytes memory traits = hex"0102030401";
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
        bytes memory traits = hex"0000000000";
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

contract ChromaCanvasTest {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function test_CommitRevealBurnApplyDiff_AndCompositeRender() external {
        ChromaStorage storageContract = new ChromaStorage(address(this), address(0));
        Chroma chroma = new Chroma(address(storageContract), address(this), address(this), 500);
        storageContract.setWriter(address(chroma));

        ChromaCanvas canvas = new ChromaCanvas(address(chroma), address(this));
        ChromaRenderer renderer = new ChromaRenderer(address(storageContract), address(this));
        renderer.setCanvas(address(canvas));
        chroma.setRenderer(address(renderer));

        bytes memory basePixels = new bytes(2048);
        bytes memory traits = hex"0000000000";
        address artTokenOwner = address(0xBEEF);
        chroma.mint(artTokenOwner, 200, basePixels, traits);

        chroma.mint(address(this), 201, basePixels, traits);
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
        assert(points == 15);

        string memory svg = renderer.renderSVG(200);
        assert(_contains(svg, 'fill="#5c1d0f"'));
        assert(_contains(svg, '<rect x="0" y="0" width="16" height="16"'));
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
