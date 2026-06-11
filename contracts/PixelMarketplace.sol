// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPixelCanvas} from "./IPixelCanvas.sol";

/// @title PixelMarketplace
/// @notice Minimal, non-custodial marketplace for per-token Action Points.
///         Works with any contract implementing IPixelCanvas (Chromies, Normies).
///
///         Flow:
///         1. Seller lists AP held by their token at an ETH price.
///            AP is NOT escrowed — it stays in the seller token.
///         2. Buyer calls `buy` with a destination token they own and exact ETH.
///            AP moves seller-token -> buyer-token via `operatorTransferAP`
///            (this contract must be an approved operator on the canvas).
///         3. ETH is forwarded to the seller in the same transaction.
///
///         Because listings are non-custodial, a listing can go stale (seller
///         spent/transferred the AP, or sold the token). `buy` re-validates
///         ownership and balance at purchase time and reverts if stale.
contract PixelMarketplace is ReentrancyGuard {
    error NotTokenOwner();
    error NotSeller();
    error ListingNotFound();
    error WrongPayment();
    error ZeroAmount();
    error ZeroPrice();
    error StaleListing();
    error EthTransferFailed();

    struct Listing {
        address seller;     // listing creator; must still own sellerTokenId at buy time
        address canvas;     // IPixelCanvas implementation
        uint256 tokenId;    // token holding the AP for sale
        uint256 amount;     // AP amount for sale
        uint256 price;      // total price in wei for the full amount
    }

    uint256 public nextListingId = 1;
    mapping(uint256 listingId => Listing) public listings;

    event APListed(
        uint256 indexed listingId,
        address indexed canvas,
        uint256 indexed tokenId,
        address seller,
        uint256 amount,
        uint256 price
    );
    event APSold(
        uint256 indexed listingId,
        address indexed canvas,
        uint256 indexed buyerTokenId,
        address buyer,
        uint256 sellerTokenId,
        uint256 amount,
        uint256 price
    );
    event APListingCancelled(uint256 indexed listingId);

    /// @notice List `amount` AP from `tokenId` for `price` wei total.
    /// @dev Non-custodial: only validates ownership + balance now; re-checked at buy.
    function list(address canvas, uint256 tokenId, uint256 amount, uint256 price)
        external
        returns (uint256 listingId)
    {
        if (amount == 0) revert ZeroAmount();
        if (price == 0) revert ZeroPrice();
        if (IPixelCanvas(canvas).ownerOfToken(tokenId) != msg.sender) revert NotTokenOwner();
        if (IPixelCanvas(canvas).actionPoints(tokenId) < amount) revert StaleListing();

        listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            canvas: canvas,
            tokenId: tokenId,
            amount: amount,
            price: price
        });

        emit APListed(listingId, canvas, tokenId, msg.sender, amount, price);
    }

    /// @notice Cancel a listing. Only the seller may cancel.
    function cancel(uint256 listingId) external {
        Listing memory listing = listings[listingId];
        if (listing.seller == address(0)) revert ListingNotFound();
        if (listing.seller != msg.sender) revert NotSeller();

        delete listings[listingId];
        emit APListingCancelled(listingId);
    }

    /// @notice Buy a listing, landing the AP in `buyerTokenId` (must be owned by caller).
    function buy(uint256 listingId, uint256 buyerTokenId) external payable nonReentrant {
        Listing memory listing = listings[listingId];
        if (listing.seller == address(0)) revert ListingNotFound();
        if (msg.value != listing.price) revert WrongPayment();

        IPixelCanvas canvas = IPixelCanvas(listing.canvas);
        if (canvas.ownerOfToken(buyerTokenId) != msg.sender) revert NotTokenOwner();

        // Re-validate the non-custodial listing at purchase time.
        if (canvas.ownerOfToken(listing.tokenId) != listing.seller) revert StaleListing();
        if (canvas.actionPoints(listing.tokenId) < listing.amount) revert StaleListing();

        // Effects before interactions.
        delete listings[listingId];

        canvas.operatorTransferAP(listing.seller, listing.tokenId, buyerTokenId, listing.amount);

        (bool ok,) = listing.seller.call{value: msg.value}("");
        if (!ok) revert EthTransferFailed();

        emit APSold(
            listingId,
            listing.canvas,
            buyerTokenId,
            msg.sender,
            listing.tokenId,
            listing.amount,
            listing.price
        );
    }
}
