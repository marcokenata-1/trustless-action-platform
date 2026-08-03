import type { SubmissionResult } from "../services/simulator/runtime/index.js";
import type { SyncResult } from "../services/indexer/listener/index.js";

export interface JsonHandshakeProof {
  movementId: string;
  participant: string;
  peer: string;
  nonce: string;
  timestamp: string;
  peerSignature: string;
}

export interface JsonAttendance {
  movementId: string;
  participant: string;
  requiredPeerCount: string;
  proofsHash: string;
}

export interface SimulateHandshakeResponse {
  created: boolean;
  movementId: string;
  partyA: string;
  partyB: string;
  proofs: JsonHandshakeProof[];
}

export interface SimulateAttestResponse {
  proofs: JsonHandshakeProof[];
  attendance: JsonAttendance;
  participantSignature: string;
}

export interface SubmitAttendanceResponse extends SubmissionResult {
  movementId: string;
  participant: string;
  proofsHash: string;
}

export interface JsonAttendanceEvent {
  id: number;
  movementId: string;
  participant: string;
  proofsHash: string;
  proofCount: number;
  peers: string[];
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
}

export interface AttendanceListResponse {
  events: JsonAttendanceEvent[];
}

export type { SyncResult };

export interface DeployedAddresses {
  "AttendanceDemo#MovementMock": string;
  "AttendanceDemo#ReputationMock": string;
  "AttendanceDemo#AttendanceVerifier": string;
}
