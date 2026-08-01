// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {IMovement} from "../interfaces/IMovement.sol";
// Test-only stand-in for the team's movement contract.
// EXTENDED (by the Reputation work) with `setCreateRequirement` + a recorder, so the
// Reputation.syncCreateRequirement test can assert the pushed value while the real Movement
// contract is not yet on main. The isActive/isCommitted behaviour is unchanged.
contract MovementMock is IMovement {
  mapping(uint256 movementId => bool active) private _active;
  mapping(uint256 movementId => mapping(address participant => bool committed))
    private _committed;

  uint256 public lastCreateRequirement;
  bool public createRequirementCalled;

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

  // Mirrors Movement.setCreateRequirement so Reputation's dynamic-threshold push can be verified.
  function setCreateRequirement(uint256 newRequirement) external {
    lastCreateRequirement = newRequirement;
    createRequirementCalled = true;
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
