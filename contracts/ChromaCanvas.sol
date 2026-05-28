// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IChromaToken {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

contract ChromaCanvas is Ownable {
    error NotTokenOwner();
    error InvalidDiffEncoding();
    error PixelIndexOutOfRange();
    error InsufficientActionPoints();
    error MissingCommit();
    error InvalidReveal();

    uint256 internal constant GRID_PIXELS = 4096;
    uint256 public constant ACTION_POINTS_PER_BURN = 16;
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
    mapping(address user => uint256 points) public actionPoints;
    mapping(address user => PendingCommit) public pendingCommit;
    mapping(uint256 tokenId => CanvasEdit[]) internal tokenDiffs;

    event CommitSubmitted(address indexed user, bytes32 indexed commitment);
    event BurnRevealed(address indexed user, uint256 indexed burnedTokenId, uint256 actionPointsAwarded);
    event DiffApplied(address indexed user, uint256 indexed tokenId, uint256 entriesApplied);

    constructor(address chromaAddress, address initialOwner) Ownable(initialOwner) {
        chroma = IChromaToken(chromaAddress);
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
        actionPoints[msg.sender] += ACTION_POINTS_PER_BURN;
        emit BurnRevealed(msg.sender, burnedTokenId, ACTION_POINTS_PER_BURN);

        _applyDiff(tokenId, diffData, msg.sender);
    }

    function applyDiff(uint256 tokenId, bytes calldata diffData) external {
        _applyDiff(tokenId, diffData, msg.sender);
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

    function _applyDiff(uint256 tokenId, bytes calldata diffData, address user) internal {
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
        emit DiffApplied(user, tokenId, entryCount);
    }
}
