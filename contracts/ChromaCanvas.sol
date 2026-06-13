// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IChromaStorage} from "./IChromaStorage.sol";
import {IChromaToken} from "./IChromaToken.sol";

contract ChromaCanvas is Ownable {
    error NotTokenOwner();
    error InvalidDiffEncoding();
    error PixelIndexOutOfRange();
    error InsufficientActionPoints();
    error MissingCommit();
    error InvalidReveal();
    error InvalidMutationShift();
    error InvalidMutationTier();
    error InvalidTransfer();
    error TokenLocked();

    uint256 internal constant GRID_PIXELS = 4096;
    uint256 internal constant TRAIT_MUTATION_INDEX = 15;
    uint256 public constant ACTION_POINTS_PER_BURN = 100;
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    struct PendingCommit {
        bytes32 commitment;
        bool exists;
    }

    struct CanvasEdit {
        uint16 pixelIndex;
        uint8 newColorIndex;
    }

    IChromaToken public immutable chroma;
    IChromaStorage public immutable chromaStorage;
    mapping(address user => uint256 points) public actionPoints;
    mapping(address user => PendingCommit) public pendingCommit;
    mapping(uint256 tokenId => CanvasEdit[]) internal tokenDiffs;
    mapping(uint256 tokenId => uint256 apSpent) public totalApSpent;

    event CommitSubmitted(address indexed user, bytes32 indexed commitment);
    event BurnRevealed(address indexed user, uint256 indexed burnedTokenId, uint256 actionPointsAwarded);
    event DiffApplied(address indexed user, uint256 indexed tokenId, uint256 entriesApplied);
    event MutationTierShifted(uint256 indexed tokenId, uint8 oldTier, uint8 newTier);
    event ActionPointsTransferred(address indexed from, address indexed to, uint256 amount);

    constructor(address chromaAddress, address storageAddress, address initialOwner) Ownable(initialOwner) {
        chroma = IChromaToken(chromaAddress);
        chromaStorage = IChromaStorage(storageAddress);
    }

    function submitCommit(bytes32 commitment) external {
        pendingCommit[msg.sender] = PendingCommit({commitment: commitment, exists: true});
        emit CommitSubmitted(msg.sender, commitment);
    }

    function revealBurnAndApplyDiff(uint256 tokenId, uint256 burnedTokenId, bytes32 salt, bytes calldata diffData) external {
        PendingCommit memory commit = pendingCommit[msg.sender];
        if (!commit.exists) revert MissingCommit();

        bytes32 revealHash = keccak256(abi.encode(msg.sender, tokenId, burnedTokenId, diffData, salt));
        if (revealHash != commit.commitment) revert InvalidReveal();
        delete pendingCommit[msg.sender];

        if (chroma.ownerOf(burnedTokenId) != msg.sender) revert NotTokenOwner();
        chroma.transferFrom(msg.sender, DEAD_ADDRESS, burnedTokenId);

        uint256 burnYield = _burnYield(burnedTokenId);
        actionPoints[msg.sender] += burnYield;
        emit BurnRevealed(msg.sender, burnedTokenId, burnYield);

        if (chroma.isLocked(tokenId)) revert TokenLocked();

        if (diffData.length > 0) {
            _applyDiff(tokenId, diffData, msg.sender);
        }
    }

    function applyDiff(uint256 tokenId, bytes calldata diffData) external {
        _applyDiff(tokenId, diffData, msg.sender);
    }

    function shiftMutationTier(uint256 tokenId, uint8 newTier) external {
        if (chroma.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (chroma.isLocked(tokenId)) revert TokenLocked();
        if (newTier > 3) revert InvalidMutationTier();

        bytes memory traits = chromaStorage.getTraits(tokenId);
        uint8 currentTier = uint8(traits[TRAIT_MUTATION_INDEX]);
        uint256 cost = _mutationShiftCost(currentTier, newTier);
        if (actionPoints[msg.sender] < cost) revert InsufficientActionPoints();

        actionPoints[msg.sender] -= cost;
        totalApSpent[tokenId] += cost;
        chromaStorage.updateTrait(tokenId, TRAIT_MUTATION_INDEX, newTier);
        emit MutationTierShifted(tokenId, currentTier, newTier);
    }

    function level(uint256 tokenId) public view returns (uint256) {
        return totalApSpent[tokenId] / 100 + 1;
    }

    function transferActionPoints(address to, uint256 amount) external {
        if (to == address(0)) revert InvalidTransfer();
        if (actionPoints[msg.sender] < amount) revert InsufficientActionPoints();

        actionPoints[msg.sender] -= amount;
        actionPoints[to] += amount;
        emit ActionPointsTransferred(msg.sender, to, amount);
    }

    function getDiff(uint256 tokenId) external view returns (uint16[] memory pixelIndexes, uint8[] memory newColorIndexes) {
        CanvasEdit[] storage edits = tokenDiffs[tokenId];
        pixelIndexes = new uint16[](edits.length);
        newColorIndexes = new uint8[](edits.length);
        for (uint256 i = 0; i < edits.length; ++i) {
            pixelIndexes[i] = edits[i].pixelIndex;
            newColorIndexes[i] = edits[i].newColorIndex;
        }
    }

    function getBurnCount(uint256) external pure returns (uint256) {
        return 0;
    }

    function getCanvasInfo(address user, uint256 tokenId)
        external
        view
        returns (uint256 points, uint256 diffCount, bool customized, bool hasPendingCommit)
    {
        points = actionPoints[user];
        diffCount = tokenDiffs[tokenId].length;
        customized = diffCount > 0;
        hasPendingCommit = pendingCommit[user].exists;
    }

    function _burnYield(uint256 tokenId) internal view returns (uint256) {
        uint256 bonus = tokenDiffs[tokenId].length / 10;
        return ACTION_POINTS_PER_BURN + bonus;
    }

    function _mutationShiftCost(uint8 currentTier, uint8 newTier) internal pure returns (uint256) {
        if (newTier >= currentTier) revert InvalidMutationShift();
        if (currentTier == 3 && newTier == 2) return 500;
        if (currentTier == 2 && newTier == 1) return 1500;
        if (currentTier == 1 && newTier == 0) return 5000;
        revert InvalidMutationShift();
    }

    function _applyDiff(uint256 tokenId, bytes calldata diffData, address user) internal {
        if (chroma.isLocked(tokenId)) revert TokenLocked();
        if (diffData.length == 0 || diffData.length % 3 != 0) revert InvalidDiffEncoding();
        uint256 entryCount = diffData.length / 3;
        if (actionPoints[user] < entryCount) revert InsufficientActionPoints();

        for (uint256 i = 0; i < entryCount; ++i) {
            uint256 offset = i * 3;
            uint16 pixelIndex = (uint16(uint8(diffData[offset])) << 8) | uint16(uint8(diffData[offset + 1]));
            uint8 newColorIndex = uint8(diffData[offset + 2]);
            if (pixelIndex >= GRID_PIXELS) revert PixelIndexOutOfRange();
            if (newColorIndex > 15) revert InvalidDiffEncoding();
            tokenDiffs[tokenId].push(CanvasEdit({pixelIndex: pixelIndex, newColorIndex: newColorIndex}));
        }

        actionPoints[user] -= entryCount;
        totalApSpent[tokenId] += entryCount;
        emit DiffApplied(user, tokenId, entryCount);
    }
}
