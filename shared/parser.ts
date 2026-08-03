export const DEFAULT_RPC_URL = "http://127.0.0.1:8545";

export function requireEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function parsePort(value: string, name = "PORT"): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 65_535) {
    throw new Error(`${name} must be between 1 and 65535`);
  }
  return result;
}

export function parseNonNegativeInt(value: string, name: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return result;
}

export function parsePositiveInt(value: string, name: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return result;
}
