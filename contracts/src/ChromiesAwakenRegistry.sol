// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice ERC-8048 (Draft) onchain metadata interface. Interface ID: 0xdf670be1.
interface IERC8048Metadata {
    /// @notice Get metadata value for a key.
    function metadata(uint256 tokenId, string calldata key) external view returns (bytes memory);

    /// @notice Emitted when metadata is set for a token.
    event MetadataSet(uint256 indexed tokenId, string indexed indexedKey, string key, bytes value);
}

/// @title ChromiesAwakenRegistry
/// @notice ERC-8048 sidecar metadata registry for the Chromies ERC-721 collection,
///         following the ERC-721T agent profile ("context", "endpoint[a2a]").
///
///         The token contract itself is frozen; this sidecar is discovered via the
///         optional ERC-8048 "metadata_contract" tokenURI field (renderer redeploy,
///         tracked in contracts/AWAKEN_REGISTRY_SPEC.md).
///
///         Write policy: token holder only. There is no admin write path to token
///         metadata, no contract owner, and no upgradeability — the only privileged
///         state is the immutable token pointer and the immutable WRITE_ONCE flag.
contract ChromiesAwakenRegistry is IERC8048Metadata, IERC165 {
    /// @notice The Chromies ERC-721 contract this sidecar serves.
    IERC721 public immutable chromiesToken;

    /// @notice If true, a token can only be awakened once; if false, the current
    ///         holder may re-awaken (rewrite the reserved keys) at will.
    ///         The reserved keys ("context", "endpoint[a2a]") are writable only
    ///         through `awaken` in either mode — never via `setMetadataAsOwner`.
    bool public immutable WRITE_ONCE;

    /// @notice True once `awaken` has been called for the token.
    mapping(uint256 tokenId => bool) public awakened;

    mapping(uint256 tokenId => mapping(string key => bytes value)) private _metadata;

    string private constant KEY_CONTEXT = "context";
    string private constant KEY_ENDPOINT_A2A = "endpoint[a2a]";

    /// @notice Emitted when a token is awakened by its holder.
    event Awakened(uint256 indexed tokenId, address indexed owner);

    error NotTokenHolder(uint256 tokenId, address caller);
    error AlreadyAwakened(uint256 tokenId);
    error ReservedKey(uint256 tokenId, string key);
    error ZeroTokenAddress();

    constructor(address chromiesToken_, bool writeOnce_) {
        if (chromiesToken_ == address(0)) revert ZeroTokenAddress();
        chromiesToken = IERC721(chromiesToken_);
        WRITE_ONCE = writeOnce_;
    }

    // ------------------------------------------------------------------
    // ERC-8048 read
    // ------------------------------------------------------------------

    /// @inheritdoc IERC8048Metadata
    function metadata(uint256 tokenId, string calldata key) external view returns (bytes memory) {
        return _metadata[tokenId][key];
    }

    // ------------------------------------------------------------------
    // Holder writes
    // ------------------------------------------------------------------

    /// @notice Awaken a Chromie: store its agent context and A2A endpoint under the
    ///         ERC-721T reserved keys. Caller must be the current token holder.
    /// @param tokenId     Chromies token ID.
    /// @param context     UTF-8 text (Markdown recommended) for the "context" key.
    /// @param a2aEndpoint UTF-8 URI for the "endpoint[a2a]" key.
    function awaken(uint256 tokenId, bytes calldata context, bytes calldata a2aEndpoint) external {
        address owner = _requireHolder(tokenId);
        if (WRITE_ONCE && awakened[tokenId]) revert AlreadyAwakened(tokenId);

        _metadata[tokenId][KEY_CONTEXT] = context;
        emit MetadataSet(tokenId, KEY_CONTEXT, KEY_CONTEXT, context);

        _metadata[tokenId][KEY_ENDPOINT_A2A] = a2aEndpoint;
        emit MetadataSet(tokenId, KEY_ENDPOINT_A2A, KEY_ENDPOINT_A2A, a2aEndpoint);

        awakened[tokenId] = true;
        emit Awakened(tokenId, owner);
    }

    /// @notice Set an arbitrary metadata key as the current token holder.
    ///         The reserved awaken keys ("context", "endpoint[a2a]") are
    ///         awaken-path-only, unconditionally: this function reverts on them
    ///         regardless of awaken state and regardless of WRITE_ONCE.
    ///         Matching is exact-bytes / case-sensitive per ERC-8048, so
    ///         "endpoint[A2A]" and other case-variants are ordinary writable keys.
    function setMetadataAsOwner(uint256 tokenId, string calldata key, bytes calldata value) external {
        _requireHolder(tokenId);
        if (_isReservedKey(key)) revert ReservedKey(tokenId, key);

        _metadata[tokenId][key] = value;
        emit MetadataSet(tokenId, key, key, value);
    }

    // ------------------------------------------------------------------
    // ERC-165
    // ------------------------------------------------------------------

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC8048Metadata).interfaceId // 0xdf670be1
            || interfaceId == type(IERC165).interfaceId;
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _requireHolder(uint256 tokenId) internal view returns (address owner) {
        owner = chromiesToken.ownerOf(tokenId);
        if (msg.sender != owner) revert NotTokenHolder(tokenId, msg.sender);
    }

    function _isReservedKey(string calldata key) internal pure returns (bool) {
        bytes32 keyHash = keccak256(bytes(key));
        return keyHash == keccak256(bytes(KEY_CONTEXT)) || keyHash == keccak256(bytes(KEY_ENDPOINT_A2A));
    }
}
