# Frontend

React + wagmi UI for the Trustless Action Platform. Connects a wallet, reads/writes the on-chain
contracts directly, and pulls list/history data from the indexer instead of querying the chain
for everything. See the [repo root README](../../README.md) for how this fits into the rest of
the system.

## Stack

React 19, Vite, wagmi + viem for chain access, TanStack Query for data fetching/caching (including
the on-chain reads — wagmi's hooks are built on it).

## Structure

```
src/
  App.tsx                    tab routing (Movements / Joined / Create) + the create-requirement keeper poll
  components/
    AppBar.tsx                title bar: wallet connect + reputation badge
    ConnectWallet.tsx          connect/disconnect + a MetaMask button (if installed) and/or a dropdown of Hardhat test accounts (always available)
    ReputationBadge.tsx        shows your reputation + auto-registers a fresh account on first connect
    CreateMovementForm.tsx     create a movement: uploads to IPFS, then calls Movement.createMovement
    MovementList.tsx           list from the indexer, joined/unjoined filter
    MovementDetail.tsx         one movement: commit, status, deadline
    HandshakeGraph.tsx         peer graph for a movement + claim attendance flow
  lib/
    wagmi.ts                   wagmi config (chain, connectors — MetaMask + one mock connector per Hardhat account)
    chains.ts                  the local Hardhat chain definition + the 20 default account addresses
    movementContract.ts        Movement address + ABI
    reputationContract.ts      Reputation address + ABI
    attendanceVerifierContract.ts   AttendanceVerifier address + ABI
    ipfs.ts                    Pinata upload (title/description/images → CID)
    indexer.ts                 indexer fetch helpers
```

Contract addresses in `lib/*Contract.ts` are read from env — `scripts/sync-addresses.ts` (repo
root) rewrites this directory's `.env` after every fresh deploy, so you don't set them by hand.

## Environment

```
VITE_PINATA_JWT=                    # IPFS pinning — get your own from pinata.cloud
VITE_BACKEND_API_URL=http://localhost:8003
VITE_INDEXER_URL=http://localhost:3002
VITE_SIMULATOR_URL=http://localhost:3001
VITE_MOVEMENT_ADDRESS=              # written by scripts/sync-addresses.ts
VITE_ATTENDANCE_VERIFIER_ADDRESS=   # written by scripts/sync-addresses.ts
VITE_REPUTATION_ADDRESS=            # written by scripts/sync-addresses.ts
```

## Running it

Normally you don't run this on its own — `npm run demo:up` from the repo root starts the whole
stack (Hardhat, backend, indexer, simulator, this frontend) together. To run just the frontend
against an already-running stack:

```bash
npm install
npm run dev
```

Needs a Hardhat node + deployed contracts + indexer/simulator/backend already up for anything
beyond the empty shell to work — see the root [`readme.txt`](../../readme.txt).

## Notes

- **Wallet connection**: `wagmi.ts` includes `injected({ target: "metaMask" })` only when
  `window.ethereum` exists (`multiInjectedProviderDiscovery: false` so that's exactly one button,
  not duplicates from wagmi's EIP-6963 auto-discovery), plus a `mock` connector per default
  Hardhat account, always. `ConnectWallet.tsx` shows the MetaMask button and the test-account
  dropdown together when both are available (with an "or" divider), or whichever one exists on its
  own otherwise. The mock connectors work with zero browser extension — Hardhat's default accounts
  are unlocked server-side, so transactions sign through the RPC node directly. This means a demo
  machine with no MetaMask installed still works, and even with MetaMask installed, switching
  between accounts is often faster via the dropdown than through the extension.
- **MetaMask nonce caching**: every `demo:up` run resets the chain to block 0, but MetaMask caches
  nonces per network and doesn't know that happened. If a transaction fails with a nonce mismatch,
  Settings → Advanced → "Clear activity tab data" for the Hardhat network in MetaMask.
- **Reads vs. writes**: `createRequirement`, `balanceOf`, `averageReputation`, etc. are read
  directly on-chain via `useReadContract` — not proxied through the backend. The backend is only
  ever called to *push* the dynamic threshold on-chain (see root README's
  [Dynamic threshold](../../README.md#dynamic-threshold-honest-limitations) section); reading it
  for display never needs a backend round-trip.
