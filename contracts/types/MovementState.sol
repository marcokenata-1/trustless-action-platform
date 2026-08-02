// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
  Shared movement lifecycle. Enum order must stay in sync with the movement contract.
  Pending  -> Active when commitment threshold is reached
  Pending  -> Cancelled when the deadline passes below threshold
  Active   -> Finalized when attendance processing closes
  Cancelled and Finalized are terminal. Attendance proofs only accepted while Active.
*/
enum MovementState {
  Pending,
  Active,
  Cancelled,
  Finalized
}
