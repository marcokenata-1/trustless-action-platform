#!/usr/bin/env bash
# One command for the whole local demo: fresh hardhat node, deploy, sync
set -e

cd "$(dirname "$0")/.."

HARDHAT_PID=""
BACKEND_PID=""
INDEXER_PID=""
SIMULATOR_PID=""
FRONTEND_PID=""

CLEANED_UP=""
cleanup() {
  [ -n "$CLEANED_UP" ] && return
  CLEANED_UP=1
  # best-effort teardown: set -e is active for the whole script and applies
  # here too — without this, the first kill/rm that hits an already-dead
  # target (nonzero exit) aborts cleanup on the spot, skipping every line
  # after it (docker rm -f included)
  set +e
  echo ""
  echo "Shutting everything down..."
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  [ -n "$SIMULATOR_PID" ] && kill "$SIMULATOR_PID" 2>/dev/null
  [ -n "$INDEXER_PID" ] && kill "$INDEXER_PID" 2>/dev/null
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  # kill by port, not $HARDHAT_PID — that PID is the npx wrapper, not the
  # actual hardhat node process underneath it, so a plain kill leaves the
  # real node process (and port 8545) alive
  lsof -ti :8545 | xargs kill -9 2>/dev/null
  lsof -ti :8003 | xargs kill -9 2>/dev/null
  exit 0
}
trap cleanup INT TERM EXIT

echo "Freeing ports 8545 (hardhat), 3001 (simulator), 3002 (indexer), 8003 (backend) if in use..."
lsof -t -i :8545 -i :3001 -i :3002 -i :8003 | xargs kill -9 2>/dev/null || true

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

echo "Funding keeper wallet (0x6d4F6d958a8D6E7D503c2242798208Ca20451127)..."
curl -s -X POST http://127.0.0.1:8545 \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_sendTransaction","params":[{"from":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","to":"0x6d4F6d958a8D6E7D503c2242798208Ca20451127","value":"0x8AC7230489E80000"}],"id":1}' \
  > /dev/null
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

echo "Starting backend (dynamic create-threshold API)..."
(cd backend/trustless-action-platform && python3 -m uvicorn main:app --host 127.0.0.1 --port 8003) &
BACKEND_PID=$!

echo "Waiting for backend..."
until curl -s http://127.0.0.1:8003/docs > /dev/null 2>&1; do
  sleep 0.5
done
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
