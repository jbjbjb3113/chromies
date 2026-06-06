// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IChromaRenderer} from "./IChromaRenderer.sol";
import {ChromaStorage} from "./ChromaStorage.sol";

contract Chroma is ERC721, ERC2981, Ownable {
    using Strings for uint256;

    enum Phase {
        Closed,
        AllowlistOne,
        AllowlistTwo,
        Public,
        Revealed
    }

    error RendererNotSet();
    error MaxSupplyReached();
    error InsufficientPayment();
    error WithdrawFailed();
    error WrongPhase();
    error InvalidMerkleProof();
    error MaxPerWalletExceeded();
    error ArrayLengthMismatch();

    uint256 public constant MAX_SUPPLY = 5000;
    uint256 public constant MINT_PRICE = 0.006 ether;
    uint256 public constant ALLOWLIST_ONE_PRICE = 0.003 ether;
    uint256 public constant ALLOWLIST_TWO_PRICE = 0.005 ether;

    Phase public phase = Phase.Closed;
    bytes32 public merkleRootOne;
    bytes32 public merkleRootTwo;

    mapping(address => bool) public claimedOne;
    mapping(address => uint256) public claimedTwo;
    mapping(address => uint256) public claimedPublic;
    mapping(uint256 => bool) public revealed;

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
        _mintWithData(to, tokenId, pixels, traits, true);
    }

    function mint(bytes32[] calldata proof) external payable {
        if (phase == Phase.AllowlistOne) {
            _mintAllowlistOne(proof);
        } else if (phase == Phase.AllowlistTwo) {
            _mintAllowlistTwo(proof);
        } else {
            revert WrongPhase();
        }
    }

    function mint() external payable {
        if (phase != Phase.Public) revert WrongPhase();
        _mintPublic();
    }

    function reveal(uint256[] calldata tokenIds, bytes[] calldata pixelsArr, bytes[] calldata traitsArr)
        external
        onlyOwner
    {
        if (tokenIds.length != pixelsArr.length || tokenIds.length != traitsArr.length) {
            revert ArrayLengthMismatch();
        }

        for (uint256 i = 0; i < tokenIds.length; ++i) {
            uint256 tokenId = tokenIds[i];
            _requireOwned(tokenId);
            chromaStorage.revealTokenData(tokenId, pixelsArr[i], traitsArr[i]);
            revealed[tokenId] = true;
        }
    }

    function setPhase(Phase _phase) external onlyOwner {
        phase = _phase;
    }

    function setMerkleRootOne(bytes32 root) external onlyOwner {
        merkleRootOne = root;
    }

    function setMerkleRootTwo(bytes32 root) external onlyOwner {
        merkleRootTwo = root;
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
        if (!revealed[tokenId]) {
            return _unrevealedURI(tokenId);
        }
        if (address(renderer) == address(0)) revert RendererNotSet();
        return renderer.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _mintAllowlistOne(bytes32[] calldata proof) internal {
        if (msg.value < ALLOWLIST_ONE_PRICE) revert InsufficientPayment();
        if (claimedOne[msg.sender]) revert MaxPerWalletExceeded();
        if (!_verifyAllowlist(msg.sender, proof, merkleRootOne)) revert InvalidMerkleProof();

        claimedOne[msg.sender] = true;
        _mintPlaceholder(msg.sender);
    }

    function _mintAllowlistTwo(bytes32[] calldata proof) internal {
        if (msg.value < ALLOWLIST_TWO_PRICE) revert InsufficientPayment();
        if (claimedTwo[msg.sender] >= 2) revert MaxPerWalletExceeded();
        if (!_verifyAllowlist(msg.sender, proof, merkleRootTwo)) revert InvalidMerkleProof();

        ++claimedTwo[msg.sender];
        _mintPlaceholder(msg.sender);
    }

    function _mintPublic() internal {
        if (msg.value < MINT_PRICE) revert InsufficientPayment();
        if (claimedPublic[msg.sender] >= 3) revert MaxPerWalletExceeded();

        ++claimedPublic[msg.sender];
        _mintPlaceholder(msg.sender);
    }

    function _mintPlaceholder(address to) internal {
        uint256 tokenId = _totalSupply + 1;
        bytes memory pixels = new bytes(2048);
        bytes memory traits = new bytes(32);
        _mintWithData(to, tokenId, pixels, traits, false);
    }

    function _mintWithData(address to, uint256 tokenId, bytes memory pixels, bytes memory traits, bool isRevealed)
        internal
    {
        if (_totalSupply >= MAX_SUPPLY) revert MaxSupplyReached();
        _safeMint(to, tokenId);
        chromaStorage.writeTokenData(tokenId, pixels, traits);
        revealed[tokenId] = isRevealed;
        ++_totalSupply;
    }

    function _verifyAllowlist(address account, bytes32[] calldata proof, bytes32 root) internal pure returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(account));
        return MerkleProof.verify(proof, root, leaf);
    }

    function _unrevealedURI(uint256 tokenId) internal view returns (string memory) {
        string memory svg = string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" shape-rendering="crispEdges">',
                '<rect width="1024" height="1024" fill="#141414"/>',
                '<rect x="256" y="256" width="512" height="512" fill="#1f1f1f" stroke="#333" stroke-width="8"/>',
                '<text x="512" y="540" text-anchor="middle" fill="#888" font-family="monospace" font-size="96">?</text>',
                "</svg>"
            )
        );

        string memory image =
            string(abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(bytes(svg))));

        bytes memory json = abi.encodePacked(
            '{"name":"Chroma #',
            tokenId.toString(),
            ' (Unrevealed)","description":"Awaiting reveal.","image":"',
            image,
            '"}'
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }
}
