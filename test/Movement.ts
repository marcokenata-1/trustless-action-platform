import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const CREATE_REQUIREMENT = 100n;
const BLOCKS_PER_DAY = 7200n;
const DEMO_CID = "QmTestCid";

async function deployFixture() {
  const [deployer, requirementUpdater, organiser, alice, bob, carol, dave] =
    await ethers.getSigners();

  const reputationMock = await ethers.deployContract("ReputationMock");
  await reputationMock.waitForDeployment();

  const movement = await ethers.deployContract("Movement", [
    await reputationMock.getAddress(),
    await requirementUpdater.getAddress(),
    CREATE_REQUIREMENT,
  ]);
  await movement.waitForDeployment();

  return {
    movement,
    reputationMock,
    deployer,
    requirementUpdater,
    organiser,
    alice,
    bob,
    carol,
    dave,
  };
}

async function mineBlocks(count: bigint) {
  await ethers.provider.send("hardhat_mine", ["0x" + count.toString(16)]);
}

async function createMovement(
  movement: any,
  reputationMock: any,
  organiser: any,
  threshold: bigint,
  durationDays: bigint,
  cid: string = DEMO_CID,
) {
  await reputationMock.setBalance(
    await organiser.getAddress(),
    CREATE_REQUIREMENT,
  );

  const movementId = await movement
    .connect(organiser)
    .createMovement.staticCall(threshold, durationDays, cid);

  await movement.connect(organiser).createMovement(threshold, durationDays, cid);

  return movementId as bigint;
}

