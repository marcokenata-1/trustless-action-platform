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
import { AttendanceListener } from "../services/indexer/listener/index.js";
import { IndexerRpc } from "../services/indexer/runtime/index.js";
import { AttendanceStore } from "../services/indexer/store/index.js";

const { ethers } = await network.create();

const MOVEMENT_ID = 1n;
const REQUIRED_PEERS = 3;

describe("attendance indexer", function () {
  async function deployFixture() {
    const [participant, ...otherSigners] = await ethers.getSigners();
    const peers = otherSigners.slice(0, REQUIRED_PEERS);
    const movement = await ethers.deployContract("MovementMock");
    const reputation = await ethers.deployContract("ReputationMock");
    const verifier = await ethers.deployContract("AttendanceVerifier", [
      await movement.getAddress(),
      await reputation.getAddress(),
      REQUIRED_PEERS,
    ]);

    await movement.setActive(MOVEMENT_ID, true);
    await movement.setCommitted(
      MOVEMENT_ID,
      await participant.getAddress(),
      true,
    );
    for (const peer of peers) {
      await movement.setCommitted(MOVEMENT_ID, await peer.getAddress(), true);
    }

    const { chainId } = await ethers.provider.getNetwork();
    const verifierAddress = await verifier.getAddress();
    const domain = attendanceDomain(chainId, verifierAddress);

    const proofs: HandshakeProof[] = [];
    for (const peer of peers) {
      proofs.push(await signProof(participant, peer, domain, MOVEMENT_ID));
    }
    const sortedProofs = sortHandshakeProofs(proofs);
    const attendance = buildAttendance(
      domain,
      sortedProofs,
      REQUIRED_PEERS,
    );
    const participantSignature = await signAttendance(
      participant,
      domain,
      attendance,
    );

    const store = new AttendanceStore(":memory:");
    const chain = new IndexerRpc(ethers.provider, verifierAddress);
    const listener = new AttendanceListener(chain, store, 0);
    const app = createIndexerApp(store, listener);

    return {
      app,
      store,
      listener,
      participant,
      verifier,
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
        MOVEMENT_ID,
        participantAddress,
        fixture.sortedProofs.map(toContractProof),
        fixture.participantSignature,
      );
    await submission.wait();

    const sync = await request(fixture.app).post("/sync").expect(200);
    expect(sync.body.eventsSeen).to.equal(1);
    expect(sync.body.eventsInserted).to.equal(1);

    const byMovement = await request(fixture.app)
      .get("/attendance")
      .query({ movementId: MOVEMENT_ID.toString() })
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
        movementId: MOVEMENT_ID.toString(),
        participant: participantAddress,
      })
      .expect(200);
    expect(filtered.body.events).to.have.length(1);

    const status = await request(fixture.app).get("/sync/status").expect(200);
    expect(status.body.lastIndexedBlock).to.be.a("number");

    const again = await request(fixture.app).post("/sync").expect(200);
    expect(again.body.eventsInserted).to.equal(0);

    fixture.store.close();
  });

  it("returns empty events before any attendance is submitted", async function () {
    const fixture = await deployFixture();

    await request(fixture.app).post("/sync").expect(200);

    const response = await request(fixture.app)
      .get("/attendance")
      .query({ movementId: "1" })
      .expect(200);

    expect(response.body.events).to.deep.equal([]);
    fixture.store.close();
  });
});
