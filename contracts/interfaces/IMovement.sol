// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// TODO: Yet to be finalized with Jack
/*
  Movement lifecycle (see MovementState):
  Pending -> Active (threshold reached)
  Pending -> Cancelled (deadline passed below threshold)
  Active -> Finalized (attendance processing closed)
  isActive is true only while the movement is Active.
*/
interface IMovement {
  function isActive(uint256 movementId) external view returns (bool);

  function isCommitted(
    uint256 movementId,
    address participant
  ) external view returns (bool);
}
