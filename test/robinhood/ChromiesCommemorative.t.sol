// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ChromiesCommemorative} from "../../src/robinhood/ChromiesCommemorative.sol";
import {ChromaStorage} from "../../contracts/ChromaStorage.sol";
import {ChromaRenderer} from "../../contracts/ChromaRenderer.sol";
import {ChromaPaletteData} from "../../contracts/generated/ChromaPaletteData.sol";

/// @notice Foundry tests for the Robinhood Chain commemorative-edition contract.
/// Fixture payloads are the same Sepolia test-reveal.json "reveal"/"inscribe" pixel/trait
/// pairs already used in test/robinhood/RobinhoodTestHarness.sol, so the tokenURI parity
/// test cross-checks against the keccak256 already confirmed live on RH testnet in
/// chromies-engine/reports/ROBINHOOD_TESTNET_DRY_RUN.md.
contract ChromiesCommemorativeTest is Test, IERC721Receiver {
    /// @dev Test contract mints directly (msg.sender = address(this)) via `_safeMint`;
    /// this makes the test contract itself a valid ERC721 receiver.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @dev `owner == address(this)`, so `withdraw()`'s low-level call needs somewhere to land.
    receive() external payable {}

    ChromiesCommemorative internal token;
    ChromaRenderer internal renderer;
    ChromaPaletteData internal paletteData;

    address internal owner = address(this);

    /// @dev art-pipeline/output/test-reveal.json -> reveal.traitsHex / reveal.pixelsHex.
    bytes internal constant TRAITS_A =
        hex"0004010001000000000101000002010301000000000000000000000000000000";
    bytes internal constant PIXELS_A =
        hex"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000dd000ddddddd0dd0000000000000000000000000000000000000000000000dd0dfd11deeddeedddd00000000000000000000000000000000000000000fd00dddddeedddffeefeddd0d000000000000000000000000000000000000000deededeeddeeeeeefeefddeddd000000000000000000000000000000000000001deeed1efffeefeefeeffdeddd0000000000000000000000000000000000000001deffeeefeeffefeefefefddd00000000000000000000000000000000000000001deffffefeefeefffefefeed10000000000000000000000000000000000000ddd1deffefeeefffeefeeeeefd10000000000000000000000000000000000000ddedddeffffeeeffedeeddeeeed10000000000000000000000000000000000000ddeeeeeffeeedeeeddddd1dee1d0000000000000000000000000000000000000001deeefeeeeddd1111d111ddd1000000000000000000000000000000000000000dd1ddeeededd11d66876d1eed0000000000000000000000000000000000000001dddeedd1111d88888876d11ed00000000000000000000000000000000000000011d11111117777787867611dd00000000000000000000000000000000000000000051111188888878687751dd000000000000000000000000000000000000000000555777678767778887555d000000000000000000000000000000000000000000557678887877788755555d000000000000000000000000000000000000000000544456787767775444575d0000000000000000000000000000000000000000655444445567655444445555000000000000000000000000000000000000000651551111145847111111551180000000000000000000000000000000000000054511111111111111111111645000000000000000000000000000000000000005545711111858551111117545700000000000000000000000000000000000000554557777755757757758765550000000000000000000000000000000000000005555767675686578578665550000000000000000000000000000000000000000451557785567655876765165000000000000000000000000000000000000000005155676544544778775525000000000000000000000000000000000000000000011567711111111677511000000000000000000000000000000000000000000001116611111111117611200000000000000000000000000000000000000000000111111156666511111210000000000000000000000000000000000000000000011111111111111111111000000000000000000000000000000000000000000000112112112111211211000000000000000000000000000000000000000000000021221122112112111000000000000000000000000000000000000000000003111112111211112112110000000000000000000000000000000000000000039919111121211111111411111000000000000000000000000000000000000019911111111111112111441111119900000000000000000000000000000000011911111155211111111445111111199000000000000000000000000000000001191111115556111111465511111119110000000000000000000000000000000112911111555664444655651111119911000000000000000000000000000003111119119945555676765656111119911110000000000000000000000000000111111129111455566665655411199111111300000000000000000000000003111111111999114555776566499999911911133000000000000000000000031111111111111191145555566411111129921111133000000000000000000019999119111119991912455555492119921111111111130000000000000000119999992291111111121114444411111111111111999999133000000000000199299999999991111119111199111112111111199999999919910000000003111199999999992999111921111111111211111999999999999119300000000119119919999999999922121991111119122119999999999999999120000000019911291999999999999912999999122912199999999999911991191100000031199919199999999999991219999999991219999999999991991999110000001191991919199999999999121999999999121999999999999191999921100003119911911199999999999912199999999912999999999999119111999110000119991111111999999999991299999999991229999999999911199999911300111999111111191999999999121999999999129999999919991111999999910011119999111199929999999912999999999912999999999999111291199991001111199911119199999999991229999999991219999999999911121119191110119111999111911199999999129999999999121999999999111111111199919112991111111191991999999910199999999910999999199911111199919991911999911111111119999999999199999999991199999199911111119119299991199991111111111991999999999999999999999999999991111119111919929";

    /// @dev art-pipeline/output/test-reveal.json -> inscribe.traitsHex / inscribe.pixelsHex.
    bytes internal constant TRAITS_B =
        hex"0106000303010004000000000003000201000000000000000000000000000000";
    bytes internal constant PIXELS_B =
        hex"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000756666650000000000000000000000000000000000000000000000000000006566777766570000000000000000000000000000000000000000000000000006666771111766660000000000000000000000000000000000000000000000005667777111177665600000000000000000000000000000000000000000000006667778711187776655000000000000000000000000000000000000000000008567777881117877766500000000000000000000000000000000000000000000666678888111877777650000000000000000000000000000000000000000000656677777811178777766500000000000000000000000000000000000000000085667777811118777666560000000000000000000000000000000000000000005666677771111777777655000000000000000000000000000000000000000000566767787111777777665500000000000000000000000000000000000000000056667777811178777766550000000000000000000000000000000000000000005661111111111111111655000000000000000000000000000000000000000006165111111111111111115570000000000000000000000000000000000000005611111111111111111111511500000000000000000000000000000000000000545111113111111113111111450000000000000000000000000000000000000065451113111111113111111456000000000000000000000000000000000000006541111111111111111111154600000000000000000000000000000000000000054511111111111111111114540000000000000000000000000000000000000006651111111178111111115550000000000000000000000000000000000000000855511111168861111115454000000000000000000000000000000000000000000455666656775571615545000000000000000000000000000000000000000000005566666444466616554000000000000000000000000000000000000000000000555666676677666655400000000000000000000000000000000000000000000065566465665646656400000000000000000000000000000000000000000000006566754444446765540000000000000000000000000000000000000000000000085566655555766550000000000000000000000000000000000000000000000000556665445666554000000000000000000000000000000000000000000000000048566688766554000000000000000000000000000000000000000000000000005465678876554400000000000000000000000000000000000000000000000000554656666554440000000000000000000000000000000000000000000000000055646555564445000000000000000000000000000000000000000000000000055556444444445550000000000000000000000000000000000000000000000065555664444455656600000000000000000000000000000000000000000000664455555676765656446600000000000000000000000000000000000000009654664455566665655666456690000000000000000000000000000000000009966566564555776566656656659900000000000000000000000000000000001116556666545555566666665566911000000000000000000000000000000011111655665656445555656566556699910000000000000000000000000000551111155666555664455665556665559999950000000000000000000000005556111115666655666644666655666655999995550000000000000000000066666611111555555585666666555555555591129666660000000000000000546666771111155666666666666666666665559111976666450000000000000546666887111115566666786655668766666559111198866664500000000000565666677711111266666667766667766666665929919776666565000000000046566667661111116666666667667666666666699991967666656400000000004556666666912111966666666666666666666699999996666665540000000005455666666691999196666666666666666666669999919666666554500000000865566666669999999966666677667766666669999991966666655680000000056566666665999999996666666766766666666999999196666666565000000004556666655699999929997766567765667779999922219556666655400000000455566665649999999199776665775666799999992222995666655540000000046556665642999999992299999922299999999999999999656665564000000005655555541929999999999299999999991299999999991945555556500000000565555554292999999999999922222199999999999999199555555650000";

    function setUp() public {
        token = new ChromiesCommemorative(owner);
        paletteData = new ChromaPaletteData();
        renderer = new ChromaRenderer(address(token), address(paletteData), owner);
        token.setRenderer(address(renderer));

        // Seed all 100 IDs up front (alternating fixture A/B) so supply-cap tests can mint
        // the full collection without a separate seeding step per test.
        uint256[] memory ids = new uint256[](100);
        bytes[] memory pixels = new bytes[](100);
        bytes[] memory traits = new bytes[](100);
        for (uint256 i = 0; i < 100; ++i) {
            ids[i] = i + 1;
            if (i % 2 == 0) {
                pixels[i] = PIXELS_A;
                traits[i] = TRAITS_A;
            } else {
                pixels[i] = PIXELS_B;
                traits[i] = TRAITS_B;
            }
        }
        token.seedPayloads(ids, pixels, traits);
        token.setMintOpen(true);
    }

    // ---------------------------------------------------------------------
    // Supply cap
    // ---------------------------------------------------------------------

    function test_SupplyCap_MintsExactlyMaxSupply() public {
        uint256 priceForTwo = token.MINT_PRICE() * 2;
        for (uint256 w = 0; w < 50; ++w) {
            address wallet = vm.addr(w + 1);
            vm.deal(wallet, 1 ether);
            vm.prank(wallet);
            token.mint{value: priceForTwo}(2);
        }
        assertEq(token.totalSupply(), 100, "should mint exactly MAX_SUPPLY");

        address overflowWallet = vm.addr(9999);
        vm.deal(overflowWallet, 1 ether);
        uint256 priceForOne = token.MINT_PRICE();
        vm.prank(overflowWallet);
        vm.expectRevert(ChromiesCommemorative.MaxSupplyReached.selector);
        token.mint{value: priceForOne}(1);
    }

    // ---------------------------------------------------------------------
    // Per-wallet cap
    // ---------------------------------------------------------------------

    function test_WalletCap_RejectsQuantityAboveTwo() public {
        uint256 price = token.MINT_PRICE() * 3;
        vm.expectRevert(ChromiesCommemorative.InvalidQuantity.selector);
        token.mint{value: price}(3);
    }

    function test_WalletCap_RejectsZeroQuantity() public {
        vm.expectRevert(ChromiesCommemorative.InvalidQuantity.selector);
        token.mint{value: 0}(0);
    }

    function test_WalletCap_RejectsExceedingAcrossTwoMints() public {
        token.mint{value: token.MINT_PRICE()}(1);
        uint256 price = token.MINT_PRICE() * 2;
        vm.expectRevert(ChromiesCommemorative.MaxPerWalletExceeded.selector);
        token.mint{value: price}(2);
    }

    function test_WalletCap_AllowsExactlyTwoAcrossTwoMints() public {
        token.mint{value: token.MINT_PRICE()}(1);
        token.mint{value: token.MINT_PRICE()}(1);
        assertEq(token.walletMinted(owner), 2);
        assertEq(token.ownerOf(1), owner);
        assertEq(token.ownerOf(2), owner);
    }

    // ---------------------------------------------------------------------
    // Price enforcement
    // ---------------------------------------------------------------------

    function test_PriceEnforcement_RevertsOnUnderpay() public {
        uint256 price = token.MINT_PRICE() - 1;
        vm.expectRevert(ChromiesCommemorative.InsufficientPayment.selector);
        token.mint{value: price}(1);
    }

    function test_PriceEnforcement_RevertsOnOverpay() public {
        uint256 price = token.MINT_PRICE() + 1;
        vm.expectRevert(ChromiesCommemorative.InsufficientPayment.selector);
        token.mint{value: price}(1);
    }

    function test_PriceEnforcement_ExactQuantityMultiple() public {
        token.mint{value: token.MINT_PRICE() * 2}(2);
        assertEq(token.totalSupply(), 2);
    }

    function test_MintNotOpen_Reverts() public {
        ChromiesCommemorative fresh = new ChromiesCommemorative(owner);
        uint256 price = fresh.MINT_PRICE();
        vm.expectRevert(ChromiesCommemorative.MintNotOpen.selector);
        fresh.mint{value: price}(1);
    }

    // ---------------------------------------------------------------------
    // Seed lock after mintOpen
    // ---------------------------------------------------------------------

    function test_SeedLock_SeedingWorksBeforeMintOpen() public {
        ChromiesCommemorative fresh = new ChromiesCommemorative(owner);
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        bytes[] memory pixels = new bytes[](1);
        pixels[0] = PIXELS_A;
        bytes[] memory traits = new bytes[](1);
        traits[0] = TRAITS_A;
        fresh.seedPayloads(ids, pixels, traits);
        assertTrue(fresh.hasData(1));
    }

    function test_SeedLock_LockedPermanentlyAfterMintOpen() public {
        ChromiesCommemorative fresh = new ChromiesCommemorative(owner);
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        bytes[] memory pixels = new bytes[](1);
        pixels[0] = PIXELS_A;
        bytes[] memory traits = new bytes[](1);
        traits[0] = TRAITS_A;
        fresh.seedPayloads(ids, pixels, traits);

        fresh.setMintOpen(true);

        uint256[] memory idsAfter = new uint256[](1);
        idsAfter[0] = 2;
        bytes[] memory pixelsAfter = new bytes[](1);
        pixelsAfter[0] = PIXELS_B;
        bytes[] memory traitsAfter = new bytes[](1);
        traitsAfter[0] = TRAITS_B;
        vm.expectRevert(ChromiesCommemorative.SeedingLocked.selector);
        fresh.seedPayloads(idsAfter, pixelsAfter, traitsAfter);

        // Ratchet: closing mint again must NOT re-open seeding.
        fresh.setMintOpen(false);
        vm.expectRevert(ChromiesCommemorative.SeedingLocked.selector);
        fresh.seedPayloads(idsAfter, pixelsAfter, traitsAfter);
    }

    // ---------------------------------------------------------------------
    // tokenURI parity
    // ---------------------------------------------------------------------

    function test_TokenURI_RevertsForUnmintedId() public {
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1)
        );
        token.tokenURI(1);
    }

    /// @dev Builds an independent reference path — a fresh ChromaStorage seeded with the
    /// same fixture, wired to its own ChromaRenderer instance — and asserts this contract's
    /// self-storage tokenURI is byte-for-byte identical to that reference. This is
    /// self-contained (no dependency on a transcribed hash from any report), so it can't
    /// silently drift if the report's recorded value is ever wrong.
    function test_TokenURI_MatchesChromaStorageReferencePath() public {
        ChromaStorage referenceStorage = new ChromaStorage(owner, owner);
        ChromaRenderer referenceRenderer = new ChromaRenderer(address(referenceStorage), address(paletteData), owner);
        referenceStorage.writeTokenData(1, PIXELS_A, TRAITS_A);

        token.mint{value: token.MINT_PRICE()}(1);

        string memory viaCommemorative = token.tokenURI(1);
        string memory viaReference = referenceRenderer.tokenURI(1);
        assertEq(viaCommemorative, viaReference, "tokenURI drifted from ChromaStorage reference path");
    }

    function test_TokenURI_RendererNotSetReverts() public {
        ChromiesCommemorative fresh = new ChromiesCommemorative(owner);
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        bytes[] memory pixels = new bytes[](1);
        pixels[0] = PIXELS_A;
        bytes[] memory traits = new bytes[](1);
        traits[0] = TRAITS_A;
        fresh.seedPayloads(ids, pixels, traits);
        fresh.setMintOpen(true);
        fresh.mint{value: fresh.MINT_PRICE()}(1);

        vm.expectRevert(ChromiesCommemorative.RendererNotSet.selector);
        fresh.tokenURI(1);
    }

    // ---------------------------------------------------------------------
    // Withdraw
    // ---------------------------------------------------------------------

    function test_Withdraw_TransfersBalanceToOwner() public {
        token.mint{value: token.MINT_PRICE() * 2}(2);
        uint256 contractBalance = address(token).balance;
        assertEq(contractBalance, token.MINT_PRICE() * 2);

        uint256 ownerBalanceBefore = owner.balance;
        token.withdraw();
        assertEq(address(token).balance, 0);
        assertEq(owner.balance, ownerBalanceBefore + contractBalance);
    }

    function test_Withdraw_RevertsForNonOwner() public {
        token.mint{value: token.MINT_PRICE() * 2}(2);
        address notOwner = vm.addr(1234);
        vm.prank(notOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, notOwner));
        token.withdraw();
    }

    // ---------------------------------------------------------------------
    // ERC-2981 royalty
    // ---------------------------------------------------------------------

    function test_RoyaltyInfo_FivePercentToOwner() public view {
        (address receiver, uint256 royaltyAmount) = token.royaltyInfo(1, 1 ether);
        assertEq(receiver, owner, "royalty receiver should be the contract owner");
        assertEq(royaltyAmount, 0.05 ether, "royalty should be 5% of sale price");
    }

    function test_SupportsInterface_ERC2981() public view {
        // IERC2981 interface id: 0x2a55205a
        assertTrue(token.supportsInterface(0x2a55205a));
    }
}
