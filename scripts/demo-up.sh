#!/usr/bin/env bash
# One command for the whole local demo: fresh hardhat node, deploy, sync
set -e

cd "$(dirname "$0")/.."

HARDHAT_PID=""
INDEXER_PID=""
SIMULATOR_PID=""
FRONTEND_PID=""

CLEANED_UP=""
cleanup() {
  [ -n "$CLEANED_UP" ] && return
  CLEANED_UP=1
  echo ""
  echo "Shutting everything down..."
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  [ -n "$SIMULATOR_PID" ] && kill "$SIMULATOR_PID" 2>/dev/null
  [ -n "$INDEXER_PID" ] && kill "$INDEXER_PID" 2>/dev/null
  [ -n "$HARDHAT_PID" ] && kill "$HARDHAT_PID" 2>/dev/null
  docker rm -f blockchain-container 2>/dev/null
  exit 0
}
trap cleanup INT TERM EXIT

echo "Freeing ports 8545 (hardhat), 3001 (simulator), 3002 (indexer) if in use..."
lsof -ti :8545,:3001,:3002 | xargs kill -9 2>/dev/null || true

echo "Starting hardhat node..."
npx hardhat node &
HARDHAT_PID=$!

echo "Waiting for hardhat node..."
until curl -s -X POST http://127.0.0.1:8545 \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  > /dev/null 2>&1; do
  sleep 0.5
done
echo "Hardhat node ready."
echo

echo "Clearing Ignition deployment cache..."
rm -rf ignition/deployments/chain-31337

echo "Deploying Attendance module..."
npx hardhat ignition deploy ignition/modules/Attendance.ts --network localhost --reset
echo

echo "Syncing addresses into frontend/indexer .env files..."
npx tsx scripts/sync-addresses.ts
echo

echo "Clearing indexer and simulator DBs (fresh chain, old data is stale)..."
rm -f services/indexer/data/indexer.sqlite services/indexer/data/indexer.sqlite-shm services/indexer/data/indexer.sqlite-wal
rm -f services/simulator/data/handshakes.sqlite services/simulator/data/handshakes.sqlite-shm services/simulator/data/handshakes.sqlite-wal
echo

echo "Building and starting backend (dynamic create-threshold API)..."
docker rm -f blockchain-container > /dev/null 2>&1
docker build -t trustless-action-platform-api backend/trustless-action-platform > /dev/null
docker run -d --name blockchain-container -p 8003:8000 \
  --env-file backend/trustless-action-platform/.env \
  trustless-action-platform-api > /dev/null
echo "backend ready on :8003."
echo

echo "Starting indexer..."
node --import tsx --env-file=services/indexer/.env services/indexer/server.ts &
INDEXER_PID=$!

echo "Starting simulator..."
node --import tsx --env-file=services/simulator/.env services/simulator/server.ts &
SIMULATOR_PID=$!

echo "Starting frontend..."
(cd frontend/trustless-action-platform && npm run dev) &
FRONTEND_PID=$!

echo
echo "All services up"
echo "NOTE: hardhat node was reset — in MetaMask, Settings > Advanced > Clear activity tab data (or delete/re-add the localhost network) or logins/txs will fail with nonce/network errors."

wait
