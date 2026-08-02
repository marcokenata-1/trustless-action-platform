// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// TODO: finalize with @mamun
interface IReputation {
  function rewardAttendance(
    address participant,
    uint256 movementId
  ) external;
}
