import { expect } from "chai";
import { getAddress } from "ethers";
import { network } from "hardhat";
import request from "supertest";

import {
  attendanceDomain,
  buildAttendance,
  signAttendance,
  sortHandshakeProofs,
} from "../shared/attendance.js";
import type { HandshakeProof } from "../shared/attendance.js";
import { signProof, toContractProof } from "../shared/mapper.js";
import { createIndexerApp } from "../services/indexer/app.js";
import { IndexerListener } from "../services/indexer/listener/index.js";
import { IndexerRpc } from "../services/indexer/runtime/index.js";
import { IndexerStore } from "../services/indexer/store/index.js";
import {
  CREATE_REQUIREMENT,
  createMovementWithCommits,
  deployAttendanceContracts,
  MOVEMENT_CID,
  REPUTATION_ATTENDANCE_REWARD,
  REPUTATION_INITIAL_GRANT,
} from "./helpers/deployAttendanceContracts.js";

const { ethers } = await network.create();

const REQUIRED_PEERS = 3;

describe("indexer", function () {
  async function deployFixture() {
    const [owner, participant, ...otherSigners] = await ethers.getSigners();
    const peers = otherSigners.slice(0, REQUIRED_PEERS);
    const { movement, verifier, reputation } = await deployAttendanceContracts(
      ethers,
      REQUIRED_PEERS,
    );

    const movementId = await createMovementWithCommits(
      movement,
      participant,
      [participant, ...peers],
      BigInt(1 + peers.length),
    );

    const { chainId } = await ethers.provider.getNetwork();
    const verifierAddress = await verifier.getAddress();
    const movementAddress = await movement.getAddress();
    const reputationAddress = await reputation.getAddress();
    const domain = attendanceDomain(chainId, verifierAddress);

    const proofs: HandshakeProof[] = [];
    for (const peer of peers) {
      proofs.push(await signProof(participant, peer, domain, movementId));
    }
    const sortedProofs = sortHandshakeProofs(proofs);
    const attendance = buildAttendance(domain, sortedProofs, REQUIRED_PEERS);
    const participantSignature = await signAttendance(
      participant,
      domain,
      attendance,
    );

    const store = new IndexerStore(":memory:");
    const chain = new IndexerRpc(
      ethers.provider,
      verifierAddress,
      movementAddress,
      reputationAddress,
    );
    const listener = new IndexerListener(chain, store, 0);
    const app = createIndexerApp(store, listener);

    return {
      app,
      store,
      listener,
      owner,
      participant,
      peers,
      movement,
      reputation,
      verifier,
      verifierAddress,
      movementId,
      sortedProofs,
      attendance,
      participantSignature,
    };
  }

  it("indexes AttendanceVerified and serves it over HTTP", async function () {
    const fixture = await deployFixture();
    const participantAddress = await fixture.participant.getAddress();

    const submission = await fixture.verifier
      .connect(fixture.participant)
      .submitAttendance(
        fixture.movementId,
        participantAddress,
        fixture.sortedProofs.map(toContractProof),
        fixture.participantSignature,
      );
    await submission.wait();

    const sync = await request(fixture.app).post("/sync").expect(200);
    expect(sync.body.attendance.eventsSeen).to.equal(1);
    expect(sync.body.attendance.eventsInserted).to.equal(1);

    const byMovement = await request(fixture.app)
      .get("/attendance")
      .query({ movementId: fixture.movementId.toString() })
      .expect(200);

    expect(byMovement.body.events).to.have.length(1);
    expect(byMovement.body.events[0].participant).to.equal(
      getAddress(participantAddress),
    );
    expect(byMovement.body.events[0].proofsHash).to.equal(
      fixture.attendance.proofsHash,
    );
    expect(byMovement.body.events[0].proofCount).to.equal(3);
    expect(byMovement.body.events[0].peers).to.have.length(3);

    const filtered = await request(fixture.app)
      .get("/attendance")
      .query({
        movementId: fixture.movementId.toString(),
        participant: participantAddress,
      })
      .expect(200);
    expect(filtered.body.events).to.have.length(1);

    const status = await request(fixture.app).get("/sync/status").expect(200);
    expect(status.body.attendance.lastIndexedBlock).to.be.a("number");
    expect(status.body.movement.lastIndexedBlock).to.be.a("number");
    expect(status.body.reputation.lastIndexedBlock).to.be.a("number");

    const again = await request(fixture.app).post("/sync").expect(200);
    expect(again.body.attendance.eventsInserted).to.equal(0);

    fixture.store.close();
  });

  it("returns empty attendance events before any submission", async function () {
    const fixture = await deployFixture();

    await request(fixture.app).post("/sync").expect(200);

    const response = await request(fixture.app)
      .get("/attendance")
      .query({ movementId: fixture.movementId.toString() })
      .expect(200);

    expect(response.body.events).to.deep.equal([]);
    fixture.store.close();
  });

  it("indexes Movement lifecycle events and serves projections", async function () {
    const fixture = await deployFixture();
    const participantAddress = await fixture.participant.getAddress();
    const peerAddresses = await Promise.all(
      fixture.peers.map((peer) => peer.getAddress()),
    );

    const sync = await request(fixture.app).post("/sync").expect(200);
    // create + 4 commits + 1 activation = 6 movement events from the fixture setup
    expect(sync.body.movement.eventsSeen).to.equal(6);
    expect(sync.body.movement.eventsInserted).to.equal(6);

    const list = await request(fixture.app).get("/movements").expect(200);
    expect(list.body.movements).to.have.length(1);
    expect(list.body.movements[0]).to.include({
      organiser: getAddress(participantAddress),
      cid: MOVEMENT_CID,
      status: "Activated",
    });
    expect(list.body.movements[0].movementId).to.equal(
      fixture.movementId.toString(),
    );
    expect(list.body.movements[0].tally).to.equal("4");
    expect(list.body.movements[0].threshold).to.equal("4");

    const detail = await request(fixture.app)
      .get(`/movements/${fixture.movementId.toString()}`)
      .expect(200);
    expect(detail.body.movement.status).to.equal("Activated");
    expect(detail.body.commits).to.have.length(4);
    expect(
      detail.body.commits.map((commit: { committer: string }) =>
        getAddress(commit.committer),
      ),
    ).to.have.members([
      getAddress(participantAddress),
      ...peerAddresses.map((address) => getAddress(address)),
    ]);

    const events = await request(fixture.app)
      .get("/movement-events")
      .query({ movementId: fixture.movementId.toString() })
      .expect(200);
    expect(
      events.body.events.map((event: { eventType: string }) => event.eventType),
    ).to.deep.equal([
      "MovementCreated",
      "Committed",
      "Committed",
      "Committed",
      "MovementActivated",
      "Committed",
    ]);

    const again = await request(fixture.app).post("/sync").expect(200);
    expect(again.body.movement.eventsInserted).to.equal(0);

    fixture.store.close();
  });

  it("indexes CreateRequirementUpdated and MovementCancelled", async function () {
    const fixture = await deployFixture();
    await request(fixture.app).post("/sync").expect(200);

    const openId = await fixture.movement
      .connect(fixture.participant)
      .createMovement.staticCall(2n, 1n, "ipfs://cancel-me");
    await (
      await fixture.movement
        .connect(fixture.participant)
        .createMovement(2n, 1n, "ipfs://cancel-me")
    ).wait();

    await (
      await fixture.movement
        .connect(fixture.owner)
        .setCreateRequirement(CREATE_REQUIREMENT + 1n)
    ).wait();

    await ethers.provider.send("hardhat_mine", ["0x1C21"]);
    await (await fixture.movement.resolve(openId)).wait();

    const sync = await request(fixture.app).post("/sync").expect(200);
    expect(sync.body.movement.eventsInserted).to.be.greaterThan(0);

    const updates = await request(fixture.app)
      .get("/create-requirement-updates")
      .expect(200);
    expect(updates.body.updates).to.have.length(1);
    expect(updates.body.updates[0].oldRequirement).to.equal(
      CREATE_REQUIREMENT.toString(),
    );
    expect(updates.body.updates[0].newRequirement).to.equal(
      (CREATE_REQUIREMENT + 1n).toString(),
    );

    const cancelled = await request(fixture.app)
      .get(`/movements/${openId.toString()}`)
      .expect(200);
    expect(cancelled.body.movement.status).to.equal("Cancelled");
    expect(cancelled.body.movement.cid).to.equal("ipfs://cancel-me");

    fixture.store.close();
  });

  it("indexes Reputation events including rewards and admin updates", async function () {
    const fixture = await deployFixture();
    const participantAddress = await fixture.participant.getAddress();

    await (
      await fixture.reputation
        .connect(fixture.owner)
        .setInitialGrant(REPUTATION_INITIAL_GRANT + 1n)
    ).wait();
    await (
      await fixture.reputation
        .connect(fixture.owner)
        .setAttendanceReward(REPUTATION_ATTENDANCE_REWARD + 1n)
    ).wait();

    const submission = await fixture.verifier
      .connect(fixture.participant)
      .submitAttendance(
        fixture.movementId,
        participantAddress,
        fixture.sortedProofs.map(toContractProof),
        fixture.participantSignature,
      );
    await submission.wait();

    const sync = await request(fixture.app).post("/sync").expect(200);
    expect(sync.body.reputation.eventsInserted).to.be.greaterThan(0);

    const all = await request(fixture.app).get("/reputation-events").expect(200);
    const types = all.body.events.map(
      (event: { eventType: string }) => event.eventType,
    );
    expect(types).to.include("AttendanceVerifierUpdated");
    expect(types).to.include("InitialGrantUpdated");
    expect(types).to.include("AttendanceRewardUpdated");
    expect(types).to.include("Registered");
    expect(types).to.include("AttendanceRewarded");

    const rewarded = await request(fixture.app)
      .get("/reputation-events")
      .query({
        eventType: "AttendanceRewarded",
        participant: participantAddress,
        movementId: fixture.movementId.toString(),
      })
      .expect(200);
    expect(rewarded.body.events).to.have.length(1);
    expect(rewarded.body.events[0].amount).to.equal(
      (REPUTATION_ATTENDANCE_REWARD + 1n).toString(),
    );

    fixture.store.close();
  });

  it("continues syncing the other stream when one stream fails", async function () {
    const fixture = await deployFixture();
    const verifierAddress = await fixture.verifier.getAddress();
    const movementAddress = await fixture.movement.getAddress();
    const reputationAddress = await fixture.reputation.getAddress();

    const base = new IndexerRpc(
      ethers.provider,
      verifierAddress,
      movementAddress,
      reputationAddress,
    );
    const flakyChain = {
      getLatestBlockNumber: () => base.getLatestBlockNumber(),
      queryAttendanceVerified: async () => {
        throw new Error("attendance rpc blew up");
      },
      queryMovementEvents: (from: number, to: number) =>
        base.queryMovementEvents(from, to),
      queryReputationEvents: (from: number, to: number) =>
        base.queryReputationEvents(from, to),
    };

    const store = new IndexerStore(":memory:");
    const listener = new IndexerListener(flakyChain, store, 0);
    const app = createIndexerApp(store, listener);

    const sync = await request(app).post("/sync").expect(200);
    expect(sync.body.attendance.error).to.equal("attendance rpc blew up");
    expect(sync.body.attendance.eventsInserted).to.equal(0);
    expect(sync.body.movement.error).to.equal(undefined);
    expect(sync.body.movement.eventsInserted).to.equal(6);
    expect(sync.body.reputation.error).to.equal(undefined);
    expect(sync.body.reputation.eventsInserted).to.be.greaterThan(0);

    const movements = await request(app).get("/movements").expect(200);
    expect(movements.body.movements).to.have.length(1);

    store.close();
    fixture.store.close();
  });
});
