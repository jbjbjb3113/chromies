// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IChromaRenderer} from "./IChromaRenderer.sol";
import {ChromaStorage} from "./ChromaStorage.sol";
import {IChromaCanvasFinalize} from "./IChromaCanvasFinalize.sol";

contract Chroma is ERC721, ERC2981, Ownable, ReentrancyGuard {
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
    error InvalidQuantity();
    error AlreadyRevealed();
    error NotTokenOwner();
    error AlreadyLocked();
    error NotRevealed();
    error InvalidTokenId();
    error InvalidPayload();
    error AlreadyInscribed();
    error RevealedBaseURINotSet();
    error PhaseSupplyExceeded();

    uint256 public constant MAX_SUPPLY = 5150;
    uint256 public constant TEAM_RESERVE = 200;
    uint256 public constant MAX_MINT_ALLOWLIST_ONE = 2500;
    uint256 public constant MAX_MINT_ALLOWLIST_TWO = 1000;
    uint256 public constant MINT_PRICE = 0.0045 ether;
    uint256 public constant ALLOWLIST_ONE_PRICE = 0.0025 ether;
    uint256 public constant ALLOWLIST_TWO_PRICE = 0.0035 ether;
    uint256 public constant MAX_PER_WALLET_ONE = 5;
    uint256 public constant MAX_PER_WALLET_TWO = 5;
    uint256 public constant MAX_PER_WALLET_PUBLIC = 5;

    uint256 internal constant PIXELS_LENGTH = 2048;
    uint256 internal constant TRAITS_LENGTH = 32;

    Phase public phase = Phase.Closed;
    bytes32 public merkleRootOne;
    bytes32 public merkleRootTwo;
    bytes32 public revealRoot;
    string public revealedBaseURI;

    mapping(address => uint256) public claimedOne;
    mapping(address => uint256) public claimedTwo;
    mapping(address => uint256) public claimedPublic;
    uint256 public mintedAllowlistOne;
    uint256 public mintedAllowlistTwo;
    mapping(uint256 => bool) public revealed;
    mapping(uint256 => bool) public locked;
    mapping(uint256 => bytes32) public revealedTraits;

    event TokenRevealed(uint256 indexed tokenId);
    event TokenInscribed(uint256 indexed tokenId);
    event TokenLocked(uint256 indexed tokenId);

    ChromaStorage public immutable chromaStorage;
    IChromaRenderer public renderer;
    IChromaCanvasFinalize public canvas;
    uint256 private _totalSupply;

    constructor(
        address storageAddress,
        address initialOwner,
        address royaltyReceiver,
        uint96 royaltyFeeNumerator
    ) ERC721("Chromies", "CHROMIE") Ownable(initialOwner) {
        chromaStorage = ChromaStorage(storageAddress);
        _setDefaultRoyalty(royaltyReceiver, royaltyFeeNumerator);
    }

    receive() external payable {}

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    /// @notice Owner mint — placeholder only; same reveal/inscribe path as public mints.
    function mint(address to, uint256 tokenId) external onlyOwner {
        if (tokenId != _totalSupply + 1) revert InvalidTokenId();
        if (_totalSupply >= MAX_SUPPLY) revert MaxSupplyReached();
        ++_totalSupply;
        _safeMint(to, tokenId);
    }

    function mint(bytes32[] calldata proof, uint256 quantity) external payable nonReentrant {
        if (phase == Phase.AllowlistOne) {
            _mintAllowlistOne(proof, quantity);
        } else if (phase == Phase.AllowlistTwo) {
            _mintAllowlistTwo(proof, quantity);
        } else {
            revert WrongPhase();
        }
    }

    function mint(uint256 quantity) external payable nonReentrant {
        if (phase != Phase.Public) revert WrongPhase();
        _mintPublic(quantity);
    }

    /// @notice Cheap reveal — merkle verify + revealed flag + traits snapshot. No SSTORE2 write.
    function reveal(uint256 tokenId, bytes calldata pixels, bytes calldata traits, bytes32[] calldata proof)
        external
    {
        _requireOwned(tokenId);
        if (revealed[tokenId]) revert AlreadyRevealed();
        if (pixels.length != PIXELS_LENGTH || traits.length != TRAITS_LENGTH) revert InvalidPayload();

        bytes32 leaf = keccak256(abi.encode(tokenId, pixels, traits));
        if (!MerkleProof.verify(proof, revealRoot, leaf)) revert InvalidMerkleProof();

        revealed[tokenId] = true;
        revealedTraits[tokenId] = bytes32(traits);
        emit TokenRevealed(tokenId);
    }

    /// @notice Expensive permanence — SSTORE2 pixel write, canvas bake, and permanent lock.
    function inscribe(uint256 tokenId, bytes calldata pixels, bytes calldata traits, bytes32[] calldata proof)
        external
    {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (locked[tokenId]) revert AlreadyLocked();
        if (!revealed[tokenId]) revert NotRevealed();
        if (chromaStorage.hasData(tokenId)) revert AlreadyInscribed();
        if (pixels.length != PIXELS_LENGTH || traits.length != TRAITS_LENGTH) revert InvalidPayload();

        bytes32 leaf = keccak256(abi.encode(tokenId, pixels, traits));
        if (!MerkleProof.verify(proof, revealRoot, leaf)) revert InvalidMerkleProof();

        locked[tokenId] = true;
        chromaStorage.writeTokenData(tokenId, pixels, traits);
        delete revealedTraits[tokenId];
        _bakeCanvasEdits(tokenId);
        emit TokenInscribed(tokenId);
        emit TokenLocked(tokenId);
    }

    function isLocked(uint256 tokenId) external view returns (bool) {
        return locked[tokenId];
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

    function setRevealRoot(bytes32 root) external onlyOwner {
        revealRoot = root;
    }

    function setRevealedBaseURI(string calldata uri) external onlyOwner {
        revealedBaseURI = uri;
    }

    /// @notice Testing helper — clears a wallet's per-phase mint counts.
    function resetClaimed(address wallet) external onlyOwner {
        claimedPublic[wallet] = 0;
        claimedOne[wallet] = 0;
        claimedTwo[wallet] = 0;
    }

    function withdraw() external onlyOwner {
        (bool ok,) = payable(owner()).call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }

    function setRenderer(address rendererAddress) external onlyOwner {
        renderer = IChromaRenderer(rendererAddress);
    }

    function setCanvas(address canvasAddress) external onlyOwner {
        canvas = IChromaCanvasFinalize(canvasAddress);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (!revealed[tokenId]) {
            return _unrevealedURI(tokenId);
        }
        if (!chromaStorage.hasData(tokenId)) {
            return _revealedOffChainURI(tokenId);
        }
        if (address(renderer) == address(0)) revert RendererNotSet();
        return renderer.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _mintAllowlistOne(bytes32[] calldata proof, uint256 quantity) internal {
        if (quantity == 0) revert InvalidQuantity();
        if (msg.value != ALLOWLIST_ONE_PRICE * quantity) revert InsufficientPayment();
        if (claimedOne[msg.sender] + quantity > MAX_PER_WALLET_ONE) revert MaxPerWalletExceeded();
        if (mintedAllowlistOne + quantity > MAX_MINT_ALLOWLIST_ONE) revert PhaseSupplyExceeded();
        if (!_verifyAllowlist(msg.sender, proof, merkleRootOne)) revert InvalidMerkleProof();

        claimedOne[msg.sender] += quantity;
        mintedAllowlistOne += quantity;
        for (uint256 i = 0; i < quantity; ++i) {
            _mintCommunity(msg.sender);
        }
    }

    function _mintAllowlistTwo(bytes32[] calldata proof, uint256 quantity) internal {
        if (quantity == 0) revert InvalidQuantity();
        if (msg.value != ALLOWLIST_TWO_PRICE * quantity) revert InsufficientPayment();
        if (claimedTwo[msg.sender] + quantity > MAX_PER_WALLET_TWO) revert MaxPerWalletExceeded();
        if (mintedAllowlistTwo + quantity > MAX_MINT_ALLOWLIST_TWO) revert PhaseSupplyExceeded();
        if (!_verifyAllowlist(msg.sender, proof, merkleRootTwo)) revert InvalidMerkleProof();

        claimedTwo[msg.sender] += quantity;
        mintedAllowlistTwo += quantity;
        for (uint256 i = 0; i < quantity; ++i) {
            _mintCommunity(msg.sender);
        }
    }

    function _mintPublic(uint256 quantity) internal {
        if (quantity == 0) revert InvalidQuantity();
        if (msg.value != MINT_PRICE * quantity) revert InsufficientPayment();
        if (claimedPublic[msg.sender] + quantity > MAX_PER_WALLET_PUBLIC) revert MaxPerWalletExceeded();

        claimedPublic[msg.sender] += quantity;
        for (uint256 i = 0; i < quantity; ++i) {
            _mintCommunity(msg.sender);
        }
    }

    function _communityMintCap() internal pure returns (uint256) {
        return MAX_SUPPLY - TEAM_RESERVE;
    }

    function _mintCommunity(address to) internal {
        if (_totalSupply + 1 > _communityMintCap()) revert MaxSupplyReached();
        _mintPlaceholder(to);
    }

    function _mintPlaceholder(address to) internal {
        if (_totalSupply >= MAX_SUPPLY) revert MaxSupplyReached();
        uint256 tokenId = _totalSupply + 1;
        ++_totalSupply;
        _safeMint(to, tokenId);
    }

    function _verifyAllowlist(address account, bytes32[] calldata proof, bytes32 root) internal pure returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(account));
        return MerkleProof.verify(proof, root, leaf);
    }

    function _bakeCanvasEdits(uint256 tokenId) internal {
        if (address(canvas) == address(0)) return;
        if (!canvas.isCustomized(tokenId)) return;

        bytes memory pixels;
        uint16 totalPixelCount;
        (pixels, totalPixelCount) = canvas.computeFinalPixels(tokenId);
        chromaStorage.rewritePixels(tokenId, pixels, totalPixelCount);
        canvas.clearDiffs(tokenId);
    }

    function _revealedOffChainURI(uint256 tokenId) internal view returns (string memory) {
        if (bytes(revealedBaseURI).length == 0) revert RevealedBaseURINotSet();
        return string(abi.encodePacked(revealedBaseURI, tokenId.toString(), ".json"));
    }

    function _unrevealedURI(uint256 tokenId) internal pure returns (string memory) {
        string[5] memory images = [
            "https://chromies.art/RevealImage.png",
            "https://chromies.art/RevealImage_B.png",
            "https://chromies.art/RevealImage_C.png",
            "https://chromies.art/RevealImage_D.png",
            "https://chromies.art/RevealImage_E.png"
        ];
        string memory image = images[tokenId % 5];
        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(
                    bytes(
                        string(
                            abi.encodePacked(
                                '{"name":"Chromie #',
                                Strings.toString(tokenId),
                                ' (Unrevealed)",',
                                '"description":"Awaiting reveal.",',
                                '"image":"',
                                image,
                                '"}'
                            )
                        )
                    )
                )
            )
        );
    }
}
