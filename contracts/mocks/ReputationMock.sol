// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

// We only need the IReputation *interface*, not the whole Movement contract.
// Solidity lets you import just a specific named symbol from a file, even
// though IReputation is declared at file-scope inside Movement.sol alongside
// the actual contract.
import {IReputation} from "../Movement.sol";

/// @notice A fully-controllable stand-in for the real Reputation contract.
/// @dev Movement's unit tests use this instead of the real Reputation.sol so
///      they stay isolated and fast - we can set any balance for any address
///      directly, without needing register()/rewardAttendance() flows at all.
///      Matches the project's `contracts/mocks/` convention (see MovementMock.sol).
contract ReputationMock is IReputation {
    mapping(address => uint256) private _balances;

    /// @notice Test-only helper: directly set an address's reputation balance.
    /// @dev Not part of IReputation - only exists so tests can control state.
    function setBalance(address account, uint256 balance) external {
        _balances[account] = balance;
    }

    /// @notice Satisfies IReputation. Movement calls this exactly the same way
    ///         it would call the real Reputation contract.
    function balanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }
}
