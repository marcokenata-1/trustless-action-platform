// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

interface IMovement {
  function isActive(uint256 movementId) external view returns (bool);

  function isCommitted(
    uint256 movementId,
    address participant
  ) external view returns (bool);
}
