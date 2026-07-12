// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice NOT-FINAL — measurement scaffold for Model B `batchInscribe` gas only.
///         Do not deploy. Production implementation merges into `Chroma.sol` after design approval.
import {Chroma} from "../Chroma.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract ChromaBatchProbe is Chroma {
    error BatchInscribeClosed();
    error BatchInscribeLengthMismatch();

    bool public batchInscribeOpen = true;

    event BatchInscribeSkipped(uint256 indexed tokenId, bytes32 reason);
    event BatchInscribeCompleted(uint256 inscribed, uint256 skipped);

    bytes32 internal constant SKIP_ALREADY = keccak256("AlreadyInscribed");

    constructor(
        address storageAddress,
        address initialOwner,
        address royaltyReceiver,
        uint96 royaltyFeeNumerator
    ) Chroma(storageAddress, initialOwner, royaltyReceiver, royaltyFeeNumerator) {}

    function renounceBatchInscribe() external onlyOwner {
        batchInscribeOpen = false;
    }

    /// @dev Model B batch: permanence only — no seal, no per-token owner check.
    function batchInscribe(
        uint256[] calldata tokenIds,
        bytes[] calldata pixels,
        bytes[] calldata traits,
        bytes32[][] calldata proofs
    ) external onlyOwner {
        if (!batchInscribeOpen) revert BatchInscribeClosed();
        uint256 n = tokenIds.length;
        if (pixels.length != n || traits.length != n || proofs.length != n) {
            revert BatchInscribeLengthMismatch();
        }

        uint256 inscribed;
        uint256 skipped;

        for (uint256 i = 0; i < n; ++i) {
            uint256 tokenId = tokenIds[i];
            if (chromaStorage.hasData(tokenId)) {
                emit BatchInscribeSkipped(tokenId, SKIP_ALREADY);
                skipped++;
                continue;
            }
            if (!revealed[tokenId]) revert NotRevealed();
            if (pixels[i].length != PIXELS_LENGTH || traits[i].length != TRAITS_LENGTH) revert InvalidPayload();

            bytes32 leaf = keccak256(abi.encode(tokenId, pixels[i], traits[i]));
            if (!MerkleProof.verify(proofs[i], revealRoot, leaf)) revert InvalidMerkleProof();

            chromaStorage.writeTokenData(tokenId, pixels[i], traits[i]);
            delete revealedTraits[tokenId];
            _bakeCanvasEdits(tokenId);

            emit TokenInscribed(tokenId);
            inscribed++;
        }

        emit BatchInscribeCompleted(inscribed, skipped);
    }
}
