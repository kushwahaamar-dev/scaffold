// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ScaffoldEscrow} from "../src/ScaffoldEscrow.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

contract ScaffoldEscrowTest is Test {
    ScaffoldEscrow esc;
    MockUSDC usdc;
    address buyer   = address(0xB1);
    address worker  = address(0xB2);
    address arbiter = address(0xB3);
    bytes32 specHash = keccak256("spec");

    uint16[16] weights;

    function setUp() public {
        esc = new ScaffoldEscrow();
        usdc = new MockUSDC();
        usdc.mint(buyer, 1_000e6);
        weights[0] = 1000; weights[1] = 800; weights[2] = 800; weights[3] = 600;
        weights[4] = 2167; weights[5] = 633; weights[6] = 1000; weights[7] = 500;
        weights[8] = 2500;
    }

    function _init(uint256 budget, uint64 deadline, uint16 threshold) internal returns (bytes32 jobId) {
        vm.startPrank(buyer);
        usdc.approve(address(esc), type(uint256).max);
        jobId = esc.initialize(1, worker, arbiter, IERC20(address(usdc)), budget, deadline, threshold, 9, weights, specHash);
        esc.deposit(jobId);
        vm.stopPrank();
    }

    function testHappyPath() public {
        bytes32 jobId = _init(100e6, uint64(block.timestamp + 1 days), 8000);
        vm.startPrank(arbiter);
        for (uint8 i = 0; i < 9; ++i) {
            esc.releaseStreamed(jobId, i, weights[i]);
        }
        vm.stopPrank();
        assertEq(usdc.balanceOf(worker), 100e6, "worker should have full budget");
    }

    function testForwardProgressOnly() public {
        bytes32 jobId = _init(100e6, uint64(block.timestamp + 1 days), 8000);
        vm.startPrank(arbiter);
        esc.releaseStreamed(jobId, 0, 500);
        vm.expectRevert(ScaffoldEscrow.NoForwardProgress.selector);
        esc.releaseStreamed(jobId, 0, 500);
        esc.releaseStreamed(jobId, 0, 1000);
        vm.stopPrank();
    }

    function testStreamingPartialCredit() public {
        bytes32 jobId = _init(100e6, uint64(block.timestamp + 1 days), 8000);
        vm.startPrank(arbiter);
        esc.releaseStreamed(jobId, 0, 500); // 5%
        esc.releaseStreamed(jobId, 0, 1000); // remaining 5%
        vm.stopPrank();
        // weight[0] = 1000bps = 10% of budget = 10 USDC
        assertEq(usdc.balanceOf(worker), 10e6);
    }

    function testFinalizeBelowThresholdRefundsBuyer() public {
        bytes32 jobId = _init(100e6, uint64(block.timestamp + 1 days), 8000);
        vm.startPrank(arbiter);
        esc.releaseStreamed(jobId, 0, weights[0]); // 10%
        vm.stopPrank();
        // jump past deadline
        vm.warp(block.timestamp + 2 days);
        esc.finalizeJob(jobId);
        assertEq(usdc.balanceOf(worker), 10e6);
        assertEq(usdc.balanceOf(buyer), 1_000e6 - 100e6 + 90e6);
    }

    function testFinalizeAboveThresholdPaysWorkerSurplus() public {
        // weights[0..7] sum to 7500 bps; threshold 7000 → over threshold.
        bytes32 jobId = _init(100e6, uint64(block.timestamp + 1 days), 7000);
        vm.startPrank(arbiter);
        for (uint8 i = 0; i < 8; ++i) esc.releaseStreamed(jobId, i, weights[i]);
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days);
        esc.finalizeJob(jobId);
        assertEq(usdc.balanceOf(worker), 100e6, "worker collects surplus over threshold");
    }

    function testRefundOnPause() public {
        bytes32 jobId = _init(100e6, uint64(block.timestamp + 1 days), 8000);
        vm.prank(arbiter);
        esc.setPause(jobId, true);
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        esc.refundBuyer(jobId);
        assertEq(usdc.balanceOf(buyer) - before, 100e6);
    }

    function testWeightsMustSumTo10000() public {
        weights[8] = 0;
        vm.startPrank(buyer);
        usdc.approve(address(esc), type(uint256).max);
        vm.expectRevert(ScaffoldEscrow.WeightsMustSumTo10000.selector);
        esc.initialize(1, worker, arbiter, IERC20(address(usdc)), 100e6, uint64(block.timestamp + 1 days), 8000, 9, weights, specHash);
        vm.stopPrank();
    }

    function testNonArbiterCannotRelease() public {
        bytes32 jobId = _init(100e6, uint64(block.timestamp + 1 days), 8000);
        vm.expectRevert(ScaffoldEscrow.NotArbiter.selector);
        esc.releaseStreamed(jobId, 0, 1000);
    }
}
