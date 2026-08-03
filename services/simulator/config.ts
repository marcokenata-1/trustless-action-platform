import { DEFAULT_RPC_URL, parsePort, requireEnv } from "../../shared/parser.js";

export interface SimulatorConfig {
  port: number;
  rpcUrl: string;
  verifierAddress: string;
  databasePath: string;
}

export function loadSimulatorConfig(
  env: NodeJS.ProcessEnv = process.env
): SimulatorConfig {
  return {
    port: parsePort(env.SIMULATOR_PORT ?? "3001", "SIMULATOR_PORT"),
    rpcUrl: env.RPC_URL ?? DEFAULT_RPC_URL,
    verifierAddress: requireEnv(env, "ATTENDANCE_VERIFIER_ADDRESS"),
    databasePath:
      env.HANDSHAKE_DB_PATH ?? "services/simulator/data/handshakes.sqlite",
  };
}
