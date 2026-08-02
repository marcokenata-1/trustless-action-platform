export interface SimulatorConfig {
  port: number;
  rpcUrl: string;
  verifierAddress: string;
  databasePath: string;
}

export function loadSimulatorConfig(
  env: NodeJS.ProcessEnv = process.env,
): SimulatorConfig {
  const verifierAddress = env.ATTENDANCE_VERIFIER_ADDRESS;
  if (!verifierAddress) {
    throw new Error("ATTENDANCE_VERIFIER_ADDRESS is required");
  }

  return {
    port: parsePort(env.SIMULATOR_PORT ?? "3001"),
    rpcUrl: env.RPC_URL ?? "http://127.0.0.1:8545",
    verifierAddress,
    databasePath:
      env.HANDSHAKE_DB_PATH ?? "services/simulator/data/handshakes.sqlite",
  };
}

function parsePort(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 65_535) {
    throw new Error("SIMULATOR_PORT must be between 1 and 65535");
  }
  return result;
}
