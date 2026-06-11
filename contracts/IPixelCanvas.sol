// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPixelCanvas
/// @notice Shared interface for per-token Action Point (AP) systems.
///         Designed so both Chromies (ChromaCanvasV2) and Normies canvases can
///         implement it, and so external contracts (e.g. PixelMarketplace) can
///         operate against either collection without knowing its internals.
///
///         Core ideas:
///         - AP balances live on TOKENS, not wallets. AP follows the token on sale.
///         - `transferAP` is called by the owner of the source token.
///         - `operatorTransferAP` is called by an approved operator contract
///           (e.g. the marketplace) on behalf of a seller, enabling
///           non-custodial AP sales: AP stays in the seller token until the
///           moment of purchase.
interface IPixelCanvas {
    /// @notice Emitted whenever AP moves token-to-token (owner or operator initiated).
    event APTransferred(uint256 indexed fromTokenId, uint256 indexed toTokenId, uint256 amount);

    /// @notice Current spendable AP balance of a token.
    function actionPoints(uint256 tokenId) external view returns (uint256);

    /// @notice Lifetime AP spent by a token (drives level).
    function totalApSpent(uint256 tokenId) external view returns (uint256);

    /// @notice Token level: totalApSpent / 100 + 1.
    function level(uint256 tokenId) external view returns (uint256);

    /// @notice Owner of the underlying NFT. Named to avoid clashing with ERC721 ownerOf
    ///         when a canvas and token live in the same contract.
    function ownerOfToken(uint256 tokenId) external view returns (address);

    /// @notice Move AP between tokens. Caller MUST own `fromTokenId`.
    function transferAP(uint256 fromTokenId, uint256 toTokenId, uint256 amount) external;

    /// @notice Move AP between tokens on behalf of `fromOwner`. Caller MUST be an
    ///         operator approved by the canvas (e.g. the marketplace), and
    ///         `fromOwner` MUST own `fromTokenId` at call time.
    function operatorTransferAP(address fromOwner, uint256 fromTokenId, uint256 toTokenId, uint256 amount) external;
}
