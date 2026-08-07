import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import ReputationModule from "./Reputation.js";

/**
 * MovementModule — deploys ONLY the Movement contract.
 *
 * Movement's sole external dependency is a single read-only call into
 * Reputation (balanceOf, used to gate createMovement). Rather than
 * deploying a separate copy, this module composes ReputationModule via
 * m.useModule(...) to get a real deployed Reputation address to pass into
 * Movement's constructor.
 *
 * requirementUpdater is the address authorised to call setCreateRequirement
 * later (the off-chain threshold service that reads Reputation's stats and
 * pushes the dynamic requirement in) - provide it via params.json.
 *
 * Defaults to a dedicated keeper wallet (not one of Hardhat's 20 default
 * accounts) so users testing with any of those accounts in MetaMask never
 * race the keeper's own nonce
 *
 * Cross-contract wiring beyond this (e.g. anything AttendanceVerifier needs)
 * is NOT done here, same reasoning as ReputationModule - it belongs in
 * Platform.ts, which can compose this module via m.useModule(MovementModule).
 *
 * Deploy this alone with:
 *   npx hardhat ignition deploy ignition/modules/Movement.ts --network <network> \
 *     --parameters ignition/params.json
 */
const MovementModule = buildModule("MovementModule", (m) => {
  const { reputation } = m.useModule(ReputationModule);

  const requirementUpdater = m.getParameter(
    "requirementUpdater",
    "0x6d4F6d958a8D6E7D503c2242798208Ca20451127",
  );
  const initialCreateRequirement = m.getParameter(
    "initialCreateRequirement",
    0n,
  );

  const movement = m.contract("Movement", [
    reputation,
    requirementUpdater,
    initialCreateRequirement,
  ]);

  return { movement, reputation };
});

export default MovementModule;
