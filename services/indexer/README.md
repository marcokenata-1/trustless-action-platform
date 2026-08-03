# Indexer

Polls events from `AttendanceVerifier`, `Movement`, and `Reputation`, stores them
in SQLite, and exposes read-only HTTP APIs for local demos / UI.

## Layout

```text
services/indexer/
  server.ts      # process entry + polling
  app.ts         # Express routes
  config.ts      # env loading
  listener/      # block-range sync (isolated streams via Promise.allSettled)
  runtime/       # RPC + event decoding
  store/         # SQLite persistence
  schema/        # query validation
```

HTTP helpers live in `shared/http.ts`.

## Configuration

```text
RPC_URL=http://127.0.0.1:8545
ATTENDANCE_VERIFIER_ADDRESS=0x...
MOVEMENT_ADDRESS=0x...
REPUTATION_ADDRESS=0x...
INDEXER_PORT=3002
INDEXER_DB_PATH=services/indexer/data/indexer.sqlite
INDEXER_START_BLOCK=0
INDEXER_POLL_INTERVAL_MS=2000
```

Copy `.env.example` to `.env` and set all three contract addresses from Ignition.

## Run

```shell
# after hardhat node + ignition deploy
node --import tsx --env-file=services/indexer/.env services/indexer/server.ts
# or
npm run indexer
```

## API

- `GET /health`
- `POST /sync` — `{ attendance, movement, reputation }`; each stream is isolated (`error` may be set on a stream)
- `GET /sync/status`
- `GET /attendance?movementId=1&participant=0x...` — `movementId` required
- `GET /movements` / `GET /movements/:id` / `GET /movements/:id/commits`
- `GET /movement-events?movementId=`
- `GET /create-requirement-updates`
- `GET /reputation-events?eventType=&participant=&movementId=`

### Indexed events

| Contract | Events |
|----------|--------|
| AttendanceVerifier | `AttendanceVerified` |
| Movement | `MovementCreated`, `Committed`, `MovementActivated`, `MovementCancelled`, `CreateRequirementUpdated` |
| Reputation | `Registered`, `AttendanceRewarded`, `AttendanceVerifierUpdated`, `InitialGrantUpdated`, `AttendanceRewardUpdated` |

The chain remains the source of truth; this service is a query cache.
