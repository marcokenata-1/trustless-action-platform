import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { network } from "hardhat";

const { ethers } = await network.create();

// Constructor args used by the fixture below.
const INIT = 100n; // initial grant
const REWARD = 50n; // per-attendance reward
const MULT_BPS = 30_000n; // 3x average

async function deployFixture() {
  const [owner, verifier, alice, bob] = await ethers.getSigners();

  const reputation = await ethers.deployContract("Reputation", [
    INIT,
    REWARD,
    MULT_BPS,
  ]);
  // MovementMock is used only for the syncCreateRequirement test (the real Movement is not on main).
  const movement = await ethers.deployContract("MovementMock");
  await Promise.all([
    reputation.waitForDeployment(),
    movement.waitForDeployment(),
  ]);

  return { reputation, movement, owner, verifier, alice, bob };
}

describe("Reputation", function () {
  it("grants the initial amount on register and updates stats", async function () {
    const { reputation, alice } = await deployFixture();
    const aliceAddr = await alice.getAddress();

    await reputation.connect(alice).register();

    expect(await reputation.balanceOf(aliceAddr)).to.equal(INIT);
    expect(await reputation.isRegistered(aliceAddr)).to.equal(true);
    expect(await reputation.userCount()).to.equal(1n);
    expect(await reputation.totalReputation()).to.equal(INIT);
  });

  it("reverts on a double register", async function () {
    const { reputation, alice } = await deployFixture();
    const aliceAddr = await alice.getAddress();

    await reputation.connect(alice).register();

    await expect(reputation.connect(alice).register())
      .to.be.revertedWithCustomError(reputation, "AlreadyRegistered")
      .withArgs(aliceAddr);
  });

  it("only the configured verifier can reward attendance", async function () {
    const { reputation, owner, alice } = await deployFixture();

    // Default caller is the owner (signer 0); no verifier has been set.
    await expect(
      reputation.rewardAttendance(await alice.getAddress(), 1n),
    )
      .to.be.revertedWithCustomError(reputation, "NotAttendanceVerifier")
      .withArgs(await owner.getAddress());
  });

  it("credits the reward and auto-registers a first-time attendee", async function () {
    const { reputation, verifier, alice } = await deployFixture();
    const aliceAddr = await alice.getAddress();

    await reputation.setAttendanceVerifier(await verifier.getAddress());
    await reputation.connect(verifier).rewardAttendance(aliceAddr, 1n);

    expect(await reputation.balanceOf(aliceAddr)).to.equal(INIT + REWARD);
    expect(await reputation.isRegistered(aliceAddr)).to.equal(true);
    expect(await reputation.userCount()).to.equal(1n);
    expect(await reputation.attendanceRewarded(1n, aliceAddr)).to.equal(true);
  });

  it("is idempotent per (movement, participant)", async function () {
    const { reputation, verifier, alice } = await deployFixture();
    const aliceAddr = await alice.getAddress();

    await reputation.setAttendanceVerifier(await verifier.getAddress());
    await reputation.connect(verifier).rewardAttendance(aliceAddr, 1n);

    await expect(reputation.connect(verifier).rewardAttendance(aliceAddr, 1n))
      .to.be.revertedWithCustomError(reputation, "AttendanceAlreadyRewarded")
      .withArgs(1n, aliceAddr);
  });

  it("does not grant a second initial to an already-registered user", async function () {
    const { reputation, verifier, alice } = await deployFixture();
    const aliceAddr = await alice.getAddress();

    await reputation.setAttendanceVerifier(await verifier.getAddress());
    await reputation.connect(alice).register(); // INIT
    await reputation.connect(verifier).rewardAttendance(aliceAddr, 7n); // + REWARD

    expect(await reputation.balanceOf(aliceAddr)).to.equal(INIT + REWARD);
    expect(await reputation.userCount()).to.equal(1n);
  });

  it("emits AttendanceRewarded", async function () {
    const { reputation, verifier, alice } = await deployFixture();
    const aliceAddr = await alice.getAddress();

    await reputation.setAttendanceVerifier(await verifier.getAddress());

    await expect(reputation.connect(verifier).rewardAttendance(aliceAddr, 1n))
      .to.emit(reputation, "AttendanceRewarded")
      .withArgs(aliceAddr, 1n, REWARD, INIT + REWARD);
  });

  it("computes average and recommended create requirement", async function () {
    const { reputation, verifier, alice, bob } = await deployFixture();

    await reputation.setAttendanceVerifier(await verifier.getAddress());
    await reputation.connect(alice).register(); // 100
    await reputation.connect(bob).register(); // 100
    await reputation
      .connect(verifier)
      .rewardAttendance(await alice.getAddress(), 1n); // alice -> 150

    // total = 250, users = 2, average = 125, recommended = 125 * 3 = 375
    expect(await reputation.averageReputation()).to.equal(125n);
    expect(await reputation.recommendedCreateRequirement()).to.equal(375n);
  });

  it("reverts sync when Movement is unset", async function () {
    const { reputation } = await deployFixture();

    await expect(
      reputation.syncCreateRequirement(),
    ).to.be.revertedWithCustomError(reputation, "MovementNotSet");
  });

  it("pushes the recommended requirement to Movement", async function () {
    const { reputation, movement, verifier, alice, bob } = await deployFixture();

    await reputation.setAttendanceVerifier(await verifier.getAddress());
    await reputation.setMovement(await movement.getAddress());
    await reputation.connect(alice).register();
    await reputation.connect(bob).register();
    await reputation
      .connect(verifier)
      .rewardAttendance(await alice.getAddress(), 1n);

    await reputation.syncCreateRequirement();

    expect(await movement.createRequirementCalled()).to.equal(true);
    expect(await movement.lastCreateRequirement()).to.equal(375n);
  });

  it("only the owner can set the verifier", async function () {
    const { reputation, verifier, alice } = await deployFixture();

    await expect(
      reputation.connect(alice).setAttendanceVerifier(await verifier.getAddress()),
    )
      .to.be.revertedWithCustomError(reputation, "OwnableUnauthorizedAccount")
      .withArgs(await alice.getAddress());
  });

  it("rejects the zero address for verifier and movement", async function () {
    const { reputation } = await deployFixture();

    await expect(
      reputation.setAttendanceVerifier(ZeroAddress),
    ).to.be.revertedWithCustomError(reputation, "ZeroAddress");

    await expect(
      reputation.setMovement(ZeroAddress),
    ).to.be.revertedWithCustomError(reputation, "ZeroAddress");
  });

  it("reputation = initial + N * reward after N distinct attendances", async function () {
    const { reputation, verifier, alice } = await deployFixture();
    const aliceAddr = await alice.getAddress();

    await reputation.setAttendanceVerifier(await verifier.getAddress());

    const n = 5n;
    for (let i = 0n; i < n; i++) {
      await reputation.connect(verifier).rewardAttendance(aliceAddr, i);
    }

    expect(await reputation.balanceOf(aliceAddr)).to.equal(INIT + n * REWARD);
  });
});
