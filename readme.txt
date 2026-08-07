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
  - Python 3 + pip (for the FastAPI backend, runs directly via uvicorn — no Docker needed)
  - A Unix-like shell (macOS / Linux / WSL)
  - MetaMask (or similar) for the frontend wallet demo

Free local ports:
  - 8545  Hardhat node
  - 3001  Simulator API
  - 3002  Indexer API
  - 5173  Frontend (Vite)
  - 8003  Backend API (uvicorn, run directly)

Main libraries (repo root npm install):
  - hardhat, ethers, @openzeppelin/contracts
  - express, better-sqlite3, tsx, typescript

Frontend (separate npm install under frontend/trustless-action-platform):
  - react, vite, wagmi, viem, @tanstack/react-query

Backend (repo root: pip install -r backend/trustless-action-platform/requirements.txt):
  - fastapi, uvicorn, web3, sqlalchemy, psycopg, ...


2. Install
----------

From the repo root:

  npm install
  npm run compile

  cd frontend/trustless-action-platform
  npm install
  cp .env.example .env
  cd ../..

  pip install -r backend/trustless-action-platform/requirements.txt

Get your own Pinata JWT (used for uploading movement title/description/images
to IPFS) from https://app.pinata.cloud/ (API Keys), then set VITE_PINATA_JWT
in frontend/trustless-action-platform/.env to it.


3. One-command local demo (recommended)
---------------------------------------

Make sure ports 8545, 3001, 3002, 5173, and 8003 are free. Then:

  npm run demo:up

This starts a fresh Hardhat node, funds the backend keeper's dedicated wallet,
deploys the Attendance Ignition module, syncs contract addresses into .env
files, clears local SQLite DBs, then starts the backend (uvicorn), indexer,
simulator, and frontend.


If Hardhat fails with:
  Failed to parse build info: missing field contracts

Run once, then retry the demo:

  npx hardhat clean && npx hardhat compile


4. Tests
--------
  npm run typecheck
  npm test

Test will run on top of local deployed contracts, covering:
- `unit tests` for helper function used for signing and handshake in `test/attendance.ts`
- `smart contract test` for component `test/AttendanceVerifier.ts`, `Movement.ts`, `Reputation.ts`
- `e2e test` from simulator side `handshakeSimulator.ts`