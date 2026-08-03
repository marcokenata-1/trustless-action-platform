import express from "express";

import { asyncRoute, createErrorHandler, sendJson } from "../../shared/http.js";
import type { AttendanceListener } from "./listener/index.js";
import {
  address,
  attendanceQuerySchema,
  parse,
  unsignedBigInt,
} from "./schema/index.js";
import type { AttendanceStore } from "./store/index.js";

export function createIndexerApp(
  store: AttendanceStore,
  listener: AttendanceListener,
) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get(
    "/sync/status",
    asyncRoute(async (_request, response) => {
      sendJson(response, {
        lastIndexedBlock: store.getLastIndexedBlock(),
      });
    }),
  );

  app.post(
    "/sync",
    asyncRoute(async (_request, response) => {
      const result = await listener.syncOnce();
      sendJson(response, result);
    }),
  );

  app.get(
    "/attendance",
    asyncRoute(async (request, response) => {
      const query = parse(attendanceQuerySchema, {
        movementId: request.query.movementId,
        participant: request.query.participant,
      });

      const events =
        query.participant === undefined
          ? store.listByMovement(query.movementId)
          : store.listByMovementAndParticipant(
              query.movementId,
              query.participant,
            );

      sendJson(response, { events });
    }),
  );

  app.use(createErrorHandler("Unknown indexer error"));

  return app;
}
