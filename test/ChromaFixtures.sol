// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ChromaPaletteData} from "../contracts/generated/ChromaPaletteData.sol";
import {ChromaRenderer} from "../contracts/ChromaRenderer.sol";
import {ChromaStorage} from "../contracts/ChromaStorage.sol";

library ChromaFixtures {
    function deployPaletteData() internal returns (ChromaPaletteData) {
        return new ChromaPaletteData();
    }

    function deployRenderer(ChromaStorage storageContract, address owner)
        internal
        returns (ChromaRenderer renderer, ChromaPaletteData paletteData)
    {
        paletteData = deployPaletteData();
        renderer = new ChromaRenderer(address(storageContract), address(paletteData), owner);
    }

    function deployRendererOnly(ChromaStorage storageContract, address owner) internal returns (ChromaRenderer renderer) {
        (renderer,) = deployRenderer(storageContract, owner);
    }
}
