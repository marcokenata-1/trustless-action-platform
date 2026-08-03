This folder contains TypeScript code reused by multiple off-chain components:

- Hardhat tests
- Handshake simulator API
- Attendance indexer API

`attendance.ts` builds EIP-712 handshake proofs and a compact attendance claim.
The attendance claim signs `proofsHash` (hash of sorted handshake digests) so the
peer quorum can change without altering the Attendance EIP-712 schema.

`http.ts` holds shared Express helpers (`asyncRoute`, `sendJson`,
`createErrorHandler`) used by both HTTP services.
