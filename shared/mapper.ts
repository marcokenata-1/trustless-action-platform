import type { Signer, TypedDataDomain } from "ethers";

import { createHandshake, signHandshake } from "./attendance.js";
import type { Handshake, HandshakeProof } from "./attendance.js";

export function toContractProof(proof: HandshakeProof) {
  return {
    peer: proof.peer,
    nonce: proof.nonce,
    timestamp: proof.timestamp,
    peerSignature: proof.peerSignature,
  };
}

export async function signProof(
  participant: Signer,
  peer: Signer,
  domain: TypedDataDomain,
  movementId: bigint,
  overrides: Partial<Handshake> = {},
): Promise<HandshakeProof> {
  const handshake: Handshake = {
    ...createHandshake(
      movementId,
      await participant.getAddress(),
      await peer.getAddress(),
      1_700_000_000n,
    ),
    ...overrides,
  };
  const peerSignature = await signHandshake(peer, domain, handshake);
  return { ...handshake, peerSignature };
}
