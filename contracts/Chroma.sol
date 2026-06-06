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

    uint256 public constant MAX_SUPPLY = 5000;

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

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function mint(address to, uint256 tokenId, bytes calldata pixels, bytes calldata traits) external onlyOwner {
        if (_totalSupply >= MAX_SUPPLY) revert MaxSupplyReached();
        _safeMint(to, tokenId);
        chromaStorage.writeTokenData(tokenId, pixels, traits);
        ++_totalSupply;
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
}