describe("Movement", function () {
  describe("createMovement", function () {
    it("succeeds and stores correct data when the organiser has enough reputation", async function () {
      const { movement, reputationMock, organiser } = await deployFixture();
      const organiserAddr = await organiser.getAddress();
      await reputationMock.setBalance(organiserAddr, CREATE_REQUIREMENT);

      const threshold = 3n;
      const durationDays = 1n;

      const blockBefore = BigInt(await ethers.provider.getBlockNumber());

      const movementId = await movement
        .connect(organiser)
        .createMovement.staticCall(threshold, durationDays, DEMO_CID);

      await expect(
        movement.connect(organiser).createMovement(threshold, durationDays, DEMO_CID),
      )
        .to.emit(movement, "MovementCreated")
        .withArgs(
          movementId,
          organiserAddr,
          threshold,
          blockBefore + 1n + durationDays * BLOCKS_PER_DAY,
          DEMO_CID,
        );

      const stored = await movement.getMovement(movementId);
      expect(stored.organiserAddress).to.equal(organiserAddr);
      expect(stored.threshold).to.equal(threshold);
      expect(stored.ipfsCID).to.equal(DEMO_CID);
      expect(stored.currentTally).to.equal(0n);
      expect(stored.status).to.equal(0n);
    });

    it("reverts when the organiser's reputation is below createRequirement", async function () {
      const { movement, reputationMock, organiser } = await deployFixture();
      const organiserAddr = await organiser.getAddress();

      await reputationMock.setBalance(organiserAddr, CREATE_REQUIREMENT - 1n);

      await expect(
        movement.connect(organiser).createMovement(3n, 1n, DEMO_CID),
      ).to.be.revert(ethers);
    });

    it("assigns incrementing ids across multiple movements", async function () {
      const { movement, reputationMock, organiser } = await deployFixture();
      await reputationMock.setBalance(
        await organiser.getAddress(),
        CREATE_REQUIREMENT,
      );

      const firstId = await createMovement(
        movement,
        reputationMock,
        organiser,
        3n,
        1n,
      );
      const secondId = await createMovement(
        movement,
        reputationMock,
        organiser,
        3n,
        1n,
      );

      expect(secondId).to.equal(firstId + 1n);
    });
  });

  describe("setCreateRequirement", function () {
    it("lets the requirementUpdater change the value and emits the old/new amounts", async function () {
      const { movement, requirementUpdater } = await deployFixture();
      const newRequirement = 250n;

      await expect(
        movement.connect(requirementUpdater).setCreateRequirement(newRequirement),
      )
        .to.emit(movement, "CreateRequirementUpdated")
        .withArgs(CREATE_REQUIREMENT, newRequirement);

      expect(await movement.createRequirement()).to.equal(newRequirement);
    });

    it("reverts if anyone other than requirementUpdater calls it", async function () {
      const { movement, alice } = await deployFixture();

      await expect(
        movement.connect(alice).setCreateRequirement(999n),
      ).to.be.revertedWith("unauthorised");
    });
  });

  describe("commit", function () {
    it("succeeds, records the commit, and increments the tally", async function () {
      const { movement, reputationMock, organiser, alice } = await deployFixture();
      const movementId = await createMovement(
        movement,
        reputationMock,
        organiser,
        3n,
        1n,
      );
      const aliceAddr = await alice.getAddress();

      await expect(movement.connect(alice).commit(movementId))
        .to.emit(movement, "Committed")
        .withArgs(movementId, aliceAddr, 1n);

      expect(await movement.isCommitted(movementId, aliceAddr)).to.equal(true);
      const stored = await movement.getMovement(movementId);
      expect(stored.currentTally).to.equal(1n);
    });

    it("reverts on a double commit from the same address", async function () {
      const { movement, reputationMock, organiser, alice } = await deployFixture();
      const movementId = await createMovement(
        movement,
        reputationMock,
        organiser,
        3n,
        1n,
      );

      await movement.connect(alice).commit(movementId);

      await expect(movement.connect(alice).commit(movementId)).to.be.revert(ethers);
    });

    it("reverts once the deadline block has passed", async function () {
      const { movement, reputationMock, organiser, alice } = await deployFixture();
      const durationDays = 1n;
      const movementId = await createMovement(
        movement,
        reputationMock,
        organiser,
        3n,
        durationDays,
      );

      await mineBlocks(durationDays * BLOCKS_PER_DAY + 1n);

      await expect(movement.connect(alice).commit(movementId)).to.be.revert(ethers);
    });

    it("reverts when the movement is not Open (already Activated)", async function () {
      const { movement, reputationMock, organiser, alice, bob, carol, dave } =
        await deployFixture();
      const movementId = await createMovement(
        movement,
        reputationMock,
        organiser,
        2n,
        1n,
      );

      await movement.connect(alice).commit(movementId);
      await movement.connect(bob).commit(movementId);

      expect(await movement.getStatus(movementId)).to.equal(1n);

      await expect(movement.connect(carol).commit(movementId)).to.be.revert(ethers);
    });

    it("flips status to Activated exactly when the tally reaches the threshold, and only then", async function () {
      const { movement, reputationMock, organiser, alice, bob, carol } =
        await deployFixture();
      const threshold = 3n;
      const movementId = await createMovement(
        movement,
        reputationMock,
        organiser,
        threshold,
        1n,
      );

      await expect(movement.connect(alice).commit(movementId)).to.not.emit(
        movement,
        "MovementActivated",
      );
      await expect(movement.connect(bob).commit(movementId)).to.not.emit(
        movement,
        "MovementActivated",
      );
      expect(await movement.getStatus(movementId)).to.equal(0n);

      await expect(movement.connect(carol).commit(movementId))
        .to.emit(movement, "MovementActivated")
        .withArgs(movementId);

      expect(await movement.getStatus(movementId)).to.equal(1n);
      expect(await movement.isActive(movementId)).to.equal(true);
    });
  });

  describe("resolve", function () {
    it("cancels an Open, under-threshold movement once the deadline has passed", async function () {
      const { movement, reputationMock, organiser, alice } = await deployFixture();
      const durationDays = 1n;
      const movementId = await createMovement(
        movement,
        reputationMock,
        organiser,
        3n,
        durationDays,
      );
      await movement.connect(alice).commit(movementId);

      await mineBlocks(durationDays * BLOCKS_PER_DAY + 1n);

      await expect(movement.resolve(movementId))
        .to.emit(movement, "MovementCancelled")
        .withArgs(movementId);

      expect(await movement.getStatus(movementId)).to.equal(2n);
    });

    it("does NOT cancel a movement that already Activated, even after its deadline passes", async function () {
      const { movement, reputationMock, organiser, alice, bob } =
        await deployFixture();
      const durationDays = 1n;
      const movementId = await createMovement(
        movement,
        reputationMock,
        organiser,
        2n,
        durationDays,
      );

      await movement.connect(alice).commit(movementId);
      await movement.connect(bob).commit(movementId);

      await mineBlocks(durationDays * BLOCKS_PER_DAY + 1n);

      await expect(movement.resolve(movementId)).to.not.emit(
        movement,
        "MovementCancelled",
      );
      expect(await movement.getStatus(movementId)).to.equal(1n);
    });

    it("does nothing if the deadline hasn't passed yet", async function () {
      const { movement, reputationMock, organiser } = await deployFixture();
      const movementId = await createMovement(
        movement,
        reputationMock,
        organiser,
        3n,
        1n,
      );

      await expect(movement.resolve(movementId)).to.not.emit(
        movement,
        "MovementCancelled",
      );
      expect(await movement.getStatus(movementId)).to.equal(0n);
    });
  });

  describe("frozen state invariant", function () {
    it("a Cancelled movement can never accept a commit, and resolve() is a no-op on it afterwards", async function () {
      const { movement, reputationMock, organiser, alice } = await deployFixture();
      const durationDays = 1n;
      const movementId = await createMovement(
        movement,
        reputationMock,
        organiser,
        5n,
        durationDays,
      );

      await mineBlocks(durationDays * BLOCKS_PER_DAY + 1n);
      await movement.resolve(movementId);

      await expect(movement.connect(alice).commit(movementId)).to.be.revert(ethers);

      await expect(movement.resolve(movementId)).to.not.emit(
        movement,
        "MovementCancelled",
      );
      expect(await movement.getStatus(movementId)).to.equal(2n);
    });
  });

  describe("getters", function () {
    it("isCommitted reflects true only for addresses that actually committed", async function () {
      const { movement, reputationMock, organiser, alice, bob } =
        await deployFixture();
      const movementId = await createMovement(
        movement,
        reputationMock,
        organiser,
        5n,
        1n,
      );

      await movement.connect(alice).commit(movementId);

      expect(
        await movement.isCommitted(movementId, await alice.getAddress()),
      ).to.equal(true);
      expect(
        await movement.isCommitted(movementId, await bob.getAddress()),
      ).to.equal(false);
    });
  });
});
