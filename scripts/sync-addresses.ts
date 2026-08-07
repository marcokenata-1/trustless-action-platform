import { readFileSync, writeFileSync, existsSync } from "node:fs";

const deploymentPath =
  "ignition/deployments/chain-31337/deployed_addresses.json";

if (!existsSync(deploymentPath)) {
  console.error(`No deployment found at ${deploymentPath} — deploy first.`);
  process.exit(1);
}

const addresses = JSON.parse(readFileSync(deploymentPath, "utf-8")) as Record<
  string,
  string
>;

const reputation = addresses["ReputationModule#Reputation"];
const movement = addresses["MovementModule#Movement"];
const attendanceVerifier = addresses["Attendance#AttendanceVerifier"];

function setEnvVar(path: string, key: string, value: string) {
  let content = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  content = pattern.test(content)
    ? content.replace(pattern, line)
    : content + (content.endsWith("\n") || content === "" ? "" : "\n") + line + "\n";

  writeFileSync(path, content);
}

setEnvVar(
  "frontend/trustless-action-platform/.env",
  "VITE_MOVEMENT_ADDRESS",
  movement,
);
setEnvVar(
  "frontend/trustless-action-platform/.env",
  "VITE_ATTENDANCE_VERIFIER_ADDRESS",
  attendanceVerifier,
);
setEnvVar(
  "frontend/trustless-action-platform/.env",
  "VITE_REPUTATION_ADDRESS",
  reputation,
);

setEnvVar("services/indexer/.env", "MOVEMENT_ADDRESS", movement);
setEnvVar("services/indexer/.env", "REPUTATION_ADDRESS", reputation);
setEnvVar(
  "services/indexer/.env",
  "ATTENDANCE_VERIFIER_ADDRESS",
  attendanceVerifier,
);
setEnvVar(
  "services/simulator/.env",
  "ATTENDANCE_VERIFIER_ADDRESS",
  attendanceVerifier,
);

setEnvVar("backend/trustless-action-platform/.env", "MOVEMENT_ADDRESS", movement);
setEnvVar("backend/trustless-action-platform/.env", "REPUTATION_ADDRESS", reputation);
setEnvVar(
  "backend/trustless-action-platform/.env",
  "ATTENDANCE_VERIFIER_ADDRESS",
  attendanceVerifier,
);
