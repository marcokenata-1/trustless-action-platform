# Reputation Contract — Events & Consumers

This document lists every event emitted by `contracts/Reputation.sol` and which component is
expected to consume it. It's a reference for the off-chain services and the frontend/indexer so
everyone agrees on what to subscribe to and why.

All events can be read with `eth_getLogs` (ethers: `contract.queryFilter(...)`) or subscribed to
live over a WebSocket provider. Indexed parameters (`indexed`) are filterable topics.

## Events

| Event | Signature | Emitted when | Consumed by | Why they care |
-|-|-|-|-
| `Registered` | `Registered(address indexed account, uint256 initialGrant)` | An account calls `register()`, **or** is auto-registered on its first `rewardAttendance` | **Off-chain threshold service**, **Indexer/backend** | User count + total reputation changed → recompute the dynamic create-requirement. The indexer uses this as the **canonical list of all users** (see note below). |
| `AttendanceRewarded` | `AttendanceRewarded(address indexed participant, uint256 indexed movementId, uint256 amount, uint256 newBalance)` | `rewardAttendance(...)` credits a participant (called by the AttendanceVerifier) | **Off-chain threshold service**, **Indexer/backend**, **Client apps (via indexer)** | Total/average reputation changed → recompute threshold. Indexer updates the user's balance + attendance history; UI shows the reward and the new balance (`newBalance` is included so consumers don't need a follow-up `balanceOf` call). |
| `AttendanceVerifierUpdated` | `AttendanceVerifierUpdated(address indexed previous, address indexed current)` | Owner calls `setAttendanceVerifier(...)` | **Ops/admin monitoring**, **Deployment tooling** | Security-sensitive: this is the address allowed to mint reputation. Monitor for unexpected changes; deployment scripts use it to confirm wiring. |
| `InitialGrantUpdated` | `InitialGrantUpdated(uint256 previous, uint256 current)` | Owner calls `setInitialGrant(...)` | **Ops/admin monitoring** | Config audit trail; affects reputation projections. Not part of the core runtime flow. |
| `AttendanceRewardUpdated` | `AttendanceRewardUpdated(uint256 previous, uint256 current)` | Owner calls `setAttendanceReward(...)` | **Ops/admin monitoring**, **Off-chain threshold service (optional)** | Config audit trail; the threshold service may note it since it changes future reward projections. |

## Consumers at a glance

- **Off-chain threshold service** (Movement's `requirementUpdater`): listens to `Registered` and
   `AttendanceRewarded`. Whenever total/average reputation moves, it recomputes the movement-creation
   threshold and, if it changed, calls `Movement.setCreateRequirement(...)`. It reads current values
   via `getReputationStats()` / `balanceOf(...)`; the events are the **trigger** to recompute.
- **Indexer / backend**: listens to `Registered` + `AttendanceRewarded` to maintain a queryable
   copy of reputation state (per-user balances, attendance history, leaderboard) for the UI.
- **Client apps (Organiser / Participant)**: normally read from the indexer/backend rather than the
   chain directly; they surface balances, registration status, and reward notifications.
- **Ops/admin monitoring**: watches the three `*Updated` admin events for a config/security audit
   trail.

## Note — enumerating all users

There is no on-chain call that returns every `(address → balance)` pair (Solidity mappings aren't
iterable). The `Registered` event is the **source of truth for the full user set**: index those
logs to get every registered address, then read `balanceOf(addr)` for each (or track balances live
from `Registered` + `AttendanceRewarded`). This is how the off-chain service / indexer builds a
complete reputation snapshot. Aggregates (total, count, average) are available directly via
`getReputationStats()` if the per-user list isn't needed.

## Not events, but read directly

For point-in-time reads (no subscription needed): `balanceOf(address)`, `totalReputation`,
`userCount`, `averageReputation()`, `getReputationStats()`, `isRegistered(address)`,
`attendanceRewarded(movementId, address)`.
