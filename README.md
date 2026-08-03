# Project setup commands

## Install

npm install

## Compile contracts

npm run compile

## Typecheck / tests

npm run typecheck
npm test

## One-command local demo

Requires ports `8545`, `3001`, and `3002` free (stop any existing Hardhat node /
simulator / indexer first):

```shell
npm run demo:e2e
# optional: show Hardhat / simulator / indexer process logs
VERBOSE=1 npm run demo:e2e
# or
npm run demo:e2e -- --verbose
```

This compiles contracts, starts Hardhat node, deploys `AttendanceDemo`, starts
simulator + indexer, runs handshake + attest + submit + index sync, then shuts
everything down.

If `hardhat node` fails with `Failed to parse build info: missing field contracts`,
run `npx hardhat clean && npx hardhat compile` once, then retry.

## Running local (manual)

## Terminal 1 - Run a local blockchain node using hardhat

npx hardhat node

## Terminal 2 — deploy AttendanceVerifier demo module

npx hardhat ignition deploy ignition/modules/AttendanceDemo.ts --network localhost

## Simulator env

cp services/simulator/.env.example services/simulator/.env

Set ATTENDANCE_VERIFIER_ADDRESS to the deployed address from ignition

## Terminal 3 - Run simulator

node --import tsx --env-file=services/simulator/.env services/simulator/server.ts

## Terminal 4 - Simulating handshake by hitting simulator API

1. Simulate handshake by hitting the API. Hit the API 3 times, each times simulate a handshake between A with a different person. So A will be handshake with 3 other ppl.
   curl -s http://127.0.0.1:3001/simulate/handshake -H 'content-type: application/json' -d '{YOUR_PAYLOAD}'

2. Let A perform attest to build his attendance structure after having 3 other ppl handshake with him.
   curl -s http://127.0.0.1:3001/simulate/attest -H 'content-type: application/json' -d '{YOUR_PAYLOAD}'

3. Let A submit his attedance proof.
   curl -s http://127.0.0.1:3001/submit -H 'content-type: application/json' -d '{YOUR_PAYLOAD}'


## Terminal 5 - Run attendance indexer

```shell
cp services/indexer/.env.example services/indexer/.env

# set ATTENDANCE_VERIFIER_ADDRESS from ignition
node --import tsx --env-file=services/indexer/.env services/indexer/server.ts
```

After a successful `/submit`, sync (automatic poll or `POST /sync`) then query:

```shell
curl -s 'http://127.0.0.1:3002/attendance?movementId=1'
```