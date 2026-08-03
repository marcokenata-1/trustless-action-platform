import type { Signer } from "ethers";

export const REPUTATION_INITIAL_GRANT = 100n;
export const REPUTATION_ATTENDANCE_REWARD = 50n;
export const CREATE_REQUIREMENT = 0n;
export const MOVEMENT_DEADLINE_DAYS = 30n;
export const MOVEMENT_CID = "ipfs://attendance-test";

type EthersLike = any;
type MovementLike = any;

export async function deployAttendanceContracts(
  ethers: EthersLike,
  requiredPeerCount: number
) {
  const [owner] = await ethers.getSigners();
  const reputation = await ethers.deployContract("Reputation", [
    REPUTATION_INITIAL_GRANT,
    REPUTATION_ATTENDANCE_REWARD,
  ]);
  const movement = await ethers.deployContract("Movement", [
    await reputation.getAddress(),
    await owner.getAddress(),
    CREATE_REQUIREMENT,
  ]);
  const verifier = await ethers.deployContract("AttendanceVerifier", [
    await movement.getAddress(),
    await reputation.getAddress(),
    requiredPeerCount,
  ]);

  await Promise.all([
    reputation.waitForDeployment(),
    movement.waitForDeployment(),
    verifier.waitForDeployment(),
  ]);

  await reputation.setAttendanceVerifier(await verifier.getAddress());

  return { owner, reputation, movement, verifier };
}

/*
  Creates a movement and has each committer call commit().
  Set threshold === committers.length to activate on the final commit.
*/
export async function createMovementWithCommits(
  movement: MovementLike,
  organiser: Signer,
  committers: readonly Signer[],
  threshold: bigint
): Promise<bigint> {
  const movementId = await movement
    .connect(organiser)
    .createMovement.staticCall(threshold, MOVEMENT_DEADLINE_DAYS, MOVEMENT_CID);
  await movement
    .connect(organiser)
    .createMovement(threshold, MOVEMENT_DEADLINE_DAYS, MOVEMENT_CID);

  for (const committer of committers) {
    await movement.connect(committer).commit(movementId);
  }

  return movementId;
}
