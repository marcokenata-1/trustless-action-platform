Trustless Action Platform — COMP6452
====================================

This project shows trustless attendance for on-chain movements.
Smart contracts (Hardhat) verify peer-signed handshakes. A local
simulator builds proofs and submits them. An indexer reads events
into SQLite. A React frontend and FastAPI backend support the demo UI.


1. Dependencies
---------------

Required:
  - Node.js 22+ (LTS recommended)
  - npm (comes with Node.js)
  - Docker (for the FastAPI backend container)
  - A Unix-like shell (macOS / Linux / WSL)
  - MetaMask (or similar) for the frontend wallet demo

Free local ports:
  - 8545  Hardhat node
  - 3001  Simulator API
  - 3002  Indexer API
  - 5173  Frontend (Vite)
  - 8003  Backend API (Docker maps 8003 -> 8000)

Main libraries (repo root npm install):
  - hardhat, ethers, @openzeppelin/contracts
  - express, better-sqlite3, tsx, typescript

Frontend (separate npm install under frontend/trustless-action-platform):
  - react, vite, wagmi, viem, @tanstack/react-query

Backend (installed inside Docker image from requirements.txt):
  - fastapi, uvicorn, web3, sqlalchemy, psycopg, ...


2. Install
----------

From the repo root:

  npm install
  npm run compile

  cd frontend/trustless-action-platform
  npm install
  cd ../..

Ensure Docker is running before the one-command demo.


3. One-command local demo (recommended)
---------------------------------------

Make sure ports 8545, 3001, 3002, 5173, and 8003 are free. Then:

  npm run demo:up

This starts a fresh Hardhat node, deploys the Attendance Ignition module,
syncs contract addresses into .env files, clears local SQLite DBs, builds
and starts the backend container, then starts indexer, simulator, and
frontend. Ctrl+C shuts everything down together.

After a chain reset, clear MetaMask localhost activity (Settings >
Advanced > Clear activity tab data), or logins/txs may fail with nonce
errors.

If Hardhat fails with:
  Failed to parse build info: missing field contracts

Run once, then retry the demo:

  npx hardhat clean && npx hardhat compile


4. Manual run (step by step)
----------------------------

Terminal 1 — local chain:

  npx hardhat node

Terminal 2 — deploy contracts:

  npx hardhat ignition deploy ignition/modules/Attendance.ts --network localhost

Sync addresses into frontend / indexer / simulator .env files:

  npm run sync-addresses

Terminal 3 — simulator:

  cp services/simulator/.env.example services/simulator/.env
  # ATTENDANCE_VERIFIER_ADDRESS is set by sync-addresses after deploy
  node --import tsx --env-file=services/simulator/.env services/simulator/server.ts

Terminal 4 — indexer:

  cp services/indexer/.env.example services/indexer/.env
  # MOVEMENT_ADDRESS, REPUTATION_ADDRESS, ATTENDANCE_VERIFIER_ADDRESS
  # are set by sync-addresses after deploy
  node --import tsx --env-file=services/indexer/.env services/indexer/server.ts

Terminal 5 — backend (Docker):

  docker build -t trustless-action-platform-api backend/trustless-action-platform
  docker run --rm --name blockchain-container -p 8003:8000 \
    --env-file backend/trustless-action-platform/.env \
    trustless-action-platform-api

  # Or without Docker:
  #   cd backend/trustless-action-platform
  #   pip install -r requirements.txt
  #   ./run_app.sh

Terminal 6 — frontend:

  cd frontend/trustless-action-platform
  npm run dev

Example simulator / indexer flow (replace payloads as needed):

  curl -s http://127.0.0.1:3001/health

  curl -s http://127.0.0.1:3001/simulate/handshake \
    -H 'content-type: application/json' \
    -d '{"movementId":"1","partyA":"0x70997970c51812dc3a010c7d01b50e0d17dc79c8","partyB":"0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"}'

  curl -s http://127.0.0.1:3001/simulate/attest -H 'content-type: application/json' -d '{...}'
  curl -s http://127.0.0.1:3001/submit -H 'content-type: application/json' -d '{...}'

  curl -s 'http://127.0.0.1:3002/attendance?movementId=1'
  curl -s 'http://127.0.0.1:3002/movements/1'
  curl -s 'http://127.0.0.1:3002/reputation-events?movementId=1'


5. Tests
--------
  npm run typecheck
  npm test

Test will run on top of local deployed contracts, covering:
- `unit tests` for helper function used for signing and handshake in `test/attendance.ts`
- `smart contract test` for component `test/AttendanceVerifier.ts`, `Movement.ts`, `Reputation.ts`
- `e2e test` from simulator side `handshakeSimulator.ts`