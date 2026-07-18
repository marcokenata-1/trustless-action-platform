# Project setup commands

## Install

npm install

## Compile contracts

npm run compile

## Typecheck / tests

npm run typecheck
npm test

## Running local

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
