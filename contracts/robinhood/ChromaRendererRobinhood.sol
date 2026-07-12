// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ChromaRenderer} from "../ChromaRenderer.sol";

/// @notice Robinhood Chain commemorative renderer — identical rendering logic to the
/// shared ETH-path `ChromaRenderer`, overriding only the token `name`/`description`
/// strings emitted by `tokenURI`. Deployed once per chain (testnet + mainnet), each
/// instance wired to its own `ChromiesCommemorative` (as `chromaStorage`, immutable)
/// and `ChromaPaletteData`.
///
/// Per the corrected-renderer task: the shared ETH-path strings in
/// `contracts/ChromaRenderer.sol` (`_tokenName`/`_tokenDescription` defaults) are left
/// UNCHANGED so existing/future ETH-side renderer deployments keep emitting
/// "Chroma #<id>" / "Chroma is a fully on-chain 64x64 indexed-color NFT." — only this
/// Robinhood-specific subclass diverges.
contract ChromaRendererRobinhood is ChromaRenderer {
    using Strings for uint256;

    constructor(address storageAddress, address paletteDataAddress, address initialOwner)
        ChromaRenderer(storageAddress, paletteDataAddress, initialOwner)
    {}

    function _tokenName(uint256 tokenId) internal view override returns (string memory) {
        return string(abi.encodePacked("Chromie #", tokenId.toString()));
    }

    function _tokenDescription() internal view override returns (string memory) {
        return unicode"One of the canonical first 100 Chromies — fully on-chain on Robinhood Chain.";
    }
}
