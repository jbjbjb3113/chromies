// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IChromaRenderer} from "./IChromaRenderer.sol";
import {ChromaStorage} from "./ChromaStorage.sol";

contract Chroma is ERC721, ERC2981, Ownable {
    error RendererNotSet();
    error MaxSupplyReached();
    error InsufficientPayment();
    error WithdrawFailed();

    uint256 public constant MAX_SUPPLY = 5000;
    uint256 public constant MINT_PRICE = 0.006 ether;

    ChromaStorage public immutable chromaStorage;
    IChromaRenderer public renderer;
    uint256 private _totalSupply;

    constructor(
        address storageAddress,
        address initialOwner,
        address royaltyReceiver,
        uint96 royaltyFeeNumerator
    ) ERC721("Chroma", "CHROMA") Ownable(initialOwner) {
        chromaStorage = ChromaStorage(storageAddress);
        _setDefaultRoyalty(royaltyReceiver, royaltyFeeNumerator);
    }

    receive() external payable {}

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function mint(address to, uint256 tokenId, bytes calldata pixels, bytes calldata traits) external onlyOwner {
        _mintWithData(to, tokenId, pixels, traits);
    }

    function mint(address to) external payable {
        if (msg.value < MINT_PRICE) revert InsufficientPayment();
        uint256 tokenId = _totalSupply + 1;
        (bytes memory pixels, bytes memory traits) = _generateToken(tokenId);
        _mintWithData(to, tokenId, pixels, traits);
    }

    function withdraw() external onlyOwner {
        (bool ok,) = payable(owner()).call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }

    function setRenderer(address rendererAddress) external onlyOwner {
        renderer = IChromaRenderer(rendererAddress);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (address(renderer) == address(0)) revert RendererNotSet();
        return renderer.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _mintWithData(address to, uint256 tokenId, bytes memory pixels, bytes memory traits) internal {
        if (_totalSupply >= MAX_SUPPLY) revert MaxSupplyReached();
        _safeMint(to, tokenId);
        chromaStorage.writeTokenData(tokenId, pixels, traits);
        ++_totalSupply;
    }

    function _generateToken(uint256 tokenId) internal pure returns (bytes memory pixels, bytes memory traits) {
        pixels = new bytes(2048);
        traits = new bytes(32);

        for (uint256 i = 0; i < 4096; ++i) {
            uint8 nibble = uint8(uint256(keccak256(abi.encodePacked(tokenId, "pixels", i))) % 16);
            uint256 byteIndex = i >> 1;
            if ((i & 1) == 0) {
                pixels[byteIndex] = bytes1((uint8(pixels[byteIndex]) & 0x0f) | (nibble << 4));
            } else {
                pixels[byteIndex] = bytes1((uint8(pixels[byteIndex]) & 0xf0) | nibble);
            }
        }

        for (uint256 i = 0; i < 32; ++i) {
            traits[i] = bytes1(uint8(uint256(keccak256(abi.encodePacked(tokenId, "traits", i)))));
        }
    }
}
