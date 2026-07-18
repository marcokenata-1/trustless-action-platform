import { getAddress } from "ethers";

import type { HandshakeProof } from "../../../shared/attendance.js";

export type Schema<T> = (value: unknown, path?: string) => T;

export function parse<T>(schema: Schema<T>, value: unknown): T {
  return schema(value, "");
}

export function object<T extends Record<string, Schema<unknown>>>(
  shape: T,
): Schema<{ [K in keyof T]: ReturnType<T[K]> }> {
  return (value, path = "") => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label(path)} must be a JSON object`);
    }

    const record = value as Record<string, unknown>;
    const result = {} as { [K in keyof T]: ReturnType<T[K]> };

    for (const key of Object.keys(shape) as Array<keyof T>) {
      const fieldPath = path ? `${path}.${String(key)}` : String(key);
      result[key] = shape[key](record[String(key)], fieldPath) as ReturnType<
        T[typeof key]
      >;
    }

    return result;
  };
}

export function array<T>(
  itemSchema: Schema<T>,
  options: { minLength?: number } = {},
): Schema<T[]> {
  return (value, path = "") => {
    if (!Array.isArray(value)) {
      throw new Error(`${label(path)} must be an array`);
    }

    if (
      options.minLength !== undefined &&
      value.length < options.minLength
    ) {
      throw new Error(
        `${label(path)} must contain at least ${options.minLength} item(s)`,
      );
    }

    return value.map((item, index) =>
      itemSchema(item, `${path || "item"}[${index}]`),
    );
  };
}

export function optional<T>(schema: Schema<T>): Schema<T | undefined> {
  return (value, path = "") => {
    if (value === undefined) {
      return undefined;
    }
    return schema(value, path);
  };
}

export const string: Schema<string> = (value, path = "") => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label(path)} must be a non-empty string`);
  }
  return value;
};

export const address: Schema<string> = (value, path = "") => {
  try {
    return getAddress(string(value, path));
  } catch {
    throw new Error(`${label(path)} must be a valid Ethereum address`);
  }
};

export const unsignedBigInt: Schema<bigint> = (value, path = "") => {
  if (
    (typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "bigint") ||
    (typeof value === "number" && !Number.isSafeInteger(value))
  ) {
    throw new Error(`${label(path)} must be an unsigned integer`);
  }

  try {
    const result = BigInt(value);
    if (result < 0n) {
      throw new Error();
    }
    return result;
  } catch {
    throw new Error(`${label(path)} must be an unsigned integer`);
  }
};

export const handshakeProofSchema: Schema<HandshakeProof> = object({
  movementId: unsignedBigInt,
  participant: address,
  peer: address,
  nonce: string,
  timestamp: unsignedBigInt,
  peerSignature: string,
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

function label(path: string): string {
  return path.length === 0 ? "Request body" : path;
}
