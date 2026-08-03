import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const INITIAL_GRANT = 100n;
const ATTENDANCE_REWARD = 50n;
const CREATE_REQUIREMENT = 0n;
const COMMIT_THRESHOLD = 4n;
const DEADLINE_DAYS = 30n;
const MOVEMENT_ID = 1n;

export default buildModule("AttendanceDemo", (module) => {
  const deployer = module.getAccount(0);

  // Group participants into an array
  const participants = [
    module.getAccount(1), // participant
    module.getAccount(2), // peerA
    module.getAccount(3), // peerB
    module.getAccount(4), // peerC
  ];

  const reputation = module.contract("Reputation", [
    INITIAL_GRANT,
    ATTENDANCE_REWARD,
  ]);

  const movement = module.contract("Movement", [
    reputation,
    deployer,
    CREATE_REQUIREMENT,
  ]);

  const verifier = module.contract("AttendanceVerifier", [
    movement,
    reputation,
    3,
  ]);

  module.call(reputation, "setAttendanceVerifier", [verifier], {
    id: "SetAttendanceVerifier",
  });

  // Create movement using the first participant
  const createMovement = module.call(
    movement,
    "createMovement",
    [COMMIT_THRESHOLD, DEADLINE_DAYS, "ipfs://attendance-demo"],
    { id: "CreateDemoMovement", from: participants[0] }
  );

  // Loop through all participants to issue commit calls dynamically
  participants.forEach((account, index) => {
    module.call(movement, "commit", [MOVEMENT_ID], {
      id: `CommitDemoAccount${index + 1}`,
      from: account,
      after: [createMovement],
    });
  });

  return { movement, reputation, verifier };
});