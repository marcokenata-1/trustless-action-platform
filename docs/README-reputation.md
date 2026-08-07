# Reputation contract

On-chain **source of truth for each account's reputation** in the Trustless Collective-Action
Platform. A fresh account starts with a small initial grant, earns more through verified attendance,
and reputation is **non-transferable** (bound to the account) — so it acts as a persistent,
Sybil-resistant credibility signal. The contract also exposes aggregate stats that the off-chain
threshold service reads to compute the movement-creation requirement.

- **Solidity:** `^0.8.28`
- **Depends on:** OpenZeppelin `Ownable` (v5)
- **Interface:** implements `IReputation` (`balanceOf`, `rewardAttendance`)

## Role in the system

```
Deployer/Owner ──1. deploy(grant, reward)──▶ Reputation
Owner ─────────2. setAttendanceVerifier(v)─▶ Reputation
Participant ───3. register() (+ grant)─────▶ Reputation
AttendanceVerifier ─4. rewardAttendance(p,id) (+ reward)─▶ Reputation
Off-chain threshold service ─5. getReputationStats() (read)─▶ Reputation
```

- The **Attendance Verifier contract** is the only caller allowed to reward attendance
  (`rewardAttendance`). Reputation trusts a single verified caller and does no attestation
  verification itself.
- The **off-chain threshold service** reads `getReputationStats()` / `balanceOf()` to compute the
  dynamic movement-creation threshold off-chain. The threshold is **not** computed on-chain.
- The **Movement contract** reads `balanceOf()` as its create gate.

## Public API

### Reputation lifecycle
| Function | Access | Description |
|---|---|---|
| `register()` | anyone | Registers the caller and credits the initial grant (once per account). |
| `balanceOf(address user) → uint256` | view | Current non-transferable reputation of `user`. |
| `rewardAttendance(address participant, uint256 movementId)` | Attendance Verifier only | Credits the attendance reward. Idempotent per `(movementId, participant)`; auto-registers a first-time participant. |

### Read API (for the off-chain service / indexer / UI)
| Function | Description |
|---|---|
| `averageReputation() → uint256` | Total reputation ÷ user count (0 if none). |
| `getReputationStats() → (total, users, average)` | All three aggregates in one call. |
| `totalReputation`, `userCount`, `isRegistered(addr)`, `attendanceRewarded(id, addr)` | Public state getters. |

### Admin (owner only)
| Function | Description |
|---|---|
| `setAttendanceVerifier(address verifier)` | Sets/updates the Attendance Verifier (rejects `0x0`). |
| `setInitialGrant(uint256 v)` | Updates the initial grant for future registrations. |
| `setAttendanceReward(uint256 v)` | Updates the per-attendance reward. |

## Events

| Event | Emitted when |
|---|---|
| `Registered(account, initialGrant)` | An account registers (directly or via auto-register). |
| `AttendanceRewarded(participant, movementId, amount, newBalance)` | Attendance is credited. |
| `AttendanceVerifierUpdated(previous, current)` | Owner changes the verifier. |
| `InitialGrantUpdated(previous, current)` | Owner changes the initial grant. |
| `AttendanceRewardUpdated(previous, current)` | Owner changes the attendance reward. |

See [`docs/reputation-events.md`](docs/reputation-events.md) for which component consumes each event.

## Errors

| Error | Meaning |
|---|---|
| `ZeroAddress()` | Attempted to set an address to `0x0`. |
| `AlreadyRegistered(account)` | Account has already registered. |
| `NotAttendanceVerifier(caller)` | A non-verifier called `rewardAttendance`. |
| `AttendanceAlreadyRewarded(movementId, participant)` | This attendance was already rewarded. |

## Access control & trust

- **Owner** (deployer, via `Ownable`): configures the verifier address and the grant/reward amounts.
- **Attendance Verifier**: the sole address permitted to call `rewardAttendance`. Set it after
  deployment with `setAttendanceVerifier`.
- Reputation is **non-transferable** — there is no transfer/approve path; balances only change
  through registration and verified attendance.

## Configuration

Constructor: `constructor(uint256 initialGrant_, uint256 attendanceReward_)`

| Parameter | Meaning | Default in our config |
|---|---|---|
| `initialGrant` | Reputation granted on first registration | `100` |
| `attendanceReward` | Reputation added per verified attendance | `50` |

Both are set at deployment and adjustable later by the owner. The current values
(`initialGrant = 100`, `attendanceReward = 50`) come from `ignition/params.json` and
`test/Reputation.ts` — they are example config, not fixed constants.

## Deployment & wiring

Deploy with the Hardhat Ignition module:

```bash
npx hardhat ignition deploy ignition/modules/Reputation.ts \
  --network <network> --parameters ignition/params.json
```

Then wire the verifier (done automatically by `Platform.ts` in the full-system deploy):

```solidity
reputation.setAttendanceVerifier(attendanceVerifierAddress);
```

Note: the off-chain threshold service is **Movement's** `requirementUpdater`, not this contract —
Reputation does not need to know about Movement.

## Build & test

```bash
npx hardhat compile
npx hardhat test        # runs test/Reputation.ts (+ the rest of the suite)
```

`test/Reputation.ts` covers registration and the initial grant, double-register rejection,
verifier-only enforcement, reward crediting + auto-register, idempotency, the aggregate stats, the
owner-only setters, and zero-address rejection.

## Files

| Path | Purpose |
|---|---|
| `contracts/Reputation.sol` | The contract. |
| `contracts/interfaces/IReputation.sol` | Canonical interface (`balanceOf`, `rewardAttendance`). |
| `ignition/modules/Reputation.ts` | Deployment module. |
| `test/Reputation.ts` | Unit tests. |
| `docs/reputation-events.md` | Event → consumer reference.|
