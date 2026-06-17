// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IChromaStorage} from "./IChromaStorage.sol";
import {IChromaToken} from "./IChromaToken.sol";
import {IPixelCanvas} from "./IPixelCanvas.sol";
import {IChromaCanvasFinalize} from "./IChromaCanvasFinalize.sol";

/// @title ChromaCanvasV2 — DRAFT
/// @notice Refactor of ChromaCanvas with PER-TOKEN Action Points.
///         V1 held AP per wallet; V2 holds AP per token so AP travels with the
///         NFT on sale and can be traded token-to-token via PixelMarketplace.
///
///         Key differences vs V1:
///         - `actionPoints` is keyed by tokenId, not address.
///         - Burn yield is credited to a destination token (the kept token in
///           `revealBurnAndApplyDiff`), not the burner's wallet.
///         - Spending a token's AP (edits, tier shifts, `spendAP`) requires
///           owning that token.
///         - Implements IPixelCanvas: marketplace-driven transfers go through
///           `operatorTransferAP`, gated by owner-approved operator contracts.
contract ChromaCanvasV2 is Ownable, IPixelCanvas, IChromaCanvasFinalize {
    error NotTokenOwner();
    error NotApprovedOperator();
    error InvalidDiffEncoding();
    error PixelIndexOutOfRange();
    error InsufficientActionPoints();
    error MissingCommit();
    error InvalidReveal();
    error InvalidMutationShift();
    error InvalidMutationTier();
    error InvalidTransfer();
    error TokenLocked();
    error UnauthorizedChromaCaller();

    uint256 internal constant GRID_PIXELS = 4096;
    uint256 internal constant TRAIT_MUTATION_INDEX = 15;
    uint256 public constant TIER1_THRESHOLD = 1500;
    uint256 public constant TIER2_THRESHOLD = 2000;
    uint256 public constant TIER1_MIN_PERCENT = 1;
    uint256 public constant TIER2_MIN_PERCENT = 2;
    uint256 public constant TIER3_MIN_PERCENT = 3;
    uint256 public constant MAX_BURN_PERCENT = 4;
    /// @notice AP earned per level² unit in `getLevel()` (Level N requires N² × divisor lifetime AP).
    uint256 public constant LEVEL_AP_DIVISOR = 50;
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

    /// @inheritdoc IPixelCanvas
    mapping(uint256 tokenId => uint256 points) public actionPoints;
    /// @inheritdoc IPixelCanvas
    mapping(uint256 tokenId => uint256 apSpent) public totalApSpent;
    /// @notice Lifetime AP ever earned per token (never decremented on spend or transfer).
    mapping(uint256 tokenId => uint256 earned) public totalApEarned;
    mapping(uint256 tokenId => uint256 count) public burnCount;
    mapping(uint256 tokenId => bool) public customized;
    mapping(uint256 tokenId => uint256) public pixelsEdited;

    mapping(address user => PendingCommit) public pendingCommit;
    mapping(uint256 tokenId => CanvasEdit[]) internal tokenDiffs;
    /// @notice Operator contracts (e.g. PixelMarketplace) allowed to move AP on sellers' behalf.
    mapping(address operator => bool approved) public approvedOperators;

    event CommitSubmitted(address indexed user, bytes32 indexed commitment);
    event BurnRevealed(address indexed user, uint256 indexed burnedTokenId, uint256 indexed creditedTokenId, uint256 actionPointsAwarded);
    event DiffApplied(address indexed user, uint256 indexed tokenId, uint256 entriesApplied);
    event MutationTierShifted(uint256 indexed tokenId, uint8 oldTier, uint8 newTier);
    event APEarned(uint256 indexed tokenId, uint256 amount);
    event APSpent(uint256 indexed tokenId, uint256 amount);
    event OperatorApprovalSet(address indexed operator, bool approved);

    constructor(address chromaAddress, address storageAddress, address initialOwner) Ownable(initialOwner) {
        chroma = IChromaToken(chromaAddress);
        chromaStorage = IChromaStorage(storageAddress);
    }

    // ========================================================================
    // IPixelCanvas
    // ========================================================================

    /// @inheritdoc IPixelCanvas
    function level(uint256 tokenId) public view returns (uint256) {
        return totalApSpent[tokenId] / 100 + 1;
    }

    /// @inheritdoc IPixelCanvas
    function ownerOfToken(uint256 tokenId) public view returns (address) {
        return chroma.ownerOf(tokenId);
    }

    /// @inheritdoc IPixelCanvas
    function transferAP(uint256 fromTokenId, uint256 toTokenId, uint256 amount) external {
        if (chroma.ownerOf(fromTokenId) != msg.sender) revert NotTokenOwner();
        _transferAP(fromTokenId, toTokenId, amount);
    }

    /// @inheritdoc IPixelCanvas
    function operatorTransferAP(address fromOwner, uint256 fromTokenId, uint256 toTokenId, uint256 amount) external {
        if (!approvedOperators[msg.sender]) revert NotApprovedOperator();
        if (chroma.ownerOf(fromTokenId) != fromOwner) revert NotTokenOwner();
        _transferAP(fromTokenId, toTokenId, amount);
    }

    // ========================================================================
    // AP economy
    // ========================================================================

    /// @notice Admin AP grant (promotions, migrations from V1 balances, etc).
    ///         Organic earning happens through the burn flow below.
    function earnAP(uint256 tokenId, uint256 amount) external onlyOwner {
        chroma.ownerOf(tokenId); // reverts for nonexistent token
        _earnAP(tokenId, amount);
    }

    /// @notice Spend a token's AP without an edit (levels the token up).
    ///         Caller must own the token.
    function spendAP(uint256 tokenId, uint256 amount) external {
        if (chroma.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        _spendAP(tokenId, amount);
    }

    /// @notice Approve/revoke an operator contract (e.g. PixelMarketplace).
    function setOperatorApproval(address operator, bool approved) external onlyOwner {
        approvedOperators[operator] = approved;
        emit OperatorApprovalSet(operator, approved);
    }

    // ========================================================================
    // Burn + canvas flows (adapted from V1)
    // ========================================================================

    function submitCommit(bytes32 commitment) external {
        pendingCommit[msg.sender] = PendingCommit({commitment: commitment, exists: true});
        emit CommitSubmitted(msg.sender, commitment);
    }

    /// @notice Reveal a committed burn. Burn yield is credited to `tokenId`
    ///         (the kept token), then the optional diff is applied using that
    ///         token's AP. Caller must own both tokens.
    function revealBurnAndApplyDiff(uint256 tokenId, uint256 burnedTokenId, bytes32 salt, bytes calldata diffData) external {
        PendingCommit memory commit = pendingCommit[msg.sender];
        if (!commit.exists) revert MissingCommit();

        bytes32 revealHash = keccak256(abi.encode(msg.sender, tokenId, burnedTokenId, diffData, salt));
        if (revealHash != commit.commitment) revert InvalidReveal();
        delete pendingCommit[msg.sender];

        if (chroma.ownerOf(burnedTokenId) != msg.sender) revert NotTokenOwner();
        if (chroma.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        chroma.transferFrom(msg.sender, DEAD_ADDRESS, burnedTokenId);

        uint256 burnYield = calculateBurnAP(burnedTokenId);
        _earnAP(tokenId, burnYield);
        burnCount[tokenId] += 1;
        emit BurnRevealed(msg.sender, burnedTokenId, tokenId, burnYield);

        if (chroma.isLocked(tokenId)) revert TokenLocked();

        if (diffData.length > 0) {
            _applyDiff(tokenId, diffData, msg.sender);
        }
    }

    /// @notice Apply pixel edits to a token, spending that token's own AP.
    ///         Caller must own the token.
    function applyDiff(uint256 tokenId, bytes calldata diffData) external {
        if (chroma.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        _applyDiff(tokenId, diffData, msg.sender);
    }

    /// @notice Shift mutation tier toward Pristine, spending the token's own AP.
    function shiftMutationTier(uint256 tokenId, uint8 newTier) external {
        if (chroma.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (chroma.isLocked(tokenId)) revert TokenLocked();
        if (newTier > 3) revert InvalidMutationTier();

        bytes memory traits = chromaStorage.getTraits(tokenId);
        uint8 currentTier = uint8(traits[TRAIT_MUTATION_INDEX]);
        uint256 cost = _mutationShiftCost(currentTier, newTier);

        _spendAP(tokenId, cost);
        chromaStorage.updateTrait(tokenId, TRAIT_MUTATION_INDEX, newTier);
        emit MutationTierShifted(tokenId, currentTier, newTier);
    }

    // ========================================================================
    // Views
    // ========================================================================

    function getDiff(uint256 tokenId) external view returns (uint16[] memory pixelIndexes, uint8[] memory newColorIndexes) {
        CanvasEdit[] storage edits = tokenDiffs[tokenId];
        pixelIndexes = new uint16[](edits.length);
        newColorIndexes = new uint8[](edits.length);
        for (uint256 i = 0; i < edits.length; ++i) {
            pixelIndexes[i] = edits[i].pixelIndex;
            newColorIndexes[i] = edits[i].newColorIndex;
        }
    }

    function getBurnCount(uint256 tokenId) external view returns (uint256) {
        return burnCount[tokenId];
    }

    function isCustomized(uint256 tokenId) external view returns (bool) {
        return customized[tokenId];
    }

    function getPixelsEdited(uint256 tokenId) external view returns (uint256) {
        return pixelsEdited[tokenId];
    }

    function getTotalPixels(uint256 tokenId) external view returns (uint256) {
        return chromaStorage.getTotalPixels(tokenId);
    }

    /// @notice Uncapped activity level from lifetime AP earned (sqrt curve, separate from mutation tier).
    function getLevel(uint256 tokenId) public view returns (uint256) {
        uint256 earned = totalApEarned[tokenId];
        if (earned == 0) return 0;
        return Math.sqrt(earned / LEVEL_AP_DIVISOR);
    }

    /// @notice Tiered burn yield from the sacrificed token's on-chain pixel count.
    function calculateBurnAP(uint256 burnTokenId) public view returns (uint256) {
        uint256 pixels = chromaStorage.getTotalPixels(burnTokenId);
        uint256 percent;
        if (pixels < TIER1_THRESHOLD) {
            percent = TIER1_MIN_PERCENT;
        } else if (pixels < TIER2_THRESHOLD) {
            percent = TIER2_MIN_PERCENT;
        } else {
            percent = TIER3_MIN_PERCENT;
        }

        uint256 ap = (pixels * percent) / 100;
        uint256 maxAp = (pixels * MAX_BURN_PERCENT) / 100;
        return ap > maxAp ? maxAp : ap;
    }

    function getCanvasInfo(address user, uint256 tokenId)
        external
        view
        returns (uint256 points, uint256 diffCount, bool tokenCustomized, bool hasPendingCommit)
    {
        points = actionPoints[tokenId];
        diffCount = tokenDiffs[tokenId].length;
        tokenCustomized = customized[tokenId];
        hasPendingCommit = pendingCommit[user].exists;
    }

    /// @inheritdoc IChromaCanvasFinalize
    function computeFinalPixels(uint256 tokenId) external view returns (bytes memory pixels, uint16 totalPixelCount) {
        pixels = chromaStorage.getPixels(tokenId);
        CanvasEdit[] storage edits = tokenDiffs[tokenId];
        for (uint256 i = 0; i < edits.length; ++i) {
            _setPackedPixel(pixels, edits[i].pixelIndex, edits[i].newColorIndex);
        }
        totalPixelCount = uint16(_countNonZeroPixels(pixels));
    }

    /// @inheritdoc IChromaCanvasFinalize
    function clearDiffs(uint256 tokenId) external {
        if (msg.sender != address(chroma)) revert UnauthorizedChromaCaller();
        delete tokenDiffs[tokenId];
    }

    // ========================================================================
    // Internals
    // ========================================================================

    function _earnAP(uint256 tokenId, uint256 amount) internal {
        actionPoints[tokenId] += amount;
        totalApEarned[tokenId] += amount;
        emit APEarned(tokenId, amount);
    }

    function _spendAP(uint256 tokenId, uint256 amount) internal {
        if (actionPoints[tokenId] < amount) revert InsufficientActionPoints();
        actionPoints[tokenId] -= amount;
        totalApSpent[tokenId] += amount;
        emit APSpent(tokenId, amount);
    }

    function _transferAP(uint256 fromTokenId, uint256 toTokenId, uint256 amount) internal {
        if (fromTokenId == toTokenId) revert InvalidTransfer();
        chroma.ownerOf(toTokenId); // reverts for nonexistent destination
        if (actionPoints[fromTokenId] < amount) revert InsufficientActionPoints();

        actionPoints[fromTokenId] -= amount;
        actionPoints[toTokenId] += amount;
        emit APTransferred(fromTokenId, toTokenId, amount);
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

        for (uint256 i = 0; i < entryCount; ++i) {
            uint256 offset = i * 3;
            uint16 pixelIndex = (uint16(uint8(diffData[offset])) << 8) | uint16(uint8(diffData[offset + 1]));
            uint8 newColorIndex = uint8(diffData[offset + 2]);
            if (pixelIndex >= GRID_PIXELS) revert PixelIndexOutOfRange();
            if (newColorIndex > 15) revert InvalidDiffEncoding();
            tokenDiffs[tokenId].push(CanvasEdit({pixelIndex: pixelIndex, newColorIndex: newColorIndex}));
        }

        if (entryCount > 0) {
            customized[tokenId] = true;
            pixelsEdited[tokenId] += entryCount;
        }

        _spendAP(tokenId, entryCount);
        emit DiffApplied(user, tokenId, entryCount);
    }

    function _setPackedPixel(bytes memory pixels, uint256 flatIndex, uint8 value) internal pure {
        uint256 byteIndex = flatIndex >> 1;
        uint8 current = uint8(pixels[byteIndex]);
        if ((flatIndex & 1) == 0) {
            pixels[byteIndex] = bytes1((current & 0x0f) | (value << 4));
        } else {
            pixels[byteIndex] = bytes1((current & 0xf0) | value);
        }
    }

    /// @dev Count loop lives on canvas bake path only (customized inscribe), not on reveal.
    function _countNonZeroPixels(bytes memory pixels) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < GRID_PIXELS; ++i) {
            uint8 packed = uint8(pixels[i >> 1]);
            uint8 idx = (i & 1) == 0 ? packed >> 4 : packed & 0x0f;
            if (idx != 0) {
                ++count;
            }
        }
    }
}
