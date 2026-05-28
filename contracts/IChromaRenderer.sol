// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChromaRenderer {
    function tokenURI(uint256 tokenId) external view returns (string memory);
}
