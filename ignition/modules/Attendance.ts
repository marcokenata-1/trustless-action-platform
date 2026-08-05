import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import MovementModule from "./Movement.js";

export default buildModule("Attendance", (module) => {
  const { movement, reputation } = module.useModule(MovementModule);

  const verifier = module.contract("AttendanceVerifier", [
    movement,
    reputation,
    3,
  ]);

  module.call(reputation, "setAttendanceVerifier", [verifier], {
    id: "SetAttendanceVerifier",
  });

  return { movement, reputation, verifier };
});
