// TODO: this is just my local hardhat deployment, address will change every
// time someone redeploys. swap once we have a real address to point at.
export const movementAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as const;

export const movementAbi = [
  {
    "inputs": [
      { "internalType": "address", "name": "reputationAddress", "type": "address" },
      { "internalType": "address", "name": "requirementUpdaterAddress", "type": "address" },
      { "internalType": "uint256", "name": "initialCreateRequirement", "type": "uint256" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "movementId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "committer", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "tally", "type": "uint256" }
    ],
    "name": "Committed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "oldRequirement", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "newRequirement", "type": "uint256" }
    ],
    "name": "CreateRequirementUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": true, "internalType": "uint256", "name": "movementId", "type": "uint256" }],
    "name": "MovementActivated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": true, "internalType": "uint256", "name": "movementId", "type": "uint256" }],
    "name": "MovementCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "movementId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "organiser", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "threshold", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "deadlineBlock", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "cid", "type": "string" }
    ],
    "name": "MovementCreated",
    "type": "event"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "movementId", "type": "uint256" }],
    "name": "commit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "threshold", "type": "uint256" },
      { "internalType": "uint256", "name": "deadlineDays", "type": "uint256" },
      { "internalType": "string", "name": "cid", "type": "string" }
    ],
    "name": "createMovement",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "createRequirement",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "movementId", "type": "uint256" }],
    "name": "getMovement",
    "outputs": [
      {
        "components": [
          { "internalType": "address", "name": "organiserAddress", "type": "address" },
          { "internalType": "uint256", "name": "threshold", "type": "uint256" },
          { "internalType": "uint256", "name": "deadlineBlock", "type": "uint256" },
          { "internalType": "string", "name": "ipfsCID", "type": "string" },
          { "internalType": "uint256", "name": "currentTally", "type": "uint256" },
          { "internalType": "enum Movement.Status", "name": "status", "type": "uint8" }
        ],
        "internalType": "struct Movement.MovementData",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "movementId", "type": "uint256" }],
    "name": "getStatus",
    "outputs": [{ "internalType": "enum Movement.Status", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "movementId", "type": "uint256" }],
    "name": "isActive",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "movementId", "type": "uint256" },
      { "internalType": "address", "name": "account", "type": "address" }
    ],
    "name": "isCommitted",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "reputation",
    "outputs": [{ "internalType": "contract IReputation", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "requirementUpdater",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "movementId", "type": "uint256" }],
    "name": "resolve",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "newRequirement", "type": "uint256" }],
    "name": "setCreateRequirement",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
