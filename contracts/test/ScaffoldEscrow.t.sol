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
        return _initNonce(1, budget, deadline, threshold);
    }

    function _initNonce(uint256 nonce, uint256 budget, uint64 deadline, uint16 threshold) internal returns (bytes32 jobId) {
        vm.startPrank(buyer);
        usdc.approve(address(esc), type(uint256).max);
        jobId = esc.initialize(nonce, worker, arbiter, IERC20(address(usdc)), budget, deadline, threshold, 9, weights, specHash);
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
        (, , , , , uint256 workerPaid, uint256 buyerRefunded, , , , , , bool finalized, ) = esc.getJob(jobId);
        assertEq(workerPaid, 0);
        assertEq(buyerRefunded, 100e6);
        assertTrue(finalized);
    }

    function testRefundedJobCannotResumeOrSpendAnotherJobsCollateral() public {
        bytes32 refundedJob = _initNonce(1, 100e6, uint64(block.timestamp + 1 days), 8000);
        bytes32 fundedJob = _initNonce(2, 100e6, uint64(block.timestamp + 1 days), 8000);

        vm.prank(arbiter);
        esc.setPause(refundedJob, true);
        vm.prank(buyer);
        esc.refundBuyer(refundedJob);
        assertEq(usdc.balanceOf(address(esc)), 100e6, "other job remains funded");

        vm.startPrank(arbiter);
        vm.expectRevert(ScaffoldEscrow.FinalizedJob.selector);
        esc.setPause(refundedJob, false);
        vm.expectRevert(ScaffoldEscrow.FinalizedJob.selector);
        esc.releaseStreamed(refundedJob, 0, weights[0]);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(esc)), 100e6);
        assertTrue(fundedJob != refundedJob);
    }

    function testRepeatedRefundAndFinalizeCannotPayTwice() public {
        bytes32 jobId = _init(100e6, uint64(block.timestamp + 1 days), 8000);
        vm.prank(arbiter);
        esc.setPause(jobId, true);
        vm.prank(buyer);
        esc.refundBuyer(jobId);
        vm.expectRevert(ScaffoldEscrow.FinalizedJob.selector);
        vm.prank(buyer);
        esc.refundBuyer(jobId);
        vm.expectRevert(ScaffoldEscrow.FinalizedJob.selector);
        esc.finalizeJob(jobId);
    }

    function testReleaseRoundingDoesNotDependOnUpdatePath() public {
        bytes32 oneStep = _initNonce(1, 101, uint64(block.timestamp + 1 days), 8000);
        bytes32 manySteps = _initNonce(2, 101, uint64(block.timestamp + 1 days), 8000);
        vm.startPrank(arbiter);
        esc.releaseStreamed(oneStep, 0, 1000);
        for (uint16 bps = 100; bps <= 1000; bps += 100) {
            esc.releaseStreamed(manySteps, 0, bps);
        }
        vm.stopPrank();
        (, , , , , uint256 onePaid, , , , , , , , ) = esc.getJob(oneStep);
        (, , , , , uint256 manyPaid, , , , , , , , ) = esc.getJob(manySteps);
        assertEq(onePaid, 10);
        assertEq(manyPaid, onePaid);
    }

    function testDeadlineBoundaryAllowsRefund() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        bytes32 jobId = _init(100e6, deadline, 8000);
        vm.warp(deadline);
        vm.prank(buyer);
        esc.refundBuyer(jobId);
    }

    function testFuzzOutflowNeverExceedsBudget(uint16 first, uint16 second) public {
        first = uint16(bound(first, 1, weights[0]));
        second = uint16(bound(second, first, weights[0]));
        bytes32 jobId = _init(100e6, uint64(block.timestamp + 1 days), 8000);
        vm.startPrank(arbiter);
        esc.releaseStreamed(jobId, 0, first);
        if (second > first) esc.releaseStreamed(jobId, 0, second);
        esc.setPause(jobId, true);
        vm.stopPrank();
        vm.prank(buyer);
        esc.refundBuyer(jobId);
        (, , , , uint256 budget, uint256 workerPaid, uint256 buyerRefunded, , , , , , , ) = esc.getJob(jobId);
        assertEq(workerPaid + buyerRefunded, budget);
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
