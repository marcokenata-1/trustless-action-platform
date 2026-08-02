// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReputation} from "./interfaces/IReputation.sol";

/// @title Reputation
/// @author Trustless Collective-Action Platform — Reputation module
/// @notice Non-transferable, on-chain reputation. Reputation is bound to an account and cannot be
///         transferred, so it acts as a persistent, Sybil-resistant credibility signal (a fresh
///         address starts with only the small initial grant and must earn the rest through verified
///         attendance).
///
///         Responsibilities ("Reputation contract"):
///           1. Initial grant     — every registered participant receives a small starting balance.
///           2. Attendance reward  — verified attendance increases a participant's reputation.
///           3. Reputation data    — exposes balances and aggregate stats.
///
/// @dev The movement-creation threshold ("dynamic threshold") is computed OFF-CHAIN and pushed to
///      `Movement.setCreateRequirement` by that off-chain service (which is Movement's
///      `requirementUpdater`). This contract is the reputation source of truth that the service
///      reads from — via `balanceOf`, `averageReputation`, and `getReputationStats`.
///
///      Integration:
///      - `balanceOf`        is read by the Movement contract (create gate) and by the off-chain
///                           threshold service.
///      - `rewardAttendance` is called by the AttendanceVerifier once attendance is proven; it is
///                           restricted to the configured verifier address.
contract Reputation is IReputation, Ownable {
    // --------------------------------------------------------------------- //
    //                             Configuration                             //
    // --------------------------------------------------------------------- //

    /// @notice Reputation granted to an account the first time it is registered.
    uint256 public initialGrant;

    /// @notice Reputation added to a participant for each verified attendance.
    uint256 public attendanceReward;

    /// @notice Address of the AttendanceVerifier permitted to call {rewardAttendance}.
    address public attendanceVerifier;

    // --------------------------------------------------------------------- //
    //                            Reputation state                           //
    // --------------------------------------------------------------------- //

    mapping(address account => uint256 balance) private _balances;

    /// @notice Whether an account has been registered (and received its initial grant).
    mapping(address account => bool registered) public isRegistered;

    /// @notice Idempotency guard: whether a (movementId, participant) pair has been rewarded.
    mapping(uint256 movementId => mapping(address participant => bool rewarded))
        public attendanceRewarded;

    /// @notice Sum of all reputation balances (exposed for the off-chain threshold service).
    uint256 public totalReputation;

    /// @notice Number of registered accounts (exposed for the off-chain threshold service).
    uint256 public userCount;

    // --------------------------------------------------------------------- //
    //                                 Events                                //
    // --------------------------------------------------------------------- //

    event Registered(address indexed account, uint256 initialGrant);
    event AttendanceRewarded(
        address indexed participant,
        uint256 indexed movementId,
        uint256 amount,
        uint256 newBalance
    );
    event AttendanceVerifierUpdated(address indexed previous, address indexed current);
    event InitialGrantUpdated(uint256 previous, uint256 current);
    event AttendanceRewardUpdated(uint256 previous, uint256 current);

    // --------------------------------------------------------------------- //
    //                                 Errors                                //
    // --------------------------------------------------------------------- //

    error ZeroAddress();
    error AlreadyRegistered(address account);
    error NotAttendanceVerifier(address caller);
    error AttendanceAlreadyRewarded(uint256 movementId, address participant);

    // --------------------------------------------------------------------- //
    //                               Modifiers                               //
    // --------------------------------------------------------------------- //

    modifier onlyAttendanceVerifier() {
        if (msg.sender != attendanceVerifier) revert NotAttendanceVerifier(msg.sender);
        _;
    }

    // --------------------------------------------------------------------- //
    //                              Constructor                              //
    // --------------------------------------------------------------------- //

    /// @param initialGrant_     Starting reputation granted on registration.
    /// @param attendanceReward_ Reputation added per verified attendance.
    constructor(uint256 initialGrant_, uint256 attendanceReward_) Ownable(msg.sender) {
        initialGrant = initialGrant_;
        attendanceReward = attendanceReward_;
    }

    // --------------------------------------------------------------------- //
    //                          Reputation lifecycle                         //
    // --------------------------------------------------------------------- //

    /// @notice Register the caller and grant the initial reputation (once per account).
    function register() external {
        if (isRegistered[msg.sender]) revert AlreadyRegistered(msg.sender);
        _register(msg.sender);
    }

    /// @notice Current (non-transferable) reputation balance of `user`.
    function balanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }

    /// @notice Credit `participant` with reputation for verified attendance at `movementId`.
    /// @dev Restricted to the AttendanceVerifier and idempotent per (movementId, participant).
    ///      Auto-registers a first-time participant so that (a) verified attendance never fails
    ///      for an unregistered user and (b) `totalReputation`/`userCount` stay consistent.
    function rewardAttendance(address participant, uint256 movementId)
        external
        onlyAttendanceVerifier
    {
        if (attendanceRewarded[movementId][participant]) {
            revert AttendanceAlreadyRewarded(movementId, participant);
        }

        if (!isRegistered[participant]) {
            _register(participant);
        }

        attendanceRewarded[movementId][participant] = true;

        uint256 reward = attendanceReward;
        _balances[participant] += reward;
        totalReputation += reward;

        emit AttendanceRewarded(participant, movementId, reward, _balances[participant]);
    }

    // --------------------------------------------------------------------- //
    //                        Reputation data (read API)                     //
    // --------------------------------------------------------------------- //

    /// @notice Average reputation across all registered accounts (0 if none).
    /// @dev Read by the off-chain service that computes the movement-creation threshold.
    function averageReputation() public view returns (uint256) {
        if (userCount == 0) return 0;
        return totalReputation / userCount;
    }

    /// @notice Aggregate reputation statistics, convenient for the off-chain service / indexer / UI.
    function getReputationStats()
        external
        view
        returns (uint256 total, uint256 users, uint256 average)
    {
        return (totalReputation, userCount, averageReputation());
    }

    // --------------------------------------------------------------------- //
    //                            Admin (Ownable)                            //
    // --------------------------------------------------------------------- //

    /// @notice Set the AttendanceVerifier allowed to call {rewardAttendance}.
    function setAttendanceVerifier(address verifier) external onlyOwner {
        if (verifier == address(0)) revert ZeroAddress();
        emit AttendanceVerifierUpdated(attendanceVerifier, verifier);
        attendanceVerifier = verifier;
    }

    /// @notice Update the initial registration grant.
    function setInitialGrant(uint256 newInitialGrant) external onlyOwner {
        emit InitialGrantUpdated(initialGrant, newInitialGrant);
        initialGrant = newInitialGrant;
    }

    /// @notice Update the per-attendance reward.
    function setAttendanceReward(uint256 newAttendanceReward) external onlyOwner {
        emit AttendanceRewardUpdated(attendanceReward, newAttendanceReward);
        attendanceReward = newAttendanceReward;
    }

    // --------------------------------------------------------------------- //
    //                               Internal                                //
    // --------------------------------------------------------------------- //

    /// @dev Registers `account`, credits the initial grant, and updates aggregate stats.
    ///      Callers MUST ensure `account` is not already registered.
    function _register(address account) private {
        isRegistered[account] = true;
        userCount += 1;

        uint256 grant = initialGrant;
        if (grant > 0) {
            _balances[account] += grant;
            totalReputation += grant;
        }

        emit Registered(account, grant);
    }
}
