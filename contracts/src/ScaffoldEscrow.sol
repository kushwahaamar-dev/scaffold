// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ScaffoldEscrow
/// @notice Score-scaled streaming USDC escrow for verified work, on Base.
/// @dev    Mirrors the Anchor reference implementation: per-checkpoint
///         basis-points progress, score-scaled forward-only release, deadline
///         + quality-threshold finalize. Permissionless finalize means anyone
///         can crank — outcome is fully determined by on-chain state.
contract ScaffoldEscrow {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_CHECKPOINTS = 16;
    uint16 public constant BPS_DENOM = 10_000;

    struct Job {
        address buyer;
        address worker;
        address arbiter;
        IERC20 token; // USDC on Base
        uint256 budget;
        uint256 workerPaid;
        uint256 buyerRefunded;
        uint64 deadline; // unix seconds
        uint16 qualityThresholdBps;
        uint8 checkpointCount;
        bool deposited;
        bool paused;
        bool finalized;
        bytes32 specHash; // SHA-256 of the off-chain spec JSON
        uint16[MAX_CHECKPOINTS] weights; // sum to 10_000
        uint16[MAX_CHECKPOINTS] bpsReleasedPerCp;
        uint16 totalProgressBps;
    }

    /// @dev Job id is keccak256(buyer, nonce). Buyer-scoped nonces are managed
    ///      off-chain by the agent; one buyer can run many jobs in parallel.
    mapping(bytes32 => Job) private _jobs;

    event JobInitialized(
        bytes32 indexed jobId,
        address indexed buyer,
        address indexed worker,
        address arbiter,
        uint256 budget,
        uint64 deadline,
        uint16 qualityThresholdBps,
        bytes32 specHash
    );
    event Deposited(bytes32 indexed jobId, uint256 amount);
    event ReleaseStreamed(
        bytes32 indexed jobId,
        uint8 indexed checkpoint,
        uint16 fromBps,
        uint16 toBps,
        uint256 amount
    );
    event Paused(bytes32 indexed jobId, bool paused);
    event Refunded(bytes32 indexed jobId, uint256 amount);
    event Finalized(bytes32 indexed jobId, bool paidWorker, uint256 surplus);

    error JobAlreadyExists();
    error UnknownJob();
    error BadCheckpointCount();
    error BadThreshold();
    error WeightsMustSumTo10000();
    error AlreadyDeposited();
    error NotFunded();
    error PausedJob();
    error FinalizedJob();
    error NotArbiter();
    error NoForwardProgress();
    error BadCheckpointIndex();
    error NotRefundable();
    error DeadlineNotReached();
    error ZeroBudget();
    error BadToken();

    function jobIdFor(address buyer, uint256 nonce) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(buyer, nonce));
    }

    function initialize(
        uint256 nonce,
        address worker,
        address arbiter,
        IERC20 token,
        uint256 budget,
        uint64 deadline,
        uint16 qualityThresholdBps,
        uint8 checkpointCount,
        uint16[MAX_CHECKPOINTS] calldata weights,
        bytes32 specHash
    ) external returns (bytes32 jobId) {
        if (budget == 0) revert ZeroBudget();
        if (checkpointCount == 0 || checkpointCount > MAX_CHECKPOINTS) revert BadCheckpointCount();
        if (qualityThresholdBps > BPS_DENOM) revert BadThreshold();

        uint32 sum;
        for (uint256 i = 0; i < checkpointCount; ++i) {
            sum += uint32(weights[i]);
        }
        if (sum != BPS_DENOM) revert WeightsMustSumTo10000();

        jobId = jobIdFor(msg.sender, nonce);
        Job storage j = _jobs[jobId];
        if (j.buyer != address(0)) revert JobAlreadyExists();

        j.buyer = msg.sender;
        j.worker = worker;
        j.arbiter = arbiter;
        j.token = token;
        j.budget = budget;
        j.deadline = deadline;
        j.qualityThresholdBps = qualityThresholdBps;
        j.checkpointCount = checkpointCount;
        j.specHash = specHash;
        for (uint256 i = 0; i < checkpointCount; ++i) {
            j.weights[i] = weights[i];
        }

        emit JobInitialized(jobId, msg.sender, worker, arbiter, budget, deadline, qualityThresholdBps, specHash);
    }

    /// @notice Buyer calls after `initialize` to fund the escrow with USDC.
    /// @dev    Buyer must have approved this contract for `budget` USDC.
    function deposit(bytes32 jobId) external {
        Job storage j = _mustJob(jobId);
        if (j.deposited) revert AlreadyDeposited();
        if (j.finalized) revert FinalizedJob();
        if (msg.sender != j.buyer) revert NotArbiter(); // reuse error: signer check

        uint256 beforeBalance = j.token.balanceOf(address(this));
        j.deposited = true;
        j.token.safeTransferFrom(msg.sender, address(this), j.budget);
        if (j.token.balanceOf(address(this)) - beforeBalance != j.budget) revert BadToken();
        emit Deposited(jobId, j.budget);
    }

    /// @notice Arbiter posts a score for a checkpoint; releases the delta.
    function releaseStreamed(bytes32 jobId, uint8 checkpointIndex, uint16 scoreBps) external {
        Job storage j = _mustJob(jobId);
        if (msg.sender != j.arbiter) revert NotArbiter();
        if (!j.deposited) revert NotFunded();
        if (j.finalized) revert FinalizedJob();
        if (j.paused) revert PausedJob();
        if (checkpointIndex >= j.checkpointCount) revert BadCheckpointIndex();

        uint16 weight = j.weights[checkpointIndex];
        uint16 already = j.bpsReleasedPerCp[checkpointIndex];
        uint16 target = scoreBps > weight ? weight : scoreBps;
        if (target <= already) revert NoForwardProgress();

        uint16 deltaBps = target - already;
        j.bpsReleasedPerCp[checkpointIndex] = target;
        j.totalProgressBps += deltaBps;
        uint256 earnedToDate = (j.budget * j.totalProgressBps) / BPS_DENOM;
        uint256 amount = earnedToDate - j.workerPaid;
        j.workerPaid = earnedToDate;
        j.token.safeTransfer(j.worker, amount);

        emit ReleaseStreamed(jobId, checkpointIndex, already, target, amount);
    }

    function setPause(bytes32 jobId, bool paused) external {
        Job storage j = _mustJob(jobId);
        if (msg.sender != j.arbiter) revert NotArbiter();
        if (j.finalized) revert FinalizedJob();
        j.paused = paused;
        emit Paused(jobId, paused);
    }

    /// @notice Buyer withdraws vault remainder if paused or past deadline.
    function refundBuyer(bytes32 jobId) external {
        Job storage j = _mustJob(jobId);
        if (msg.sender != j.buyer) revert NotArbiter();
        if (!j.deposited) revert NotFunded();
        if (j.finalized) revert FinalizedJob();
        if (!j.paused && block.timestamp < j.deadline) revert NotRefundable();

        uint256 amount = j.budget - j.workerPaid - j.buyerRefunded;
        j.finalized = true;
        j.paused = true;
        if (amount > 0) {
            j.buyerRefunded = amount;
            j.token.safeTransfer(j.buyer, amount);
            emit Refunded(jobId, amount);
        }
    }

    /// @notice Anyone can crank. Outcome is fully determined by on-chain state.
    function finalizeJob(bytes32 jobId) external {
        Job storage j = _mustJob(jobId);
        if (!j.deposited) revert NotFunded();
        if (j.finalized) revert FinalizedJob();

        uint16 totalBps = j.totalProgressBps;
        bool fullyScored = totalBps == BPS_DENOM;
        if (!fullyScored && block.timestamp < j.deadline) revert DeadlineNotReached();

        bool paysWorker = totalBps >= j.qualityThresholdBps;

        uint256 surplus = j.budget - j.workerPaid - j.buyerRefunded;
        j.finalized = true;
        if (surplus > 0) {
            address dest = paysWorker ? j.worker : j.buyer;
            if (paysWorker) j.workerPaid += surplus;
            else j.buyerRefunded += surplus;
            j.token.safeTransfer(dest, surplus);
        }
        emit Finalized(jobId, paysWorker, surplus);
    }

    // ─── views ────────────────────────────────────────────────────────────

    function getJob(bytes32 jobId)
        external
        view
        returns (
            address buyer,
            address worker,
            address arbiter,
            address token,
            uint256 budget,
            uint256 workerPaid,
            uint256 buyerRefunded,
            uint64 deadline,
            uint16 qualityThresholdBps,
            uint8 checkpointCount,
            bool deposited,
            bool paused,
            bool finalized,
            bytes32 specHash
        )
    {
        Job storage j = _jobs[jobId];
        if (j.buyer == address(0)) revert UnknownJob();
        return (
            j.buyer,
            j.worker,
            j.arbiter,
            address(j.token),
            j.budget,
            j.workerPaid,
            j.buyerRefunded,
            j.deadline,
            j.qualityThresholdBps,
            j.checkpointCount,
            j.deposited,
            j.paused,
            j.finalized,
            j.specHash
        );
    }

    function getCheckpointProgress(bytes32 jobId, uint8 idx) external view returns (uint16 weight, uint16 releasedBps) {
        Job storage j = _jobs[jobId];
        if (j.buyer == address(0)) revert UnknownJob();
        if (idx >= j.checkpointCount) revert BadCheckpointIndex();
        return (j.weights[idx], j.bpsReleasedPerCp[idx]);
    }

    function _mustJob(bytes32 jobId) private view returns (Job storage j) {
        j = _jobs[jobId];
        if (j.buyer == address(0)) revert UnknownJob();
    }
}
