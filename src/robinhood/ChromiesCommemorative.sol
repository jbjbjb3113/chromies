// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {IChromaRenderer} from "../../contracts/IChromaRenderer.sol";

/// @title ChromiesCommemorative — Robinhood Chain launch-edition mint
/// @notice Standalone 100-piece commemorative collection. Self-storing (implements
/// the read subset of `IChromaStorage` that `ChromaRenderer` — contracts/ChromaRenderer.sol,
/// UNCHANGED — needs: `getTraits`/`getPixels`/`getTotalPixels`) so the existing renderer
/// can be pointed at this contract as its "storage" with zero renderer changes. No AP
/// economy, no canvas, no burn, no batch-inscribe — deliberately out of scope.
contract ChromiesCommemorative is ERC721, ERC2981, Ownable, ReentrancyGuard {
    error MaxSupplyReached();
    error InsufficientPayment();
    error InvalidQuantity();
    error MaxPerWalletExceeded();
    error MintNotOpen();
    error SeedingLocked();
    error ArrayLengthMismatch();
    error InvalidTokenId();
    error TokenAlreadySeeded();
    error InvalidPixelsLength();
    error InvalidTraitsLength();
    error TokenNotSeeded();
    error RendererNotSet();
    error WithdrawFailed();

    uint256 public constant MAX_SUPPLY = 100;
    uint256 public constant MINT_PRICE = 0.0169 ether;
    uint256 public constant MAX_PER_WALLET = 2;
    uint96 public constant ROYALTY_FEE_BPS = 500;

    uint256 internal constant PIXELS_LENGTH = 2048;
    uint256 internal constant TRAITS_LENGTH = 32;

    /// @dev Same packed encoding as ChromaStorage: traits[17:19] = big-endian total-pixel count.
    mapping(uint256 tokenId => address) internal _pixelPointers;
    mapping(uint256 tokenId => bytes32) internal _traitsPacked;

    /// @notice Once true, `seedPayloads` is permanently locked (does not re-lock if
    /// `setMintOpen(false)` is called afterwards — the lock is a one-way ratchet).
    bool public seedingLocked;
    bool public mintOpen;

    uint256 public totalMinted;
    mapping(address wallet => uint256) public walletMinted;

    IChromaRenderer public renderer;

    constructor(address initialOwner)
        ERC721("Chromies: Robinhood Chain Commemorative", "CHROMIE-RC")
        Ownable(initialOwner)
    {
        _setDefaultRoyalty(initialOwner, ROYALTY_FEE_BPS);
    }

    receive() external payable {}

    function totalSupply() public view returns (uint256) {
        return totalMinted;
    }

    // ---------------------------------------------------------------------
    // Pre-inscription seeding (owner-only, locked forever once mint opens)
    // ---------------------------------------------------------------------

    /// @notice Batch-write pixel/trait payloads for token IDs ahead of minting.
    /// Uses the exact ChromaStorage encoding (2048-byte pixels, 32-byte traits) so
    /// the unmodified ChromaRenderer renders identically once wired.
    function seedPayloads(uint256[] calldata ids, bytes[] calldata pixelsHex, bytes[] calldata traitsHex)
        external
        onlyOwner
    {
        if (seedingLocked) revert SeedingLocked();
        uint256 len = ids.length;
        if (len != pixelsHex.length || len != traitsHex.length) revert ArrayLengthMismatch();

        for (uint256 i = 0; i < len; ++i) {
            uint256 tokenId = ids[i];
            if (tokenId == 0 || tokenId > MAX_SUPPLY) revert InvalidTokenId();
            if (_pixelPointers[tokenId] != address(0)) revert TokenAlreadySeeded();

            bytes calldata pixels = pixelsHex[i];
            bytes calldata traits = traitsHex[i];
            if (pixels.length != PIXELS_LENGTH) revert InvalidPixelsLength();
            if (traits.length != TRAITS_LENGTH) revert InvalidTraitsLength();

            _pixelPointers[tokenId] = SSTORE2.write(pixels);
            _traitsPacked[tokenId] = bytes32(traits);
        }
    }

    function hasData(uint256 tokenId) external view returns (bool) {
        return _pixelPointers[tokenId] != address(0);
    }

    // ---------------------------------------------------------------------
    // IChromaStorage read subset — consumed by the unmodified ChromaRenderer
    // ---------------------------------------------------------------------

    function getPixels(uint256 tokenId) external view returns (bytes memory) {
        address pointer = _pixelPointers[tokenId];
        if (pointer == address(0)) revert TokenNotSeeded();
        return SSTORE2.read(pointer);
    }

    function getTraits(uint256 tokenId) external view returns (bytes memory) {
        if (_pixelPointers[tokenId] == address(0)) revert TokenNotSeeded();
        return abi.encodePacked(_traitsPacked[tokenId]);
    }

    function getTotalPixels(uint256 tokenId) external view returns (uint256) {
        bytes32 t = _traitsPacked[tokenId];
        return (uint256(uint8(t[17])) << 8) | uint256(uint8(t[18]));
    }

    // ---------------------------------------------------------------------
    // Mint
    // ---------------------------------------------------------------------

    function mint(uint256 quantity) external payable nonReentrant {
        if (!mintOpen) revert MintNotOpen();
        if (quantity == 0 || quantity > MAX_PER_WALLET) revert InvalidQuantity();
        if (msg.value != MINT_PRICE * quantity) revert InsufficientPayment();
        if (walletMinted[msg.sender] + quantity > MAX_PER_WALLET) revert MaxPerWalletExceeded();
        if (totalMinted + quantity > MAX_SUPPLY) revert MaxSupplyReached();

        walletMinted[msg.sender] += quantity;
        for (uint256 i = 0; i < quantity; ++i) {
            uint256 tokenId = ++totalMinted;
            if (_pixelPointers[tokenId] == address(0)) revert TokenNotSeeded();
            _safeMint(msg.sender, tokenId);
        }
    }

    // ---------------------------------------------------------------------
    // tokenURI — delegates to ChromaRenderer, same pattern as Chroma.sol
    // ---------------------------------------------------------------------

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (address(renderer) == address(0)) revert RendererNotSet();
        return renderer.tokenURI(tokenId);
    }

    // ---------------------------------------------------------------------
    // Owner admin
    // ---------------------------------------------------------------------

    /// @dev One-way ratchet: flipping to true permanently locks `seedPayloads`,
    /// even if this is later called with `false` again.
    function setMintOpen(bool open) external onlyOwner {
        mintOpen = open;
        if (open) seedingLocked = true;
    }

    function setRenderer(address rendererAddress) external onlyOwner {
        renderer = IChromaRenderer(rendererAddress);
    }

    function withdraw() external onlyOwner {
        (bool ok,) = payable(owner()).call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
