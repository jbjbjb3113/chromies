// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";
import {TraitFixtures, WriterCaller} from "./Chroma.t.sol";
import {ChromaFixtures} from "./ChromaFixtures.sol";

/// @notice Task 2 — tokenURI / renderImageShell view-gas sweep (measurement only).
contract GasStressTokenURITest is Test {
    WriterCaller internal writer;
    ChromaStorage internal storageContract;
    ChromaRenderer internal renderer;

    function setUp() public {
        writer = new WriterCaller();
        storageContract = new ChromaStorage(address(this), address(writer));
        renderer = ChromaFixtures.deployRendererOnly(storageContract, address(this));
    }

    function test_GasStress_WriteTokenURIProfile() public {
        string memory csvPath = vm.envOr(
            "GAS_STRESS_CSV_PATH",
            string.concat(vm.projectRoot(), "/chromies-engine/generated/parity_fixtures.csv")
        );
        uint256 seedStart = vm.envOr("GAS_STRESS_SEED_START", uint256(1));
        uint256 seedEnd = vm.envOr("GAS_STRESS_SEED_END", uint256(1000));

        string memory data = vm.readFile(csvPath);
        string[] memory lines = vm.split(data, "\n");

        uint256 count;
        uint256 minGas = type(uint256).max;
        uint256 maxGas;
        uint256 sumGas;
        uint256 worstSeed;
        uint256 worstTokenId;
        uint256 worstRenderGas;
        uint256 worstTokenUriGas;

        string memory batchTag = string.concat(vm.toString(seedStart), "_", vm.toString(seedEnd));

        for (uint256 i = 0; i < lines.length; ++i) {
            if (bytes(lines[i]).length == 0) continue;
            if (_startsWith(lines[i], "token_id")) continue;

            (uint256 seed, uint256 tokenId, uint256 renderGas, uint256 tokenUriGas, bool ok) =
                _measureFixtureLine(lines[i], seedStart, seedEnd);
            if (!ok) continue;

            sumGas += tokenUriGas;
            if (tokenUriGas < minGas) minGas = tokenUriGas;
            if (tokenUriGas > maxGas) {
                maxGas = tokenUriGas;
                worstSeed = seed;
                worstTokenId = tokenId;
                worstRenderGas = renderGas;
                worstTokenUriGas = tokenUriGas;
            }

            console2.log(
                string.concat(
                    "GAS_STRESS_SAMPLE ",
                    vm.toString(seed),
                    " ",
                    vm.toString(tokenId),
                    " ",
                    vm.toString(renderGas),
                    " ",
                    vm.toString(tokenUriGas)
                )
            );
            ++count;
        }

        require(count > 0, "no fixtures in seed range");

        string memory rootKey = "gasStressTokenURI";
        rootKey = vm.serializeUint(rootKey, "seed_start", seedStart);
        rootKey = vm.serializeUint(rootKey, "seed_end", seedEnd);
        rootKey = vm.serializeUint(rootKey, "sample_count", count);
        rootKey = vm.serializeUint(rootKey, "tokenuri_min", minGas);
        rootKey = vm.serializeUint(rootKey, "tokenuri_max", maxGas);
        rootKey = vm.serializeUint(rootKey, "tokenuri_mean", sumGas / count);
        rootKey = vm.serializeUint(rootKey, "worst_seed", worstSeed);
        rootKey = vm.serializeUint(rootKey, "worst_token_id", worstTokenId);
        rootKey = vm.serializeUint(rootKey, "worst_render_gas", worstRenderGas);
        rootKey = vm.serializeUint(rootKey, "worst_tokenuri_gas", worstTokenUriGas);
        rootKey = vm.serializeString(rootKey, "batch_tag", batchTag);

        vm.writeJson(
            rootKey,
            string.concat("./chromies-engine/generated/gas_stress_tokenuri_", batchTag, ".json")
        );
    }

    function test_GasStress_WriteSyntheticCeiling() public {
        _appendSyntheticCeiling();
    }

    function _appendSyntheticCeiling() internal {
        bytes memory pixels = new bytes(2048);
        for (uint256 y = 0; y < 64; ++y) {
            for (uint256 x = 0; x < 64; ++x) {
                uint8 idx = uint8(1 + ((x + y) % 14));
                _setPixel(pixels, x, y, idx);
            }
        }
        bytes memory traits = TraitFixtures.traitsWithTotalPixels(4096);
        writer.write(storageContract, 999_001, pixels, traits);

        uint256 renderGas = _measureRenderGas(999_001);
        uint256 tokenUriGas = _measureTokenURIGas(999_001);

        console2.log(
            string.concat(
                "GAS_STRESS_CEILING synthetic_worst_worst_render_gas ",
                vm.toString(renderGas)
            )
        );
        console2.log(
            string.concat(
                "GAS_STRESS_CEILING synthetic_worst_worst_tokenuri_gas ",
                vm.toString(tokenUriGas)
            )
        );
        console2.log("GAS_STRESS_CEILING synthetic_worst_worst_color_runs_per_row 64");
    }

    function _measureRenderGas(uint256 tokenId) internal returns (uint256) {
        uint256 gasBefore = gasleft();
        renderer.renderImageShell(tokenId);
        return gasBefore - gasleft();
    }

    function _measureTokenURIGas(uint256 tokenId) internal returns (uint256) {
        uint256 gasBefore = gasleft();
        renderer.tokenURI(tokenId);
        return gasBefore - gasleft();
    }

    function _measureFixtureLine(string memory line, uint256 seedStart, uint256 seedEnd)
        internal
        returns (uint256 seed, uint256 tokenId, uint256 renderGas, uint256 tokenUriGas, bool ok)
    {
        string memory pixelsHex;
        string memory traitsHex;
        (tokenId, pixelsHex, traitsHex) = _parseCsvLine(line);
        if (tokenId == 0) return (0, 0, 0, 0, false);
        seed = tokenId >= 90_000 ? tokenId - 90_000 : tokenId;
        if (seed < seedStart || seed > seedEnd) return (0, 0, 0, 0, false);

        bytes memory pixels = vm.parseBytes(pixelsHex);
        bytes memory traits = vm.parseBytes(traitsHex);
        writer.write(storageContract, tokenId, pixels, traits);
        renderGas = _measureRenderGas(tokenId);
        tokenUriGas = _measureTokenURIGas(tokenId);
        ok = true;
    }

    function _parseCsvLine(string memory line)
        internal
        returns (uint256 tokenId, string memory pixelsHex, string memory traitsHex)
    {
        bytes memory raw = bytes(line);
        uint256 p0 = _indexOfByte(raw, bytes1(","), 0);
        uint256 p1 = _indexOfByte(raw, bytes1(","), p0 + 1);
        require(p0 != type(uint256).max && p1 != type(uint256).max, "bad csv");
        tokenId = vm.parseUint(string(_slice(raw, 0, p0)));
        pixelsHex = _trimCarriageReturn(string(_slice(raw, p0 + 1, p1)));
        traitsHex = _trimCarriageReturn(string(_slice(raw, p1 + 1, raw.length)));
    }

    function _startsWith(string memory value, string memory prefix) private pure returns (bool) {
        bytes memory v = bytes(value);
        bytes memory p = bytes(prefix);
        if (p.length > v.length) return false;
        for (uint256 i = 0; i < p.length; ++i) {
            if (v[i] != p[i]) return false;
        }
        return true;
    }

    function _trimCarriageReturn(string memory value) private pure returns (string memory) {
        bytes memory raw = bytes(value);
        if (raw.length > 0 && raw[raw.length - 1] == bytes1("\r")) {
            bytes memory out = new bytes(raw.length - 1);
            for (uint256 i = 0; i < out.length; ++i) out[i] = raw[i];
            return string(out);
        }
        return value;
    }

    function _indexOfByte(bytes memory data, bytes1 needle, uint256 from) private pure returns (uint256) {
        for (uint256 i = from; i < data.length; ++i) {
            if (data[i] == needle) return i;
        }
        return type(uint256).max;
    }

    function _slice(bytes memory data, uint256 start, uint256 end) private pure returns (bytes memory) {
        bytes memory out = new bytes(end - start);
        for (uint256 i = 0; i < out.length; ++i) out[i] = data[start + i];
        return out;
    }

    function _setPixel(bytes memory packedPixels, uint256 x, uint256 y, uint8 value) internal pure {
        uint256 flatIndex = y * 64 + x;
        uint256 byteIndex = flatIndex >> 1;
        uint8 current = uint8(packedPixels[byteIndex]);
        if ((flatIndex & 1) == 0) {
            packedPixels[byteIndex] = bytes1((current & 0x0f) | (value << 4));
        } else {
            packedPixels[byteIndex] = bytes1((current & 0xf0) | value);
        }
    }
}
