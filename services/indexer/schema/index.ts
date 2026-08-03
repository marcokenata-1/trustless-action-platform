import {
  address,
  object,
  optional,
  parse,
  string,
  unsignedBigInt,
} from "../../../shared/schema.js";
import type { ReputationEventType } from "../store/index.js";

export { address, parse, unsignedBigInt };

const REPUTATION_EVENT_TYPES = new Set<ReputationEventType>([
  "Registered",
  "AttendanceRewarded",
  "AttendanceVerifierUpdated",
  "InitialGrantUpdated",
  "AttendanceRewardUpdated",
]);

export const attendanceQuerySchema = object({
  movementId: unsignedBigInt,
  participant: optional(address),
});

export const movementIdQuerySchema = object({
  movementId: optional(unsignedBigInt),
});

export const movementIdParamSchema = object({
  movementId: unsignedBigInt,
});

export const reputationQuerySchema = object({
  eventType: optional(reputationEventType),
  participant: optional(address),
  movementId: optional(unsignedBigInt),
});

function reputationEventType(
  value: unknown,
  path = "",
): ReputationEventType {
  const text = string(value, path);
  if (!REPUTATION_EVENT_TYPES.has(text as ReputationEventType)) {
    throw new Error(
      `${path || "eventType"} must be one of: ${[...REPUTATION_EVENT_TYPES].join(", ")}`,
    );
  }
  return text as ReputationEventType;
}
