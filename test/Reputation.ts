import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { network } from "hardhat";

const { ethers } = await network.create();

// Constructor args used by the fixture below.
const INIT = 100n; // initial grant
const REWARD = 50n; // per-attendance reward

async function deployFixture() {
  const [owner, verifier, alice, bob] = await ethers.getSigners();

  const reputation = await ethers.deployContract("Reputation", [INIT, REWARD]);
  await reputation.waitForDeployment();

  return { reputation, owner, verifier, alice, bob };
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

  it("can only be rewarded by the configured verifier", async function () {
    const { reputation, owner, alice } = await deployFixture();

    // Default caller is the owner (signer 0); no verifier has been set.
    await expect(reputation.rewardAttendance(await alice.getAddress(), 1n))
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

  it("exposes average reputation for the off-chain threshold service", async function () {
    const { reputation, verifier, alice, bob } = await deployFixture();

    await reputation.setAttendanceVerifier(await verifier.getAddress());
    await reputation.connect(alice).register(); // 100
    await reputation.connect(bob).register(); // 100
    await reputation
      .connect(verifier)
      .rewardAttendance(await alice.getAddress(), 1n); // alice -> 150

    // total = 250, users = 2, average = 125
    expect(await reputation.averageReputation()).to.equal(125n);

    const [total, users, average] = await reputation.getReputationStats();
    expect(total).to.equal(250n);
    expect(users).to.equal(2n);
    expect(average).to.equal(125n);
  });

  it("only the owner can set the verifier", async function () {
    const { reputation, verifier, alice } = await deployFixture();

    await expect(
      reputation.connect(alice).setAttendanceVerifier(await verifier.getAddress()),
    )
      .to.be.revertedWithCustomError(reputation, "OwnableUnauthorizedAccount")
      .withArgs(await alice.getAddress());
  });

  it("rejects the zero address for the verifier", async function () {
    const { reputation } = await deployFixture();

    await expect(
      reputation.setAttendanceVerifier(ZeroAddress),
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
