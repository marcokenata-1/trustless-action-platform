import type { HandshakeProof } from "../../../shared/attendance.js";
import {
  array,
  address,
  object,
  optional,
  parse,
  string,
  unsignedBigInt,
} from "../../../shared/schema.js";
import type { Schema } from "../../../shared/schema.js";

export { parse };
export type { Schema };

export const handshakeProofSchema: Schema<HandshakeProof> = object({
  movementId: unsignedBigInt,
  participant: address,
  peer: address,
  nonce: string,
  timestamp: unsignedBigInt,
  peerSignature: string,
});

export const handshakesQuerySchema = object({
  movementId: unsignedBigInt,
});

export const simulateHandshakeSchema = object({
  movementId: unsignedBigInt,
  partyA: address,
  partyB: address,
  timestamp: optional(unsignedBigInt),
});

export const simulateAttestSchema = object({
  proofs: array(handshakeProofSchema, { minLength: 1 }),
});

export const submitAttendanceSchema = object({
  proofs: array(handshakeProofSchema, { minLength: 1 }),
  participantSignature: string,
});
