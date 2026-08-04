import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * ReputationModule — deploys ONLY the Reputation contract.
 *
 * Off-chain-threshold design: the constructor takes just (initialGrant, attendanceReward).
 * The movement-creation threshold is computed off-chain, so Reputation no longer knows about
 * Movement and there is no thresholdMultiplier.
 *
 * Cross-contract wiring (e.g. setAttendanceVerifier) is NOT done here — it lives in Platform.ts,
 * because it needs the AttendanceVerifier address. This module just deploys the contract and
 * returns a handle so Platform.ts (or a test) can compose it via m.useModule(ReputationModule).
 *
 * Deploy this alone with:
 *   npx hardhat ignition deploy ignition/modules/Reputation.ts --network <network> \
 *     --parameters ignition/params.json
 */
const ReputationModule = buildModule("ReputationModule", (m) => {
  // Pulled from params.json at deploy time (defaults match test/Reputation.ts).
  const initialGrant = m.getParameter("initialGrant", 100n);
  const attendanceReward = m.getParameter("attendanceReward", 50n);

  const reputation = m.contract("Reputation", [initialGrant, attendanceReward]);

  return { reputation };
});

export default ReputationModule;
