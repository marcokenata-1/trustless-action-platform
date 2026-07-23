import express from "express";
import { getAddress } from "ethers";

import {
  buildAttendance,
  getHandshakePeerAddress,
  createMutualHandshake,
  signAttendance,
  sortHandshakeProofs,
} from "../../shared/attendance.js";
import { signMutualHandshake } from "./handshake/index.js";
import { asyncRoute, sendJson } from "./helpers/index.js";
import { errorHandler } from "./middleware/index.js";
import type { SimulatorRuntime } from "./runtime/index.js";
import {
  parse,
  simulateAttestSchema,
  simulateHandshakeSchema,
  submitAttendanceSchema,
} from "./schema/index.js";
import {
  getNormalizedHandshakeParties,
  HandshakeStore,
} from "./store/index.js";

export function createSimulatorApp(
  runtime: SimulatorRuntime,
  handshakeStore: HandshakeStore,
) {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post(
    "/simulate/handshake",
    asyncRoute(async (request, response) => {
      const body = parse(simulateHandshakeSchema, request.body);
      const existing = handshakeStore.get(
        body.movementId,
        body.partyA,
        body.partyB,
      );

      if (existing) {
        sendJson(response, { created: false, ...existing });
        return;
      }

      const domain = await runtime.getDomain();
      const [partyA, partyB] = getNormalizedHandshakeParties(
        body.partyA,
        body.partyB,
      );
      const [handshakeForA, handshakeForB] = createMutualHandshake(
        body.movementId,
        partyA,
        partyB,
        body.timestamp,
      );
      const proofs = await signMutualHandshake(
        runtime,
        domain,
        handshakeForA,
        handshakeForB,
      );

      // NOTE: making this api call idempotent using insertOrGet.
      const result = handshakeStore.insertOrGet({
        movementId: body.movementId,
        partyA,
        partyB,
        proofs,
      });

      sendJson(response, { created: result.created, ...result.session });
    }),
  );

  // NOTE: The one being verified will hit this endpoint building all the handshake proofs he/she had and sign it.
  app.post(
    "/simulate/attest",
    asyncRoute(async (request, response) => {
      const body = parse(simulateAttestSchema, request.body);
      const domain = await runtime.getDomain();
      const requiredPeerCount = await runtime.getRequiredPeerCount();

      for (const proof of body.proofs) {
        const recoveredPeer = getAddress(
          getHandshakePeerAddress(domain, proof),
        );
        if (recoveredPeer !== getAddress(proof.peer)) {
          throw new Error(`Invalid peer signature for ${proof.peer}`);
        }
      }

      const sortedProofs = sortHandshakeProofs(body.proofs);
      const attendance = buildAttendance(
        domain,
        sortedProofs,
        requiredPeerCount,
      );
      const participantSigner = await runtime.getSigner(attendance.participant);
      const participantSignature = await signAttendance(
        participantSigner,
        domain,
        attendance,
      );

      sendJson(response, {
        proofs: sortedProofs,
        attendance,
        participantSignature,
      });
    }),
  );

  app.post(
    "/submit",
    asyncRoute(async (request, response) => {
      const body = parse(submitAttendanceSchema, request.body);
      const proofs = sortHandshakeProofs(body.proofs);

      const domain = await runtime.getDomain();
      const requiredPeerCount = await runtime.getRequiredPeerCount();
      const attendance = buildAttendance(domain, proofs, requiredPeerCount);

      const result = await runtime.submitAttendance(
        attendance.movementId,
        attendance.participant,
        proofs,
        body.participantSignature,
      );

      sendJson(response, {
        ...result,
        movementId: attendance.movementId,
        participant: attendance.participant,
        proofsHash: attendance.proofsHash,
      });
    }),
  );

  app.use(errorHandler);

  return app;
}
