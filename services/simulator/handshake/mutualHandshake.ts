import type { TypedDataDomain } from "ethers";

import { signHandshake } from "../../../shared/attendance.js";
import type {
  Handshake,
  HandshakeProof,
} from "../../../shared/attendance.js";
import type { SimulatorRuntime } from "../runtime/index.js";

/*
  Each directed handshake is signed by its peer:
  B signs A's claim, A signs B's claim.
*/
export async function signMutualHandshake(
  runtime: SimulatorRuntime,
  domain: TypedDataDomain,
  handshakeForA: Handshake,
  handshakeForB: Handshake,
): Promise<[HandshakeProof, HandshakeProof]> {
  const [signatureFromB, signatureFromA] = await Promise.all([
    signHandshake(
      await runtime.getSigner(handshakeForA.peer),
      domain,
      handshakeForA,
    ),
    signHandshake(
      await runtime.getSigner(handshakeForB.peer),
      domain,
      handshakeForB,
    ),
  ]);

  return [
    { ...handshakeForA, peerSignature: signatureFromB },
    { ...handshakeForB, peerSignature: signatureFromA },
  ];
}
