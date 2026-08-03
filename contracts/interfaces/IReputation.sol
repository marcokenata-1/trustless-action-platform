// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

/// @title IReputation
/// @notice Canonical interface for the Reputation contract.
/// @dev Consumed by Movement (`balanceOf`, to gate movement creation) and by
///      AttendanceVerifier (`rewardAttendance`, after verifying attendance).
interface IReputation {
  /// @notice Current (non-transferable) reputation balance of `user`.
  function balanceOf(address user) external view returns (uint256);

  /// @notice Credit `participant` with reputation for verified attendance at `movementId`.
  /// @dev Restricted to the authorised AttendanceVerifier; idempotent per (movementId, participant).
  function rewardAttendance(
    address participant,
    uint256 movementId
  ) external;
}
