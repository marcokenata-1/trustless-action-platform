// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {IReputation} from "../interfaces/IReputation.sol";

// Patched to keep it compiling after IReputation was finalised with `balanceOf`.
// (Temporary per contracts/mocks/README — retire once tests use the real Reputation.)
contract ReputationMock is IReputation {
  mapping(address participant => uint256 rewards) public attendanceRewards;
  mapping(uint256 movementId => mapping(address participant => bool rewarded))
    public rewardedForMovement;
  mapping(address user => uint256 balance) private _balances;

  event AttendanceRewarded(
    uint256 indexed movementId,
    address indexed participant
  );

  // Test setter (matches the setX convention used by MovementMock).
  function setBalance(address user, uint256 amount) external {
    _balances[user] = amount;
  }

  function balanceOf(address user) external view returns (uint256) {
    return _balances[user];
  }

  function rewardAttendance(
    address participant,
    uint256 movementId
  ) external {
    attendanceRewards[participant] += 1;
    rewardedForMovement[movementId][participant] = true;
    emit AttendanceRewarded(movementId, participant);
  }
}
