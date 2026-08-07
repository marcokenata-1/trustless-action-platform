# Movement contract

On-chain **ledger for collective-action movements**. An organiser creates a
movement (gated by reputation), people commit before a deadline, and the
movement activates once the commit tally hits the organiser's threshold.
An off-chain service can push a dynamic create-requirement; this contract
only stores and enforces it.

- **Solidity:** `^0.8.35`
- **Depends on:** `IReputation.balanceOf` (create gate only)
- **Interface (for AttendanceVerifier):** `IMovement` (`isActive`, `isCommitted`)

## Role in the system

```
Organiser ────────1. createMovement(...)──▶ Movement
Participant ──────2. commit(id)───────────▶ Movement  (may emit MovementActivated)
Anyone ───────────3. resolve(id)──────────▶ Movement  (may cancel after deadline)
requirementUpdater ─4. setCreateRequirement(v)─▶ Movement
AttendanceVerifier ─5. isActive / isCommitted (read)─▶ Movement
```

- **Reputation** gates who can create: `balanceOf(msg.sender) >= createRequirement`.
- **AttendanceVerifier** only reads commit/activation state; it never writes here.
- The **off-chain threshold service** (address stored as `requirementUpdater`) reads
  Reputation stats off-chain and calls `setCreateRequirement` when the create
  bar should change.

## Lifecycle

Statuses: `Open` → `Activated` (tally ≥ threshold) or `Cancelled` (via `resolve`
after deadline while still `Open`).

- Commits stay allowed after activation until the deadline — activation does
  **not** cap participation.
- `resolve` only cancels if status is still `Open` and the deadline block has
  passed. Activated movements are left alone.

Deadline: `deadlineBlock = block.number + deadlineDays * 7200`
(~7200 blocks ≈ 1 day on a 12s block-time L1; treat as a convention).

## Public API

### Movement lifecycle
| Function | Access | Description |
|---|---|---|
| `createMovement(threshold, deadlineDays, cid) → uint256` | anyone with enough reputation | Creates a movement; returns the new `movementId`. Emits `MovementCreated`. |
| `commit(movementId)` | anyone (once per address) | Records a commit if status is `Open` or `Activated`, deadline not passed, and caller has not committed. May emit `MovementActivated` then always emits `Committed`. |
| `resolve(movementId)` | anyone | If still `Open` and past deadline, sets `Cancelled` and emits `MovementCancelled`. Otherwise no-op. |

### Read API
| Function | Description |
|---|---|
| `getMovement(movementId) → MovementData` | Full struct: organiser, threshold, deadlineBlock, ipfsCID, currentTally, status. |
| `getStatus(movementId) → Status` | Current status enum. |
| `isActive(movementId) → bool` | `true` iff status is `Activated`. |
| `isCommitted(movementId, account) → bool` | Whether `account` has committed. |
| `reputation`, `requirementUpdater`, `createRequirement` | Public config / dependency getters. |

### Admin (requirementUpdater only)
| Function | Description |
|---|---|
| `setCreateRequirement(uint256 newRequirement)` | Updates the reputation bar for future `createMovement` calls. Emits `CreateRequirementUpdated`. |

## Events

| Event | Emitted when |
|---|---|
| `MovementCreated(movementId, organiser, threshold, deadlineBlock, cid)` | A movement is created. |
| `Committed(movementId, committer, tally)` | A new commit is recorded. |
| `MovementActivated(movementId)` | Tally first reaches the threshold. |
| `MovementCancelled(movementId)` | `resolve` cancels an open, under-threshold movement past deadline. |
| `CreateRequirementUpdated(oldRequirement, newRequirement)` | The create bar is updated. |

## Errors / reverts

Movement mostly uses bare `revert()` (no custom error names) for failed checks:

| Condition | Where |
|---|---|
| Organiser reputation &lt; `createRequirement` | `createMovement` |
| Status is not `Open`/`Activated` (e.g. Cancelled) | `commit` |
| Caller already committed | `commit` |
| Past `deadlineBlock` | `commit` |
| Caller is not `requirementUpdater` | `setCreateRequirement` (`"unauthorised"`) |

## Access control & trust

- **Anyone** may create (if reputation enough), commit, or call `resolve`.
- **`requirementUpdater`**: sole address that may change `createRequirement`.
  Set at construction; not updatable on-chain today.
- **Reputation** is an immutable dependency (`IReputation`).

Stored `ipfsCID` is opaque to the contract — content lives off-chain (IPFS).

## Configuration

Constructor:
`constructor(address reputationAddress, address requirementUpdaterAddress, uint256 initialCreateRequirement)`

| Parameter | Meaning | Default in our config |
|---|---|---|
| `reputationAddress` | Reputation contract used for the create gate | from `ReputationModule` |
| `requirementUpdaterAddress` | Off-chain threshold service / keeper | `0x6d4F…1127` (Ignition param default) |
| `initialCreateRequirement` | Starting create bar | `0` in `Movement.ts` Ignition params; tests often use `100` |

## Deployment & wiring

Prefer the full Attendance stack (deploys Reputation + Movement + Verifier):

```bash
npx hardhat ignition deploy ignition/modules/Attendance.ts --network <network>
```

Or Movement alone (still pulls Reputation via Ignition composition):

```bash
npx hardhat ignition deploy ignition/modules/Movement.ts --network <network>
```

AttendanceVerifier is wired in `Attendance.ts`, not in `Movement.ts`.

## Build & test

```bash
npx hardhat compile
npx hardhat test        # includes test/Movement.ts
```

`test/Movement.ts` covers create gating, incrementing ids, commit / double-commit /
deadline, activation at threshold, resolve cancel vs activated, and
`setCreateRequirement` authorisation.

## Files

| Path | Purpose |
|---|---|
| `contracts/Movement.sol` | The contract. |
| `contracts/interfaces/IMovement.sol` | Read interface used by AttendanceVerifier. |
| `ignition/modules/Movement.ts` | Deployment module. |
| `test/Movement.ts` | Unit tests. |
