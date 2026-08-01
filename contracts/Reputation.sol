// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReputation} from "./interfaces/IReputation.sol";

/// @notice Minimal view of the Movement contract, used only to push the dynamic create
///         requirement. Kept local (not imported) so this contract has no hard dependency on
///         the Movement source; the Movement address is wired in after deployment.
interface IMovementRequirement {
    function setCreateRequirement(uint256 newRequirement) external;
}

/// @title Reputation
/// @author Trustless Collective-Action Platform — Reputation module
/// @notice Non-transferable, on-chain reputation.
///         Reputation is bound to an account and cannot be transferred, so it acts as a
///         persistent, Sybil-resistant credibility signal (a fresh address starts with only
///         the small initial grant and must earn the rest through verified attendance).
///
///         Responsibilities ("Reputation contract"):
///           1. Initial grant     — every registered participant receives a small starting balance.
///           2. Attendance reward  — verified attendance increases a participant's reputation.
///           3. Dynamic thresholds — the movement-creation requirement tracks the overall
///                                    reputation distribution so it stays meaningful over time.
///
/// @dev Integration:
///      - `balanceOf`         is read by the Movement contract to gate `createMovement`.
///      - `rewardAttendance`  is called by the AttendanceVerifier once attendance is proven; it is
///                            restricted to the configured verifier address.
///      - `syncCreateRequirement` pushes the computed requirement to Movement; for this to succeed
///                            the Movement contract must have been deployed with its
///                            `requirementUpdater` set to this contract's address, and this
///                            contract's `movement` address must be wired via `setMovement`.
contract Reputation is IReputation, Ownable {
    // --------------------------------------------------------------------- //
    //                               Constants                               //
    // --------------------------------------------------------------------- //

    /// @notice Basis-points denominator (10_000 bps == 1.0x).
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // --------------------------------------------------------------------- //
    //                             Configuration                             //
    // --------------------------------------------------------------------- //

    /// @notice Reputation granted to an account the first time it is registered.
    uint256 public initialGrant;

    /// @notice Reputation added to a participant for each verified attendance.
    uint256 public attendanceReward;

    /// @notice Multiplier (in bps) applied to the average reputation to derive the dynamic
    ///         movement-creation requirement. 30_000 bps == 3x the network average.
    uint256 public thresholdMultiplierBps;

    /// @notice Address of the AttendanceVerifier permitted to call {rewardAttendance}.
    address public attendanceVerifier;

    /// @notice Movement contract that receives the dynamic create requirement.
    IMovementRequirement public movement;

    // --------------------------------------------------------------------- //
    //                            Reputation state                           //
    // --------------------------------------------------------------------- //

    mapping(address account => uint256 balance) private _balances;

    /// @notice Whether an account has been registered (and received its initial grant).
    mapping(address account => bool registered) public isRegistered;

    /// @notice Idempotency guard: whether a (movementId, participant) pair has been rewarded.
    mapping(uint256 movementId => mapping(address participant => bool rewarded))
        public attendanceRewarded;

    /// @notice Sum of all reputation balances (used for the dynamic threshold).
    uint256 public totalReputation;

    /// @notice Number of registered accounts (used for the dynamic threshold).
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
    event CreateRequirementSynced(
        uint256 newRequirement,
        uint256 averageReputation,
        uint256 userCount
    );
    event AttendanceVerifierUpdated(address indexed previous, address indexed current);
    event MovementUpdated(address indexed previous, address indexed current);
    event InitialGrantUpdated(uint256 previous, uint256 current);
    event AttendanceRewardUpdated(uint256 previous, uint256 current);
    event ThresholdMultiplierUpdated(uint256 previous, uint256 current);

    // --------------------------------------------------------------------- //
    //                                 Errors                                //
    // --------------------------------------------------------------------- //

    error ZeroAddress();
    error AlreadyRegistered(address account);
    error NotAttendanceVerifier(address caller);
    error AttendanceAlreadyRewarded(uint256 movementId, address participant);
    error MovementNotSet();

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

    /// @param initialGrant_          Starting reputation granted on registration.
    /// @param attendanceReward_      Reputation added per verified attendance.
    /// @param thresholdMultiplierBps_ Multiplier (bps) applied to average reputation for the
    ///                               dynamic create requirement (e.g. 30_000 == 3x).
    constructor(
        uint256 initialGrant_,
        uint256 attendanceReward_,
        uint256 thresholdMultiplierBps_
    ) Ownable(msg.sender) {
        initialGrant = initialGrant_;
        attendanceReward = attendanceReward_;
        thresholdMultiplierBps = thresholdMultiplierBps_;
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

    /// @inheritdoc IReputation
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
    //                            Dynamic thresholds                         //
    // --------------------------------------------------------------------- //

    /// @notice Average reputation across all registered accounts (0 if none).
    function averageReputation() public view returns (uint256) {
        if (userCount == 0) return 0;
        return totalReputation / userCount;
    }

    /// @notice The create requirement recommended by the current reputation distribution.
    /// @dev `average * thresholdMultiplierBps / 10_000`. Deterministic from on-chain state.
    function recommendedCreateRequirement() public view returns (uint256) {
        return (averageReputation() * thresholdMultiplierBps) / BPS_DENOMINATOR;
    }

    /// @notice Push the recommended create requirement to the Movement contract.
    /// @dev Permissionless: anyone may trigger the sync, but the value is computed deterministically
    ///      from on-chain reputation state, so the caller cannot influence it. Requires the Movement
    ///      address to be wired ({setMovement}) and this contract to be Movement's `requirementUpdater`.
    /// @return newRequirement The value pushed to Movement.
    function syncCreateRequirement() external returns (uint256 newRequirement) {
        if (address(movement) == address(0)) revert MovementNotSet();
        newRequirement = recommendedCreateRequirement();
        movement.setCreateRequirement(newRequirement);
        emit CreateRequirementSynced(newRequirement, averageReputation(), userCount);
    }

    // --------------------------------------------------------------------- //
    //                                 Views                                 //
    // --------------------------------------------------------------------- //

    /// @notice Aggregate reputation statistics, convenient for an off-chain indexer/UI.
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

    /// @notice Set the Movement contract that receives the dynamic create requirement.
    function setMovement(address movementAddress) external onlyOwner {
        if (movementAddress == address(0)) revert ZeroAddress();
        emit MovementUpdated(address(movement), movementAddress);
        movement = IMovementRequirement(movementAddress);
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

    /// @notice Update the dynamic-threshold multiplier (bps).
    function setThresholdMultiplierBps(uint256 newMultiplierBps) external onlyOwner {
        emit ThresholdMultiplierUpdated(thresholdMultiplierBps, newMultiplierBps);
        thresholdMultiplierBps = newMultiplierBps;
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
