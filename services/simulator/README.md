# Simulator

Local HTTP helper for the attendance demo. Signs mutual EIP-712 handshakes
with Hardhat's unlocked accounts, builds a participant attendance signature,
and submits the claim to `AttendanceVerifier`. Stores handshake sessions in
SQLite so the UI / API can list them.

Not a production wallet — it relies on a local Hardhat node that can sign as
any demo account.

## Layout

```text
services/simulator/
  server.ts      # process entry
  app.ts         # Express routes
  config.ts      # env loading
  handshake/     # mutual handshake signing
  runtime/       # RPC + AttendanceVerifier calls
  store/         # SQLite handshake sessions
  schema/        # request validation
```

HTTP helpers live in `shared/http.ts`. EIP-712 / proof helpers live in
`shared/attendance.ts`.

## Configuration

```text
RPC_URL=http://127.0.0.1:8545
ATTENDANCE_VERIFIER_ADDRESS=0x...
SIMULATOR_PORT=3001
HANDSHAKE_DB_PATH=services/simulator/data/handshakes.sqlite
```

Copy `.env.example` to `.env` and set `ATTENDANCE_VERIFIER_ADDRESS` from
Ignition (or run `npm run sync-addresses` after deploy).

## Run

```shell
# after hardhat node + ignition deploy
node --import tsx --env-file=services/simulator/.env services/simulator/server.ts
# or
npm run simulator
```

## API

- `GET /health`
- `GET /handshakes?movementId=1` — list stored sessions for a movement
- `POST /simulate/handshake` — create (or return existing) mutual handshake session
  - body: `{ movementId, partyA, partyB, timestamp? }`
  - idempotent per `(movementId, partyA, partyB)` (order-normalized)
- `POST /simulate/attest` — verify peer signatures, sort proofs, build + sign `Attendance`
  - body: `{ proofs: HandshakeProof[] }`
  - returns `{ proofs, attendance, participantSignature }`
- `POST /submit` — call `AttendanceVerifier.submitAttendance` on-chain
  - body: `{ proofs: HandshakeProof[], participantSignature }`
  - returns `{ transactionHash, blockNumber, movementId, participant, proofsHash }`

### Typical flow

1. `POST /simulate/handshake` — at least `requiredPeerCount` distinct peers vs the participant
2. Collect that participant's peer proofs from the returned sessions
3. `POST /simulate/attest` with those proofs
4. `POST /submit` with the attest response (`proofs` + `participantSignature`)

The chain remains the source of truth; this service only helps local demos sign
and submit claims.
