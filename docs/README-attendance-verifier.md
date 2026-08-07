# AttendanceVerifier contract

On-chain **attendance claim verifier**. A participant who already committed to
an **activated** movement submits peer-signed handshake proofs (EIP-712) plus
their own attendance signature. If checks pass, the contract marks attendance
verified and asks Reputation to credit the attendance reward.

- **Solidity:** `^0.8.35`
- **Depends on:** OpenZeppelin `EIP712` + `ECDSA`; `IMovement`; `IReputation`
- **EIP-712 domain:** name `TrustlessActionAttendance`, version `1`

## Role in the system

```
Simulator / UI ──1. collect peer handshakes + participant attendance sig──▶ client
Caller ──────────2. submitAttendance(id, participant, proofs, sig)──────▶ AttendanceVerifier
AttendanceVerifier ─3. isActive / isCommitted (read)──────────────────▶ Movement
AttendanceVerifier ─4. rewardAttendance(participant, id)──────────────▶ Reputation
Indexer ─────────5. AttendanceVerified (event)────────────────────────▶ off-chain DB / UI
```

- Verifies attendance only. It does **not** create movements or manage commits.
- Requires the movement to be **Activated** and the participant (and each peer)
  to have **committed**.
- Is the only address Reputation should trust for `rewardAttendance` (set via
  `Reputation.setAttendanceVerifier` after deploy).

## Claim rules

On each successful `submitAttendance`:

1. Movement is active; participant committed; not already verified for this id.
2. `proofs.length >= requiredPeerCount` (constructor sets this; minimum **3**).
3. Peers are unique, non-zero, not the participant, and **sorted ascending** by
   address.
4. Each peer has committed to the same movement.
5. Each peer EIP-712 `Handshake` signature recovers to that peer.
6. No handshake digest was already consumed (`verifiedHandshakeDigests`).
7. Participant EIP-712 `Attendance` signature recovers to `participant`
   (covers `movementId`, `participant`, `requiredPeerCount`, `proofsHash`).

Then: mark attendance + handshake digests used, call
`reputation.rewardAttendance`, emit `AttendanceVerified`.

Anyone may submit the calldata; validity comes from the signatures, not `msg.sender`.

## EIP-712 types

```
Handshake(uint256 movementId,address participant,address peer,bytes32 nonce,uint64 timestamp)
Attendance(uint256 movementId,address participant,uint256 requiredPeerCount,bytes32 proofsHash)
```

`proofsHash = keccak256(abi.encode(handshakeDigests))` where each digest is the
EIP-712 hash of one `Handshake` struct.

## Public API

### Submit
| Function | Access | Description |
|---|---|---|
| `submitAttendance(movementId, participant, proofs, participantSignature)` | anyone with valid signatures | Verifies peer + participant signatures, records attendance, rewards reputation, emits `AttendanceVerified`. Once per `(movementId, participant)`. |

### Read API
| Function / constant | Description |
|---|---|
| `attendanceVerified(movementId, participant) → bool` | Whether that participant already verified for the movement. |
| `verifiedHandshakeDigests(digest) → bool` | Whether a handshake digest was consumed. |
| `movement`, `reputation`, `requiredPeerCount` | Immutable dependencies / config. |
| `MIN_REQUIRED_PEER_COUNT` | Hard floor (`3`) for constructor `peerCount`. |
| `HANDSHAKE_TYPEHASH`, `ATTENDANCE_TYPEHASH` | EIP-712 typehashes. |

### Struct: `HandshakeProof`
| Field | Meaning |
|---|---|
| `peer` | Peer who signed the handshake. |
| `nonce` | Unique value chosen for this handshake. |
| `timestamp` | Client-supplied timestamp (not checked against `block.timestamp`). |
| `peerSignature` | Peer's EIP-712 signature over `Handshake`. |

## Events

| Event | Emitted when |
|---|---|
| `AttendanceVerified(movementId, participant, proofsHash, proofCount, peers)` | A claim is accepted. Indexer / UI use this for attendance history and graphs. |

## Errors

| Error | Meaning |
|---|---|
| `ZeroAddress()` | Constructor got a zero movement or reputation address. |
| `InvalidRequiredPeerCount(provided)` | Constructor `peerCount` &lt; `MIN_REQUIRED_PEER_COUNT`. |
| `MovementNotActive(movementId)` | Movement is not `Activated`. |
| `ParticipantNotCommitted(movementId, participant)` | Participant never committed. |
| `AttendanceAlreadyVerified(movementId, participant)` | Replay of the same attendance claim. |
| `NotEnoughProofs(required, provided)` | Fewer peer proofs than quorum. |
| `InvalidPeer(peer)` | Peer is zero or equals the participant. |
| `ProofsNotSorted()` | Peers not strictly ascending by address. |
| `PeerNotCommitted(movementId, peer)` | Peer did not commit to the movement. |
| `InvalidPeerSignature(expected, recovered)` | Peer signature does not recover to `peer`. |
| `HandshakeAlreadyVerified(handshakeDigest)` | Handshake digest already used. |
| `InvalidParticipantSignature(expected, recovered)` | Attendance signature does not recover to `participant`. |

## Access control & trust

- **No owner.** Config is immutable after construction.
- **Movement** is trusted for activation and commit status.
- **Reputation** is trusted to apply the reward; wire
  `setAttendanceVerifier(this)` so only this contract can call
  `rewardAttendance`.
- Handshake digests are globally unique once used (not only per movement).

## Configuration

Constructor:
`constructor(address movementAddress, address reputationAddress, uint256 peerCount)`

| Parameter | Meaning | Default in our config |
|---|---|---|
| `movementAddress` | Movement contract | from `MovementModule` |
| `reputationAddress` | Reputation contract | from `MovementModule` / `ReputationModule` |
| `peerCount` | Quorum of distinct peer proofs | `3` in `ignition/modules/Attendance.ts` |

## Deployment & wiring

```bash
npx hardhat ignition deploy ignition/modules/Attendance.ts --network <network>
```

`Attendance.ts` deploys `AttendanceVerifier(movement, reputation, 3)` and calls
`reputation.setAttendanceVerifier(verifier)`.

Shared helpers for building/signing claims live under `shared/` (see
`test/AttendanceVerifier.ts` and the simulator service).

## Build & test

```bash
npx hardhat compile
npx hardhat test        # includes test/AttendanceVerifier.ts
```

`test/AttendanceVerifier.ts` covers happy-path quorum (+ extra proofs), inactive
movement, missing commits, too few proofs, unsorted / self / bad signatures,
replay protection, and constructor validation.

## Files

| Path | Purpose |
|---|---|
| `contracts/AttendanceVerifier.sol` | The contract. |
| `contracts/interfaces/IMovement.sol` | Movement reads used here. |
| `contracts/interfaces/IReputation.sol` | `rewardAttendance` after verify. |
| `ignition/modules/Attendance.ts` | Deploy + wire verifier. |
| `test/AttendanceVerifier.ts` | Unit tests. |
| `test/helpers/deployAttendanceContracts.ts` | Shared test deploy helper. |
| `shared/` | EIP-712 / proof helpers used by tests and services. |
