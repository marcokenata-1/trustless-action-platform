// same deal as movementContract.ts / reputationContract.ts
export const attendanceVerifierAddress = import.meta.env
  .VITE_ATTENDANCE_VERIFIER_ADDRESS;

// just the one read the handshake graph needs — whether a participant's
// attendance for a movement has already been claimed
export const attendanceVerifierAbi = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" },
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "name": "attendanceVerified",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
