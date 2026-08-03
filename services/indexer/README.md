# Attendance indexer

Polls `AttendanceVerified` from `AttendanceVerifier`, stores events in SQLite,
and exposes read-only HTTP APIs for local demos / UI.

## Layout

```text
services/indexer/
  server.ts      # process entry + polling
  app.ts         # Express routes
  config.ts      # env loading
  listener/      # block-range sync
  runtime/       # RPC + event decoding
  store/         # SQLite persistence
  schema/        # query validation
```

HTTP helpers live in `shared/http.ts`.

## Configuration

```text
RPC_URL=http://127.0.0.1:8545
ATTENDANCE_VERIFIER_ADDRESS=0x...
INDEXER_PORT=3002
INDEXER_DB_PATH=services/indexer/data/attendance.sqlite
INDEXER_START_BLOCK=0
INDEXER_POLL_INTERVAL_MS=2000
```

Copy `.env.example` to `.env` and set the verifier address from Ignition.

## Run

```shell
# after hardhat node + ignition deploy
node --import tsx --env-file=services/indexer/.env services/indexer/server.ts
# or
npm run indexer
```

## API

- `GET /health`
- `POST /sync` — manual sync endpoint. There is an automated sync via polling job.
- `GET /sync/status`
- `GET /attendance?movementId=1&participant=0x...`. Both Query Params are optional

The chain remains the source of truth; this service is a query cache to offload computation from on-chain.
