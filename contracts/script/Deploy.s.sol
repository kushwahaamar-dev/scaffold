// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ScaffoldEscrow} from "../src/ScaffoldEscrow.sol";

/// @notice Deploys ScaffoldEscrow on Base. The contract is stateless w.r.t.
///         token choice — pass the USDC address as a constructor arg to your
///         agents. Base mainnet USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
///         Base sepolia USDC:        0x036CbD53842c5426634e7929541eC2318f3dCF7e
contract Deploy is Script {
    function run() external returns (ScaffoldEscrow esc) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);
        esc = new ScaffoldEscrow();
        vm.stopBroadcast();
        console.log("ScaffoldEscrow deployed at:", address(esc));
    }
}
