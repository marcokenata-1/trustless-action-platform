// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IMovement} from "../interfaces/IMovement.sol";

// Test-only stand-in for the team's movement contract.
contract MovementMock is IMovement {
  mapping(uint256 movementId => bool active) private _active;
  mapping(uint256 movementId => mapping(address participant => bool committed))
    private _committed;

  function setActive(uint256 movementId, bool active) external {
    _active[movementId] = active;
  }

  function setCommitted(
    uint256 movementId,
    address participant,
    bool committed
  ) external {
    _committed[movementId][participant] = committed;
  }

  function isActive(uint256 movementId) external view returns (bool) {
    return _active[movementId];
  }

  function isCommitted(
    uint256 movementId,
    address participant
  ) external view returns (bool) {
    return _committed[movementId][participant];
  }
}
