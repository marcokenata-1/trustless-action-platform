import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AttendanceDemo", (module) => {
  const movement = module.contract("MovementMock");
  const reputation = module.contract("ReputationMock");
  const verifier = module.contract("AttendanceVerifier", [
    movement,
    reputation,
    3,
  ]);

  module.call(movement, "setActive", [1n, true], {
    id: "ActivateDemoMovement",
  });

  for (let accountIndex = 1; accountIndex <= 4; accountIndex += 1) {
    module.call(
      movement,
      "setCommitted",
      [1n, module.getAccount(accountIndex), true],
      { id: `CommitDemoAccount${accountIndex}` },
    );
  }

  return { movement, reputation, verifier };
});
