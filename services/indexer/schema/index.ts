import {
  address,
  object,
  optional,
  parse,
  unsignedBigInt,
} from "../../../shared/schema.js";

export { address, parse, unsignedBigInt };

export const attendanceQuerySchema = object({
  movementId: unsignedBigInt,
  participant: optional(address),
});
