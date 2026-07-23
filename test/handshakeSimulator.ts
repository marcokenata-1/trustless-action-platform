import { expect } from "chai";
import { getAddress } from "ethers";
import type { Signer, TypedDataDomain } from "ethers";
import { network } from "hardhat";
import request from "supertest";

import { attendanceDomain } from "../shared/attendance.js";
import type { HandshakeProof } from "../shared/attendance.js";
import { createSimulatorApp } from "../services/simulator/app.js";
import type {
  SimulatorRuntime,
  SubmissionResult,
} from "../services/simulator/runtime/index.js";
import { HandshakeStore } from "../services/simulator/store/index.js";

const { ethers } = await network.create();

describe("handshake simulator API", function () {
  async function deployFixture() {
    const [participant, peerA, peerB, peerC] = await ethers.getSigners();
    const signers = [participant, peerA, peerB, peerC];
    const movement = await ethers.deployContract("MovementMock");
    const reputation = await ethers.deployContract("ReputationMock");
    const verifier = await ethers.deployContract("AttendanceVerifier", [
      await movement.getAddress(),
      await reputation.getAddress(),
      3,
    ]);
    const movementId = 1n;

    await movement.setActive(movementId, true);
    for (const signer of signers.slice(0, 4)) {
      await movement.setCommitted(
        movementId,
        await signer.getAddress(),
        true,
      );
    }

    const { chainId } = await ethers.provider.getNetwork();
    const domain = attendanceDomain(
      chainId,
      await verifier.getAddress(),
    );
    const signersByAddress = new Map<string, Signer>();
    for (const signer of signers) {
      signersByAddress.set(
        getAddress(await signer.getAddress()),
        signer,
      );
    }

    const runtime: SimulatorRuntime = {
      async getDomain(): Promise<TypedDataDomain> {
        return domain;
      },

      async getSigner(address: string): Promise<Signer> {
        const signer = signersByAddress.get(getAddress(address));
        if (!signer) {
          throw new Error(`Account ${address} is not unlocked`);
        }
        return signer;
      },

      async getRequiredPeerCount(): Promise<number> {
        return 3;
      },

      async submitAttendance(
        submittedMovementId: bigint,
        submittedParticipant: string,
        proofs: readonly HandshakeProof[],
        participantSignature: string,
      ): Promise<SubmissionResult> {
        const signer = await this.getSigner(submittedParticipant);
        const transaction = await verifier
          .connect(signer)
          .submitAttendance(
            submittedMovementId,
            submittedParticipant,
            proofs.map((proof) => ({
              peer: proof.peer,
              nonce: proof.nonce,
              timestamp: proof.timestamp,
              peerSignature: proof.peerSignature,
            })),
            participantSignature,
          );
        const receipt = await transaction.wait();
        return {
          transactionHash: transaction.hash,
          blockNumber: receipt?.blockNumber ?? null,
        };
      },
    };
    const handshakeStore = new HandshakeStore(":memory:");

    return {
      app: createSimulatorApp(runtime, handshakeStore),
      participant,
      peers: [peerA, peerB, peerC],
      movementId,
      reputation,
    };
  }

  async function createProofs(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
  ): Promise<Record<string, unknown>[]> {
    const proofs: Record<string, unknown>[] = [];
    const participantAddress = await fixture.participant.getAddress();

    for (const peer of [...fixture.peers].reverse()) {
      const response = await request(fixture.app)
        .post("/simulate/handshake")
        .send({
          movementId: fixture.movementId.toString(),
          partyA: participantAddress,
          partyB: await peer.getAddress(),
          timestamp: "1700000000",
        })
        .expect(200);
      const participantProof = response.body.proofs.find(
        (proof: { participant: string }) =>
          proof.participant === participantAddress,
      );
      expect(participantProof).not.to.equal(undefined);
      proofs.push(participantProof);
    }

    return proofs;
  }

  it("creates, attests and submits attendance without NFC devices", async function () {
    const fixture = await deployFixture();
    const proofs = await createProofs(fixture);

    const attestation = await request(fixture.app)
      .post("/simulate/attest")
      .send({ proofs })
      .expect(200);

    const peerAddresses = attestation.body.proofs.map(
      (proof: { peer: string }) => BigInt(proof.peer),
    );
    expect(peerAddresses[0]).to.be.lessThan(peerAddresses[1]);
    expect(peerAddresses[1]).to.be.lessThan(peerAddresses[2]);
    expect(attestation.body.attendance.requiredPeerCount).to.equal("3");

    const submission = await request(fixture.app)
      .post("/submit")
      .send({
        proofs: attestation.body.proofs,
        participantSignature: attestation.body.participantSignature,
      })
      .expect(200);

    expect(submission.body.transactionHash).to.match(/^0x[0-9a-f]{64}$/);
    expect(submission.body.movementId).to.equal("1");
    expect(
      await fixture.reputation.attendanceRewards(
        await fixture.participant.getAddress(),
      ),
    ).to.equal(1n);
  });

  it("rejects a tampered peer proof before submission", async function () {
    const fixture = await deployFixture();
    const proofs = await createProofs(fixture);
    proofs[0] = {
      ...proofs[0],
      nonce: ethers.id("tampered"),
    };

    const response = await request(fixture.app)
      .post("/simulate/attest")
      .send({ proofs })
      .expect(400);

    expect(response.body.error).to.include("Invalid peer signature");
  });

  it("creates one mutual session for concurrent reversed requests", async function () {
    const fixture = await deployFixture();
    const partyA = await fixture.participant.getAddress();
    const partyB = await fixture.peers[0].getAddress();
    const payload = {
      movementId: fixture.movementId.toString(),
      partyA,
      partyB,
      timestamp: "1700000000",
    };

    const [first, second] = await Promise.all([
      request(fixture.app).post("/simulate/handshake").send(payload),
      request(fixture.app)
        .post("/simulate/handshake")
        .send({ ...payload, partyA: partyB, partyB: partyA }),
    ]);

    expect(first.status).to.equal(200);
    expect(second.status).to.equal(200);
    expect([first.body.created, second.body.created].sort()).to.deep.equal([
      false,
      true,
    ]);
    expect(first.body.proofs).to.deep.equal(second.body.proofs);
    expect(first.body.proofs).to.have.length(2);
    expect(
      first.body.proofs.map(
        (proof: { participant: string }) => proof.participant,
      ),
    ).to.have.members([partyA, partyB]);
  });
});
