#!/usr/bin/env bash
# One command for the whole local demo: fresh hardhat node, deploy, sync
set -e

cd "$(dirname "$0")/.."

HARDHAT_PID=""
INDEXER_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  echo "Shutting everything down..."
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  [ -n "$INDEXER_PID" ] && kill "$INDEXER_PID" 2>/dev/null
  [ -n "$HARDHAT_PID" ] && kill "$HARDHAT_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

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

echo "Deploying Attendance module..."
npx hardhat ignition deploy ignition/modules/Attendance.ts --network localhost --reset
echo

echo "Syncing addresses into frontend/indexer .env files..."
npx tsx scripts/sync-addresses.ts
echo

echo "Starting indexer..."
node --import tsx --env-file=services/indexer/.env services/indexer/server.ts &
INDEXER_PID=$!

echo "Starting frontend..."
(cd frontend/trustless-action-platform && npm run dev) &
FRONTEND_PID=$!

echo
echo "All services up"

wait
