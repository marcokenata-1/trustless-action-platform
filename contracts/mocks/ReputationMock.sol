// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IReputation} from "../interfaces/IReputation.sol";

contract ReputationMock is IReputation {
  mapping(address participant => uint256 rewards) public attendanceRewards;
  mapping(uint256 movementId => mapping(address participant => bool rewarded))
    public rewardedForMovement;

  event AttendanceRewarded(
    uint256 indexed movementId,
    address indexed participant
  );

  function rewardAttendance(
    address participant,
    uint256 movementId
  ) external {
    attendanceRewards[participant] += 1;
    rewardedForMovement[movementId][participant] = true;

    emit AttendanceRewarded(movementId, participant);
  }
}
