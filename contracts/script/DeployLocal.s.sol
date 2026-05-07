// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ScaffoldEscrow} from "../src/ScaffoldEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

/// @notice Local-only: deploys MockUSDC + ScaffoldEscrow on Anvil and mints
///         100 USDC to the buyer address. Use only with --rpc-url=anvil.
contract DeployLocal is Script {
    function run() external returns (ScaffoldEscrow esc, MockUSDC usdc) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address buyer = vm.envAddress("BUYER_ADDRESS");

        vm.startBroadcast(pk);
        esc = new ScaffoldEscrow();
        usdc = new MockUSDC();
        usdc.mint(buyer, 100 * 1e6);
        vm.stopBroadcast();

        console.log("ScaffoldEscrow:", address(esc));
        console.log("MockUSDC:      ", address(usdc));
        console.log("buyer USDC:    ", usdc.balanceOf(buyer));
    }
}
