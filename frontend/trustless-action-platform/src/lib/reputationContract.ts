// same deal as movementContract.ts — address comes from .env, run
// `npm run sync-addresses` after every fresh deploy
export const reputationAddress = import.meta.env.VITE_REPUTATION_ADDRESS;

// just the reads the reputation badge needs, not the full contract
export const reputationAbi = [
  {
    "inputs": [{ "internalType": "address", "name": "user", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "averageReputation",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
