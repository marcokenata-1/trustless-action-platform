import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { getAddress } from "ethers";

import type {
  AttendanceListResponse,
  DeployedAddresses,
  JsonHandshakeProof,
  SimulateAttestResponse,
  SimulateHandshakeResponse,
  SubmitAttendanceResponse,
  SyncResult,
} from "./interface.js";
import { isVerbose, log, shortAddress } from "./logger.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RPC_URL = "http://127.0.0.1:8545";
const SIMULATOR_URL = "http://127.0.0.1:3001";
const INDEXER_URL = "http://127.0.0.1:3002";
const SIMULATOR_PORT = "3001";
const INDEXER_PORT = "3002";
const MOVEMENT_ID = "1";

// Hardhat's deterministic accounts (#1 participant, #2–#4 peers).
const PARTICIPANT = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const PEERS = [
  getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"),
  getAddress("0x90f79bf6eb2c4f870365e785982e1f101e93b906"),
  getAddress("0x15d34aaf54267db7d7c367839aaf71a00a2c6a65"),
];

const children: ChildProcess[] = [];
let shuttingDown = false;

async function main(): Promise<void> {
  log.box("Attendance E2E demo");
  if (isVerbose()) {
    log.info("Verbose child-process logs enabled");
  } else {
    log.info("Tip: run with VERBOSE=1 or --verbose to see Hardhat/service logs");
  }

  await assertPortFree(8545, "Hardhat node");
  await assertPortFree(3001, "Simulator");
  await assertPortFree(3002, "Indexer");

  // Stale/corrupt artifacts/build-info can make `hardhat node` fail with:
  // "Failed to parse build info: missing field `contracts`".
  log.start("Compiling contracts");
  await runCommand("npx", ["hardhat", "compile"]);
  log.success("Contracts compiled");

  log.start("Starting Hardhat node");
  spawnLogged("hardhat-node", "npx", ["hardhat", "node"]);
  await waitForRpc(RPC_URL, 60_000);
  log.success(`Hardhat RPC ready at ${RPC_URL}`);

  log.start("Deploying AttendanceDemo");
  rmSync(join(ROOT, "ignition/deployments/chain-31337"), {
    recursive: true,
    force: true,
  });
  await runCommand("npx", [
    "hardhat",
    "ignition",
    "deploy",
    "ignition/modules/AttendanceDemo.ts",
    "--network",
    "localhost",
  ]);
  const { verifierAddress, movementAddress, reputationAddress } =
    readDeployedAddresses();
  log.success(`AttendanceVerifier deployed at ${verifierAddress}`);
  log.success(`Movement deployed at ${movementAddress}`);
  log.success(`Reputation deployed at ${reputationAddress}`);

  const serviceEnv = {
    RPC_URL,
    ATTENDANCE_VERIFIER_ADDRESS: verifierAddress,
    MOVEMENT_ADDRESS: movementAddress,
    REPUTATION_ADDRESS: reputationAddress,
    SIMULATOR_PORT,
    HANDSHAKE_DB_PATH: ":memory:",
    INDEXER_PORT,
    INDEXER_DB_PATH: ":memory:",
    INDEXER_START_BLOCK: "0",
    INDEXER_POLL_INTERVAL_MS: "1000",
  };

  log.start("Starting simulator + indexer");
  spawnLogged(
    "simulator",
    "npx",
    ["tsx", "services/simulator/server.ts"],
    serviceEnv,
  );
  spawnLogged(
    "indexer",
    "npx",
    ["tsx", "services/indexer/server.ts"],
    serviceEnv,
  );
  await waitForHttp(`${SIMULATOR_URL}/health`, 30_000);
  await waitForHttp(`${INDEXER_URL}/health`, 30_000);
  log.success(
    `Services ready (simulator ${SIMULATOR_URL}, indexer ${INDEXER_URL})`,
  );

  log.start("Handshake + attest + submit");
  const proofs: JsonHandshakeProof[] = [];
  for (const peer of PEERS) {
    const session = await postJson<SimulateHandshakeResponse>(
      `${SIMULATOR_URL}/simulate/handshake`,
      {
        movementId: MOVEMENT_ID,
        partyA: PARTICIPANT,
        partyB: peer,
      },
    );

    const proof = session.proofs.find(
      (item) => getAddress(item.participant) === PARTICIPANT,
    );
    if (!proof) {
      throw new Error(`Missing participant proof for peer ${peer}`);
    }
    proofs.push(proof);
    log.info(`Handshake ok with ${shortAddress(peer)}`);
  }

  const attestation = await postJson<SimulateAttestResponse>(
    `${SIMULATOR_URL}/simulate/attest`,
    { proofs },
  );
  log.info("Attestation signed");

  const submission = await postJson<SubmitAttendanceResponse>(
    `${SIMULATOR_URL}/submit`,
    {
      proofs: attestation.proofs,
      participantSignature: attestation.participantSignature,
    },
  );
  log.success(`Submitted attendance  tx=${submission.transactionHash}`);
  log.info(`proofsHash=${submission.proofsHash}`);

  log.start("Indexing attendance + movement + reputation");
  const sync = await postJson<SyncResult>(`${INDEXER_URL}/sync`, {});
  const indexed = await getJson<AttendanceListResponse>(
    `${INDEXER_URL}/attendance?movementId=${MOVEMENT_ID}`,
  );
  const movements = await getJson<{
    movements: Array<{ movementId: string; status: string; tally: string }>;
  }>(`${INDEXER_URL}/movements?movementId=${MOVEMENT_ID}`);

  logStreamSync("Attendance", sync.attendance);
  logStreamSync("Movement", sync.movement);
  logStreamSync("Reputation", sync.reputation);
  log.success(
    `Indexed attendance for movement ${MOVEMENT_ID}: ${indexed.events.length}`,
  );
  if (movements.movements.length !== 1) {
    throw new Error(`Expected 1 indexed movement, got ${movements.movements.length}`);
  }
  log.success(
    `Indexed movement ${MOVEMENT_ID} status=${movements.movements[0].status} tally=${movements.movements[0].tally}`,
  );

  const reputationEvents = await getJson<{
    events: Array<{ eventType: string }>;
  }>(`${INDEXER_URL}/reputation-events?movementId=${MOVEMENT_ID}`);
  const rewarded = reputationEvents.events.filter(
    (event) => event.eventType === "AttendanceRewarded",
  );
  if (rewarded.length !== 1) {
    throw new Error(
      `Expected 1 AttendanceRewarded event, got ${rewarded.length}`,
    );
  }
  log.success(`Indexed reputation AttendanceRewarded for movement ${MOVEMENT_ID}`);
  log.box("E2E demo succeeded");
}

