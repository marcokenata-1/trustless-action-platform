import {
  DEFAULT_RPC_URL,
  parseNonNegativeInt,
  parsePort,
  parsePositiveInt,
  requireEnv,
} from "../../shared/parser.js";

export interface IndexerConfig {
  port: number;
  rpcUrl: string;
  verifierAddress: string;
  databasePath: string;
  startBlock: number;
  pollIntervalMs: number;
}

export function loadIndexerConfig(
  env: NodeJS.ProcessEnv = process.env
): IndexerConfig {
  return {
    port: parsePort(env.INDEXER_PORT ?? "3002", "INDEXER_PORT"),
    rpcUrl: env.RPC_URL ?? DEFAULT_RPC_URL,
    verifierAddress: requireEnv(env, "ATTENDANCE_VERIFIER_ADDRESS"),
    databasePath:
      env.INDEXER_DB_PATH ?? "services/indexer/data/attendance.sqlite",
    startBlock: parseNonNegativeInt(
      env.INDEXER_START_BLOCK ?? "0",
      "INDEXER_START_BLOCK"
    ),
    pollIntervalMs: parsePositiveInt(
      env.INDEXER_POLL_INTERVAL_MS ?? "2000",
      "INDEXER_POLL_INTERVAL_MS"
    ),
  };
}
