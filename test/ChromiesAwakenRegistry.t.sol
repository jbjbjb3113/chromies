// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ChromiesAwakenRegistry, IERC8048Metadata} from "../contracts/src/ChromiesAwakenRegistry.sol";

contract MockChromies is ERC721 {
    constructor() ERC721("Chromies", "CHROMIE") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}

contract ChromiesAwakenRegistryTest is Test {
    MockChromies internal token;
    ChromiesAwakenRegistry internal onceRegistry; // WRITE_ONCE = true
    ChromiesAwakenRegistry internal openRegistry; // WRITE_ONCE = false

    address internal holder = makeAddr("holder");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant TOKEN_ID = 1;

    bytes internal constant CONTEXT = bytes("I am Chromie #1. PLACEHOLDER persona context.");
    bytes internal constant A2A = bytes("https://agents.chromies.example/a2a/1");

    event MetadataSet(uint256 indexed tokenId, string indexed indexedKey, string key, bytes value);
    event Awakened(uint256 indexed tokenId, address indexed owner);

    function setUp() public {
        token = new MockChromies();
        token.mint(holder, TOKEN_ID);
        onceRegistry = new ChromiesAwakenRegistry(address(token), true);
        openRegistry = new ChromiesAwakenRegistry(address(token), false);
    }

    // ------------------------------------------------------------------
    // Construction
    // ------------------------------------------------------------------

    function test_Constructor_SetsImmutables() public view {
        assertEq(address(onceRegistry.chromiesToken()), address(token));
        assertTrue(onceRegistry.WRITE_ONCE());
        assertFalse(openRegistry.WRITE_ONCE());
    }

    function test_Constructor_RevertsOnZeroToken() public {
        vm.expectRevert(ChromiesAwakenRegistry.ZeroTokenAddress.selector);
        new ChromiesAwakenRegistry(address(0), true);
    }

    // ------------------------------------------------------------------
    // ERC-165 / interface ID
    // ------------------------------------------------------------------

    function test_InterfaceId_Is0xdf670be1() public pure {
        assertEq(type(IERC8048Metadata).interfaceId, bytes4(0xdf670be1));
    }

    function test_SupportsInterface() public view {
        assertTrue(onceRegistry.supportsInterface(0xdf670be1)); // IERC8048Metadata
        assertTrue(onceRegistry.supportsInterface(0x01ffc9a7)); // ERC-165
        assertFalse(onceRegistry.supportsInterface(0xffffffff));
        assertFalse(onceRegistry.supportsInterface(0x80ac58cd)); // not an ERC-721
    }

    // ------------------------------------------------------------------
    // awaken: holder gating + writes + events
    // ------------------------------------------------------------------

    function test_Awaken_WritesKeysAndEmits() public {
        vm.expectEmit(true, true, true, true, address(onceRegistry));
        emit MetadataSet(TOKEN_ID, "context", "context", CONTEXT);
        vm.expectEmit(true, true, true, true, address(onceRegistry));
        emit MetadataSet(TOKEN_ID, "endpoint[a2a]", "endpoint[a2a]", A2A);
        vm.expectEmit(true, true, true, true, address(onceRegistry));
        emit Awakened(TOKEN_ID, holder);

        vm.prank(holder);
        onceRegistry.awaken(TOKEN_ID, CONTEXT, A2A);

        assertEq(onceRegistry.metadata(TOKEN_ID, "context"), CONTEXT);
        assertEq(onceRegistry.metadata(TOKEN_ID, "endpoint[a2a]"), A2A);
        assertTrue(onceRegistry.awakened(TOKEN_ID));
    }

    function test_Awaken_RevertsForNonHolder() public {
        vm.expectRevert(
            abi.encodeWithSelector(ChromiesAwakenRegistry.NotTokenHolder.selector, TOKEN_ID, stranger)
        );
        vm.prank(stranger);
        onceRegistry.awaken(TOKEN_ID, CONTEXT, A2A);
    }

    function test_Awaken_RevertsForNonexistentToken() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999));
        vm.prank(holder);
        onceRegistry.awaken(999, CONTEXT, A2A);
    }

    function test_Awaken_GasSnapshot() public {
        vm.prank(holder);
        uint256 gasBefore = gasleft();
        onceRegistry.awaken(TOKEN_ID, CONTEXT, A2A);
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("awaken gas (WRITE_ONCE=true, first write)", gasUsed);
    }

    // ------------------------------------------------------------------
    // WRITE_ONCE = true path
    // ------------------------------------------------------------------

    function test_WriteOnce_ReAwakenReverts() public {
        vm.startPrank(holder);
        onceRegistry.awaken(TOKEN_ID, CONTEXT, A2A);

        vm.expectRevert(abi.encodeWithSelector(ChromiesAwakenRegistry.AlreadyAwakened.selector, TOKEN_ID));
        onceRegistry.awaken(TOKEN_ID, bytes("rewrite"), bytes("rewrite"));
        vm.stopPrank();

        assertEq(onceRegistry.metadata(TOKEN_ID, "context"), CONTEXT);
    }

    function test_WriteOnce_NonReservedKeysStillWritableAfterAwaken() public {
        vm.startPrank(holder);
        onceRegistry.awaken(TOKEN_ID, CONTEXT, A2A);
        onceRegistry.setMetadataAsOwner(TOKEN_ID, "endpoint[mcp]", bytes("https://x/mcp/1"));
        vm.stopPrank();
        assertEq(onceRegistry.metadata(TOKEN_ID, "endpoint[mcp]"), bytes("https://x/mcp/1"));
    }

    // ------------------------------------------------------------------
    // WRITE_ONCE = false path
    // ------------------------------------------------------------------

    function test_Rewrite_ReAwakenAllowed() public {
        vm.startPrank(holder);
        openRegistry.awaken(TOKEN_ID, CONTEXT, A2A);
        openRegistry.awaken(TOKEN_ID, bytes("context v2"), bytes("https://x/a2a/1-v2"));
        vm.stopPrank();

        assertEq(openRegistry.metadata(TOKEN_ID, "context"), bytes("context v2"));
        assertEq(openRegistry.metadata(TOKEN_ID, "endpoint[a2a]"), bytes("https://x/a2a/1-v2"));
    }

    function test_Rewrite_NewHolderCanReAwakenAfterTransfer() public {
        vm.prank(holder);
        openRegistry.awaken(TOKEN_ID, CONTEXT, A2A);

        vm.prank(holder);
        token.transferFrom(holder, stranger, TOKEN_ID);

        // Old holder is now locked out...
        vm.expectRevert(
            abi.encodeWithSelector(ChromiesAwakenRegistry.NotTokenHolder.selector, TOKEN_ID, holder)
        );
        vm.prank(holder);
        openRegistry.awaken(TOKEN_ID, bytes("stale"), bytes("stale"));

        // ...and the new holder can rewrite.
        vm.prank(stranger);
        openRegistry.awaken(TOKEN_ID, bytes("new owner context"), A2A);
        assertEq(openRegistry.metadata(TOKEN_ID, "context"), bytes("new owner context"));
    }

    // ------------------------------------------------------------------
    // setMetadataAsOwner: gating + events
    // ------------------------------------------------------------------

    function test_SetMetadataAsOwner_RevertsForNonHolder() public {
        vm.expectRevert(
            abi.encodeWithSelector(ChromiesAwakenRegistry.NotTokenHolder.selector, TOKEN_ID, stranger)
        );
        vm.prank(stranger);
        openRegistry.setMetadataAsOwner(TOKEN_ID, "context", bytes("hijack"));
    }

    function test_SetMetadataAsOwner_EmitsMetadataSet() public {
        vm.expectEmit(true, true, true, true, address(openRegistry));
        emit MetadataSet(TOKEN_ID, "endpoint[web]", "endpoint[web]", bytes("https://chromies.example/1"));
        vm.prank(holder);
        openRegistry.setMetadataAsOwner(TOKEN_ID, "endpoint[web]", bytes("https://chromies.example/1"));
    }

    // ------------------------------------------------------------------
    // Reserved keys are awaken-path-only — unconditionally, both WRITE_ONCE
    // values, pre- and post-awaken (regression for the pre-awaken guard hole)
    // ------------------------------------------------------------------

    function _bothRegistries() internal view returns (ChromiesAwakenRegistry[2] memory) {
        return [onceRegistry, openRegistry];
    }

    function _expectReservedKeyRevert(
        ChromiesAwakenRegistry registry,
        uint256 tokenId,
        string memory key
    ) internal {
        vm.expectRevert(
            abi.encodeWithSelector(ChromiesAwakenRegistry.ReservedKey.selector, tokenId, key)
        );
        vm.prank(holder);
        registry.setMetadataAsOwner(tokenId, key, bytes("blocked"));
    }

    function test_ReservedKeys_GenericPathRevertsPreAwaken_BothModes() public {
        ChromiesAwakenRegistry[2] memory registries = _bothRegistries();
        for (uint256 i = 0; i < registries.length; ++i) {
            assertFalse(registries[i].awakened(TOKEN_ID));
            _expectReservedKeyRevert(registries[i], TOKEN_ID, "context");
            _expectReservedKeyRevert(registries[i], TOKEN_ID, "endpoint[a2a]");
            // Nothing was written.
            assertEq(registries[i].metadata(TOKEN_ID, "context"), bytes(""));
            assertEq(registries[i].metadata(TOKEN_ID, "endpoint[a2a]"), bytes(""));
        }
    }

    function test_ReservedKeys_AwakenSucceedsAfterGenericPathReverts_BothModes() public {
        ChromiesAwakenRegistry[2] memory registries = _bothRegistries();
        for (uint256 i = 0; i < registries.length; ++i) {
            ChromiesAwakenRegistry registry = registries[i];

            _expectReservedKeyRevert(registry, TOKEN_ID, "context");
            _expectReservedKeyRevert(registry, TOKEN_ID, "endpoint[a2a]");

            vm.expectEmit(true, true, true, true, address(registry));
            emit MetadataSet(TOKEN_ID, "context", "context", CONTEXT);
            vm.expectEmit(true, true, true, true, address(registry));
            emit MetadataSet(TOKEN_ID, "endpoint[a2a]", "endpoint[a2a]", A2A);
            vm.expectEmit(true, true, true, true, address(registry));
            emit Awakened(TOKEN_ID, holder);

            vm.prank(holder);
            registry.awaken(TOKEN_ID, CONTEXT, A2A);

            assertTrue(registry.awakened(TOKEN_ID));
            assertEq(registry.metadata(TOKEN_ID, "context"), CONTEXT);
            assertEq(registry.metadata(TOKEN_ID, "endpoint[a2a]"), A2A);
        }
    }

    function test_ReservedKeys_GenericPathRevertsPostAwaken_BothModes() public {
        ChromiesAwakenRegistry[2] memory registries = _bothRegistries();
        for (uint256 i = 0; i < registries.length; ++i) {
            vm.prank(holder);
            registries[i].awaken(TOKEN_ID, CONTEXT, A2A);

            _expectReservedKeyRevert(registries[i], TOKEN_ID, "context");
            _expectReservedKeyRevert(registries[i], TOKEN_ID, "endpoint[a2a]");

            // Awaken-written values are untouched by the reverted attempts.
            assertEq(registries[i].metadata(TOKEN_ID, "context"), CONTEXT);
            assertEq(registries[i].metadata(TOKEN_ID, "endpoint[a2a]"), A2A);
        }
    }

    function test_CaseVariantKeys_WritablePreAndPostAwaken_BothModes() public {
        ChromiesAwakenRegistry[2] memory registries = _bothRegistries();
        for (uint256 i = 0; i < registries.length; ++i) {
            ChromiesAwakenRegistry registry = registries[i];

            // Pre-awaken: case-variants of the reserved keys are ordinary keys.
            vm.startPrank(holder);
            registry.setMetadataAsOwner(TOKEN_ID, "endpoint[A2A]", bytes("pre-awaken"));
            registry.setMetadataAsOwner(TOKEN_ID, "Context", bytes("pre-awaken"));

            registry.awaken(TOKEN_ID, CONTEXT, A2A);

            // Post-awaken: still writable.
            registry.setMetadataAsOwner(TOKEN_ID, "endpoint[A2A]", bytes("post-awaken"));
            registry.setMetadataAsOwner(TOKEN_ID, "Context", bytes("post-awaken"));
            vm.stopPrank();

            assertEq(registry.metadata(TOKEN_ID, "endpoint[A2A]"), bytes("post-awaken"));
            assertEq(registry.metadata(TOKEN_ID, "Context"), bytes("post-awaken"));
            // Reserved lowercase keys hold the awaken-written values.
            assertEq(registry.metadata(TOKEN_ID, "endpoint[a2a]"), A2A);
            assertEq(registry.metadata(TOKEN_ID, "context"), CONTEXT);
        }
    }

    // ------------------------------------------------------------------
    // Key case-sensitivity (exact bytes per ERC-8048)
    // ------------------------------------------------------------------

    function test_KeyCaseSensitivity_DistinctStorage() public {
        vm.startPrank(holder);
        onceRegistry.awaken(TOKEN_ID, CONTEXT, A2A);
        // "endpoint[A2A]" is a different key: not reserved, not locked, own slot.
        onceRegistry.setMetadataAsOwner(TOKEN_ID, "endpoint[A2A]", bytes("uppercase-variant"));
        onceRegistry.setMetadataAsOwner(TOKEN_ID, "Context", bytes("uppercase-context"));
        vm.stopPrank();

        assertEq(onceRegistry.metadata(TOKEN_ID, "endpoint[a2a]"), A2A);
        assertEq(onceRegistry.metadata(TOKEN_ID, "endpoint[A2A]"), bytes("uppercase-variant"));
        assertEq(onceRegistry.metadata(TOKEN_ID, "context"), CONTEXT);
        assertEq(onceRegistry.metadata(TOKEN_ID, "Context"), bytes("uppercase-context"));
    }

    function test_UnsetKeyReturnsEmptyBytes() public view {
        assertEq(onceRegistry.metadata(TOKEN_ID, "context"), bytes(""));
        assertEq(onceRegistry.metadata(999, "anything"), bytes(""));
    }
}