function logStreamSync(
  label: string,
  result: SyncResult["attendance"],
): void {
  if (result.error !== undefined) {
    log.error(`${label} sync failed: ${result.error}`);
    return;
  }
  log.info(
    `${label} sync  seen=${result.eventsSeen} inserted=${result.eventsInserted}`,
  );
}

function readDeployedAddresses(): {
  verifierAddress: string;
  movementAddress: string;
  reputationAddress: string;
} {
  const path = join(
    ROOT,
    "ignition/deployments/chain-31337/deployed_addresses.json",
  );
  const addresses = JSON.parse(
    readFileSync(path, "utf8"),
  ) as DeployedAddresses;
  const verifierAddress = addresses["AttendanceDemo#AttendanceVerifier"];
  const movementAddress = addresses["AttendanceDemo#Movement"];
  const reputationAddress = addresses["AttendanceDemo#Reputation"];
  if (!verifierAddress) {
    throw new Error(`AttendanceVerifier missing from ${path}`);
  }
  if (!movementAddress) {
    throw new Error(`Movement missing from ${path}`);
  }
  if (!reputationAddress) {
    throw new Error(`Reputation missing from ${path}`);
  }
  return {
    verifierAddress: getAddress(verifierAddress),
    movementAddress: getAddress(movementAddress),
    reputationAddress: getAddress(reputationAddress),
  };
}

function spawnLogged(
  label: string,
  command: string,
  args: string[],
  env: Record<string, string> = {},
): ChildProcess {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  children.push(child);

  const childLog = log.withTag(label);
  const prefix = (chunk: Buffer) => {
    if (!isVerbose()) {
      return;
    }
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.length > 0) {
        childLog.debug(line);
      }
    }
  };
  child.stdout?.on("data", prefix);
  child.stderr?.on("data", prefix);
  child.on("exit", (code, signal) => {
    if (!shuttingDown && code !== 0 && code !== null) {
      childLog.error(`exited code=${code} signal=${signal}`);
    }
  });

  return child;
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: isVerbose() ? "inherit" : ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    if (!isVerbose()) {
      const buffer: string[] = [];
      const collect = (chunk: Buffer) => {
        buffer.push(chunk.toString());
      };
      child.stdout?.on("data", collect);
      child.stderr?.on("data", collect);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        const output = buffer.join("").trim();
        reject(
          new Error(
            `${command} ${args.join(" ")} failed (code ${code})${
              output.length > 0 ? `\n${output}` : ""
            }`,
          ),
        );
      });
    } else {
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`${command} ${args.join(" ")} failed (code ${code})`),
          );
        }
      });
    }

    child.on("error", reject);
  });
}

async function waitForRpc(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(400);
  }
  throw new Error(`Timed out waiting for RPC at ${url}`);
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(400);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function assertPortFree(port: number, label: string): Promise<void> {
  const inUse = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });

  if (inUse) {
    throw new Error(
      `${label} port ${port} is already in use. Stop the existing process and retry.`,
    );
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed: unknown = text.length === 0 ? null : JSON.parse(text);
  if (!response.ok) {
    throw new Error(
      `${url} failed (${response.status}): ${JSON.stringify(parsed)}`,
    );
  }
  return parsed as T;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const parsed: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      `${url} failed (${response.status}): ${JSON.stringify(parsed)}`,
    );
  }
  return parsed as T;
}

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log.info("Shutting down child processes…");
  for (const child of children.splice(0)) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  await sleep(300);
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(130));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(143));
});

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`E2E demo failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(() => shutdown());
