import {
  AbiCoder,
  TypedDataEncoder,
  getAddress,
  hexlify,
  keccak256,
  randomBytes,
  verifyTypedData,
} from "ethers";
import type { Signer, TypedDataDomain, TypedDataField } from "ethers";

export const EIP712_NAME = "TrustlessActionAttendance";
export const EIP712_VERSION = "1";

export const REQUIRED_PEER_COUNT = 3;

export const HANDSHAKE_TYPES: Record<string, TypedDataField[]> = {
  Handshake: [
    { name: "movementId", type: "uint256" },
    { name: "participant", type: "address" },
    { name: "peer", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "timestamp", type: "uint64" },
  ],
};

/*
  Compact attendance claim. Peers are hashed into proofsHash so the quorum
  can change without altering this EIP-712 schema.
*/
export const ATTENDANCE_TYPES: Record<string, TypedDataField[]> = {
  Attendance: [
    { name: "movementId", type: "uint256" },
    { name: "participant", type: "address" },
    { name: "requiredPeerCount", type: "uint256" },
    { name: "proofsHash", type: "bytes32" },
  ],
};

/*
  When A and B handshake, create two entries:
  1. A participant, B peer
  2. B participant, A peer
*/
export interface Handshake {
  movementId: bigint;
  participant: string;
  peer: string;
  nonce: string;
  timestamp: bigint;
}

export interface HandshakeProof extends Handshake {
  peerSignature: string;
}

export interface Attendance {
  movementId: bigint;
  participant: string;
  requiredPeerCount: bigint;
  proofsHash: string;
}

export function attendanceDomain(
  chainId: bigint,
  verifyingContract: string,
): TypedDataDomain {
  return {
    name: EIP712_NAME,
    version: EIP712_VERSION,
    chainId,
    verifyingContract: getAddress(verifyingContract),
  };
}

export function newHandshake(
  movementId: bigint,
  participant: string,
  peer: string,
  timestamp: bigint = BigInt(Math.floor(Date.now() / 1_000)),
): Handshake {
  const normalizedParticipant = getAddress(participant);
  const normalizedPeer = getAddress(peer);

  if (normalizedParticipant === normalizedPeer) {
    throw new Error("A participant cannot handshake with themselves");
  }

  return {
    movementId,
    participant: normalizedParticipant,
    peer: normalizedPeer,
    nonce: hexlify(randomBytes(32)),
    timestamp,
  };
}

export async function signHandshake(
  signer: Signer,
  domain: TypedDataDomain,
  handshake: Handshake,
): Promise<string> {
  const signerAddress = getAddress(await signer.getAddress());
  if (signerAddress !== getAddress(handshake.peer)) {
    throw new Error("The handshake must be signed by its peer");
  }

  return signer.signTypedData(domain, HANDSHAKE_TYPES, handshake);
}

export function getHandshakePeerAddress(
  domain: TypedDataDomain,
  proof: HandshakeProof,
): string {
  return verifyTypedData(
    domain,
    HANDSHAKE_TYPES,
    toHandshake(proof),
    proof.peerSignature,
  );
}

export function computeHandshakeDigest(
  domain: TypedDataDomain,
  handshake: Handshake,
): string {
  return TypedDataEncoder.hash(domain, HANDSHAKE_TYPES, handshake);
}

// keccak256(abi.encode(bytes32[])) over sorted handshake digests; must match Solidity.
export function computeProofsHash(
  domain: TypedDataDomain,
  proofs: readonly HandshakeProof[],
): string {
  // computeProofsHash sorts internally so the same set of proofs is order-independent.
  const sorted = sortHandshakeProofs(proofs);
  const digests = sorted.map((proof) =>
    computeHandshakeDigest(domain, toHandshake(proof)),
  );
  return keccak256(AbiCoder.defaultAbiCoder().encode(["bytes32[]"], [digests]));
}

export function buildAttendance(
  domain: TypedDataDomain,
  proofs: readonly HandshakeProof[],
  requiredPeerCount: number = REQUIRED_PEER_COUNT,
): Attendance {
  if (proofs.length < requiredPeerCount) {
    throw new Error(
      `Attendance requires at least ${requiredPeerCount} peers, got ${proofs.length}`,
    );
  }

  const [first] = proofs;
  const participant = getAddress(first.participant);
  const movementId = first.movementId;

  for (const proof of proofs) {
    if (
      proof.movementId !== movementId ||
      getAddress(proof.participant) !== participant
    ) {
      throw new Error("All proofs must identify the same attendance claim");
    }
  }

  const peers = proofs.map((proof) => getAddress(proof.peer));

  if (new Set(peers).size !== proofs.length) {
    throw new Error("Attendance peers must be unique");
  }

  return {
    movementId,
    participant,
    requiredPeerCount: BigInt(requiredPeerCount),
    proofsHash: computeProofsHash(domain, proofs),
  };
}

export async function signAttendance(
  signer: Signer,
  domain: TypedDataDomain,
  attendance: Attendance,
): Promise<string> {
  const signerAddress = getAddress(await signer.getAddress());
  if (signerAddress !== getAddress(attendance.participant)) {
    throw new Error("Attendance must be signed by its participant");
  }

  return signer.signTypedData(domain, ATTENDANCE_TYPES, attendance);
}

export function getAttendanceParticipant(
  domain: TypedDataDomain,
  attendance: Attendance,
  participantSignature: string,
): string {
  return verifyTypedData(
    domain,
    ATTENDANCE_TYPES,
    attendance,
    participantSignature,
  );
}

export function toHandshake(proof: HandshakeProof): Handshake {
  const { peerSignature: _, ...handshake } = proof;
  return handshake;
}

export function sortHandshakeProofs(
  proofs: readonly HandshakeProof[],
): HandshakeProof[] {
  return [...proofs].sort((left, right) =>
    compareAddresses(left.peer, right.peer),
  );
}

function compareAddresses(left: string, right: string): number {
  const leftValue = BigInt(getAddress(left));
  const rightValue = BigInt(getAddress(right));
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}
