import express from "express";

import { asyncRoute, createErrorHandler, sendJson } from "../../shared/http.js";
import type { IndexerListener } from "./listener/index.js";
import {
  attendanceQuerySchema,
  movementIdParamSchema,
  movementIdQuerySchema,
  parse,
  reputationQuerySchema,
} from "./schema/index.js";
import type { IndexerStore } from "./store/index.js";

export function createIndexerApp(
  store: IndexerStore,
  listener: IndexerListener,
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
        attendance: {
          lastIndexedBlock: store.getLastIndexedAttendanceBlock(),
        },
        movement: {
          lastIndexedBlock: store.getLastIndexedMovementBlock(),
        },
        reputation: {
          lastIndexedBlock: store.getLastIndexedReputationBlock(),
        },
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
          ? store.listAttendanceByMovement(query.movementId)
          : store.listAttendanceByMovementAndParticipant(
              query.movementId,
              query.participant,
            );

      sendJson(response, { events });
    }),
  );

  app.get(
    "/movements",
    asyncRoute(async (request, response) => {
      const query = parse(movementIdQuerySchema, {
        movementId: request.query.movementId,
      });

      if (query.movementId !== undefined) {
        const movement = store.getMovement(query.movementId);
        sendJson(response, {
          movements: movement === null ? [] : [movement],
        });
        return;
      }

      sendJson(response, { movements: store.listMovements() });
    }),
  );

  app.get(
    "/movements/:movementId",
    asyncRoute(async (request, response) => {
      const { movementId } = parse(movementIdParamSchema, {
        movementId: request.params.movementId,
      });
      const movement = store.getMovement(movementId);
      if (movement === null) {
        response.status(404).json({ error: "Movement not found" });
        return;
      }

      sendJson(response, {
        movement,
        commits: store.listCommits(movementId),
      });
    }),
  );

  app.get(
    "/movements/:movementId/commits",
    asyncRoute(async (request, response) => {
      const { movementId } = parse(movementIdParamSchema, {
        movementId: request.params.movementId,
      });
      sendJson(response, { commits: store.listCommits(movementId) });
    }),
  );

  app.get(
    "/movement-events",
    asyncRoute(async (request, response) => {
      const query = parse(movementIdQuerySchema, {
        movementId: request.query.movementId,
      });
      sendJson(response, {
        events: store.listMovementEvents(query.movementId),
      });
    }),
  );

  app.get(
    "/create-requirement-updates",
    asyncRoute(async (_request, response) => {
      sendJson(response, {
        updates: store.listCreateRequirementUpdates(),
      });
    }),
  );

  app.get(
    "/reputation-events",
    asyncRoute(async (request, response) => {
      const query = parse(reputationQuerySchema, {
        eventType: request.query.eventType,
        participant: request.query.participant,
        movementId: request.query.movementId,
      });
      sendJson(response, {
        events: store.listReputationEvents(query),
      });
    }),
  );

  app.use(createErrorHandler("Unknown indexer error"));

  return app;
}
