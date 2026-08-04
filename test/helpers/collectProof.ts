import type { HandshakeProof } from "../../shared/attendance.js";
import type { Signer } from "ethers";
import {
  attendanceDomain,
  createHandshake,
  signHandshake,
} from "../../shared/attendance.js";

export async function collectProofs(
  participant: Signer,
  peers: Signer[],
  domain: ReturnType<typeof attendanceDomain>,
  movementId = 1n
): Promise<HandshakeProof[]> {
  const participantAddress = await participant.getAddress();
  const proofs: HandshakeProof[] = [];
  for (const peer of peers) {
    const peerAddress = await peer.getAddress();
    const handshake = createHandshake(
      movementId,
      participantAddress,
      peerAddress,
      1_700_000_000n
    );
    const peerSignature = await signHandshake(peer, domain, handshake);
    proofs.push({ ...handshake, peerSignature });
  }
  return proofs;
}
