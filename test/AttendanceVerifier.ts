import { expect } from "chai";
import { ZeroAddress } from "ethers";
import type { Signer, TypedDataDomain } from "ethers";
import { network } from "hardhat";

import {
  ATTENDANCE_TYPES,
  attendanceDomain,
  buildAttendance,
  computeHandshakeDigest,
  computeProofsHash,
  createHandshake,
  signAttendance,
  signHandshake,
  sortHandshakeProofs,
} from "../shared/attendance.js";
import type {
  Attendance,
  Handshake,
  HandshakeProof,
} from "../shared/attendance.js";

const { ethers } = await network.create();

const MOVEMENT_ID = 1n;
const REQUIRED_PEERS = 3;

function toContractProof(proof: HandshakeProof) {
  return {
    peer: proof.peer,
    nonce: proof.nonce,
    timestamp: proof.timestamp,
    peerSignature: proof.peerSignature,
  };
}

async function signProof(
  participant: Signer,
  peer: Signer,
  domain: TypedDataDomain,
  overrides: Partial<Handshake> = {},
): Promise<HandshakeProof> {
  const handshake: Handshake = {
    ...createHandshake(
      MOVEMENT_ID,
      await participant.getAddress(),
      await peer.getAddress(),
      1_700_000_000n,
    ),
    ...overrides,
  };
  const peerSignature = await signHandshake(peer, domain, handshake);
  return { ...handshake, peerSignature };
}

async function deployFixture(peerCount = REQUIRED_PEERS) {
  const [participant, ...otherSigners] = await ethers.getSigners();
  const movement = await ethers.deployContract("MovementMock");
  const reputation = await ethers.deployContract("ReputationMock");
  const verifier = await ethers.deployContract("AttendanceVerifier", [
    await movement.getAddress(),
    await reputation.getAddress(),
    peerCount,
  ]);

  await Promise.all([
    movement.waitForDeployment(),
    reputation.waitForDeployment(),
    verifier.waitForDeployment(),
  ]);

  const { chainId } = await ethers.provider.getNetwork();
  const domain = attendanceDomain(chainId, await verifier.getAddress());

  await movement.setActive(MOVEMENT_ID, true);
  await movement.setCommitted(
    MOVEMENT_ID,
    await participant.getAddress(),
    true,
  );

  return {
    participant,
    peers: otherSigners.slice(0, 5),
    movement,
    reputation,
    verifier,
    domain,
  };
}

async function prepareClaim(
  fixture: Awaited<ReturnType<typeof deployFixture>>,
  peerCount = REQUIRED_PEERS,
) {
  const selectedPeers = fixture.peers.slice(0, peerCount);
  const proofs: HandshakeProof[] = [];

  for (const peer of selectedPeers) {
    await fixture.movement.setCommitted(
      MOVEMENT_ID,
      await peer.getAddress(),
      true,
    );
    proofs.push(await signProof(fixture.participant, peer, fixture.domain));
  }

  const sortedProofs = sortHandshakeProofs(proofs);
  const attendance = buildAttendance(
    fixture.domain,
    sortedProofs,
    REQUIRED_PEERS,
  );
  const participantSignature = await signAttendance(
    fixture.participant,
    fixture.domain,
    attendance,
  );

  return { sortedProofs, attendance, participantSignature };
}

describe("AttendanceVerifier", function () {
  it("accepts a three-peer claim and rewards the participant", async function () {
    const fixture = await deployFixture();
    const { sortedProofs, attendance, participantSignature } =
      await prepareClaim(fixture);
    const participantAddress = await fixture.participant.getAddress();
    const peers = sortedProofs.map((proof) => proof.peer);

    const transaction = fixture.verifier
      .connect(fixture.participant)
      .submitAttendance(
        MOVEMENT_ID,
        participantAddress,
        sortedProofs.map(toContractProof),
        participantSignature,
      );

    await expect(transaction)
      .to.emit(fixture.verifier, "AttendanceVerified")
      .withArgs(
        MOVEMENT_ID,
        participantAddress,
        attendance.proofsHash,
        3n,
        peers,
      );

    expect(
      await fixture.verifier.attendanceVerified(
        MOVEMENT_ID,
        participantAddress,
      ),
    ).to.equal(true);
    expect(
      await fixture.reputation.attendanceRewards(participantAddress),
    ).to.equal(1n);
    for (const proof of sortedProofs) {
      expect(
        await fixture.verifier.verifiedHandshakeDigests(
          computeHandshakeDigest(fixture.domain, proof),
        ),
      ).to.equal(true);
    }
  });

  it("accepts more proofs than the minimum quorum", async function () {
    const fixture = await deployFixture();
    const { sortedProofs, participantSignature } = await prepareClaim(
      fixture,
      4,
    );

    await fixture.verifier.submitAttendance(
      MOVEMENT_ID,
      await fixture.participant.getAddress(),
      sortedProofs.map(toContractProof),
      participantSignature,
    );

    expect(
      await fixture.reputation.attendanceRewards(
        await fixture.participant.getAddress(),
      ),
    ).to.equal(1n);
  });

  it("rejects an inactive movement", async function () {
    const fixture = await deployFixture();
    const { sortedProofs, participantSignature } = await prepareClaim(fixture);
    await fixture.movement.setActive(MOVEMENT_ID, false);

    await expect(
      fixture.verifier.submitAttendance(
        MOVEMENT_ID,
        await fixture.participant.getAddress(),
        sortedProofs.map(toContractProof),
        participantSignature,
      ),
    )
      .to.be.revertedWithCustomError(fixture.verifier, "MovementNotActive")
      .withArgs(MOVEMENT_ID);
  });

  it("rejects a participant who did not commit", async function () {
    const fixture = await deployFixture();
    const { sortedProofs, participantSignature } = await prepareClaim(fixture);
    const participantAddress = await fixture.participant.getAddress();
    await fixture.movement.setCommitted(MOVEMENT_ID, participantAddress, false);

    await expect(
      fixture.verifier.submitAttendance(
        MOVEMENT_ID,
        participantAddress,
        sortedProofs.map(toContractProof),
        participantSignature,
      ),
    ).to.be.revertedWithCustomError(
      fixture.verifier,
      "ParticipantNotCommitted",
    );
  });

  it("rejects a non-committed peer", async function () {
    const fixture = await deployFixture();
    const { sortedProofs, participantSignature } = await prepareClaim(fixture);
    const uncommittedPeer = sortedProofs[1].peer;
    await fixture.movement.setCommitted(MOVEMENT_ID, uncommittedPeer, false);

    await expect(
      fixture.verifier.submitAttendance(
        MOVEMENT_ID,
        await fixture.participant.getAddress(),
        sortedProofs.map(toContractProof),
        participantSignature,
      ),
    )
      .to.be.revertedWithCustomError(fixture.verifier, "PeerNotCommitted")
      .withArgs(MOVEMENT_ID, uncommittedPeer);
  });

  it("rejects fewer proofs than the configured quorum", async function () {
    const fixture = await deployFixture();
    const proofs: HandshakeProof[] = [];

    for (const peer of fixture.peers.slice(0, 2)) {
      await fixture.movement.setCommitted(
        MOVEMENT_ID,
        await peer.getAddress(),
        true,
      );
      proofs.push(await signProof(fixture.participant, peer, fixture.domain));
    }

    const sortedProofs = sortHandshakeProofs(proofs);
    const attendance: Attendance = {
      movementId: MOVEMENT_ID,
      participant: await fixture.participant.getAddress(),
      requiredPeerCount: 3n,
      proofsHash: computeProofsHash(fixture.domain, sortedProofs),
    };
    const participantSignature = await signAttendance(
      fixture.participant,
      fixture.domain,
      attendance,
    );

    await expect(
      fixture.verifier.submitAttendance(
        MOVEMENT_ID,
        attendance.participant,
        sortedProofs.map(toContractProof),
        participantSignature,
      ),
    )
      .to.be.revertedWithCustomError(fixture.verifier, "NotEnoughProofs")
      .withArgs(3n, 2n);
  });

  it("rejects duplicate or unsorted peers", async function () {
    const fixture = await deployFixture();
    const { sortedProofs } = await prepareClaim(fixture);
    const duplicateProofs = [sortedProofs[0], sortedProofs[0], sortedProofs[1]];
    const attendance: Attendance = {
      movementId: MOVEMENT_ID,
      participant: await fixture.participant.getAddress(),
      requiredPeerCount: 3n,
      proofsHash: computeProofsHash(fixture.domain, duplicateProofs),
    };
    const participantSignature = await signAttendance(
      fixture.participant,
      fixture.domain,
      attendance,
    );

    await expect(
      fixture.verifier.submitAttendance(
        MOVEMENT_ID,
        attendance.participant,
        duplicateProofs.map(toContractProof),
        participantSignature,
      ),
    ).to.be.revertedWithCustomError(fixture.verifier, "ProofsNotSorted");
  });

  it("rejects a self-handshake", async function () {
    const fixture = await deployFixture();
    const { sortedProofs } = await prepareClaim(fixture);
    const participantAddress = await fixture.participant.getAddress();
    const selfHandshake: Handshake = {
      movementId: MOVEMENT_ID,
      participant: participantAddress,
      peer: participantAddress,
      nonce: sortedProofs[0].nonce,
      timestamp: 1_700_000_000n,
    };
    const selfProof: HandshakeProof = {
      ...selfHandshake,
      peerSignature: await signHandshake(
        fixture.participant,
        fixture.domain,
        selfHandshake,
      ),
    };
    const proofs = sortHandshakeProofs([
      selfProof,
      sortedProofs[0],
      sortedProofs[1],
    ]);
    const attendance: Attendance = {
      movementId: MOVEMENT_ID,
      participant: participantAddress,
      requiredPeerCount: 3n,
      proofsHash: computeProofsHash(fixture.domain, proofs),
    };
    const participantSignature = await signAttendance(
      fixture.participant,
      fixture.domain,
      attendance,
    );

    await expect(
      fixture.verifier.submitAttendance(
        MOVEMENT_ID,
        participantAddress,
        proofs.map(toContractProof),
        participantSignature,
      ),
    )
      .to.be.revertedWithCustomError(fixture.verifier, "InvalidPeer")
      .withArgs(participantAddress);
  });

  it("rejects a tampered peer proof", async function () {
    const fixture = await deployFixture();
    const { sortedProofs } = await prepareClaim(fixture);
    sortedProofs[0] = {
      ...sortedProofs[0],
      nonce: ethers.id("tampered nonce"),
    };
    const attendance = buildAttendance(
      fixture.domain,
      sortedProofs,
      REQUIRED_PEERS,
    );
    const participantSignature = await signAttendance(
      fixture.participant,
      fixture.domain,
      attendance,
    );

    await expect(
      fixture.verifier.submitAttendance(
        MOVEMENT_ID,
        attendance.participant,
        sortedProofs.map(toContractProof),
        participantSignature,
      ),
    ).to.be.revertedWithCustomError(fixture.verifier, "InvalidPeerSignature");
  });

  it("rejects a signature from someone other than the participant", async function () {
    const fixture = await deployFixture();
    const { sortedProofs, attendance } = await prepareClaim(fixture);
    const wrongSignature = await fixture.peers[0].signTypedData(
      fixture.domain,
      ATTENDANCE_TYPES,
      attendance,
    );

    await expect(
      fixture.verifier.submitAttendance(
        MOVEMENT_ID,
        attendance.participant,
        sortedProofs.map(toContractProof),
        wrongSignature,
      ),
    ).to.be.revertedWithCustomError(
      fixture.verifier,
      "InvalidParticipantSignature",
    );
  });

  it("rejects replaying an accepted attendance claim", async function () {
    const fixture = await deployFixture();
    const { sortedProofs, participantSignature } = await prepareClaim(fixture);
    const participantAddress = await fixture.participant.getAddress();
    const contractProofs = sortedProofs.map(toContractProof);

    await fixture.verifier.submitAttendance(
      MOVEMENT_ID,
      participantAddress,
      contractProofs,
      participantSignature,
    );

    await expect(
      fixture.verifier.submitAttendance(
        MOVEMENT_ID,
        participantAddress,
        contractProofs,
        participantSignature,
      ),
    ).to.be.revertedWithCustomError(
      fixture.verifier,
      "AttendanceAlreadyVerified",
    );
  });

  it("rejects a deployment quorum below three", async function () {
    const movement = await ethers.deployContract("MovementMock");
    const reputation = await ethers.deployContract("ReputationMock");

    await expect(
      ethers.deployContract("AttendanceVerifier", [
        await movement.getAddress(),
        await reputation.getAddress(),
        2,
      ]),
    )
      .to.be.revertedWithCustomError(
        await ethers.getContractFactory("AttendanceVerifier"),
        "InvalidRequiredPeerCount",
      )
      .withArgs(2n);
  });

  it("rejects zero dependency addresses", async function () {
    const reputation = await ethers.deployContract("ReputationMock");

    await expect(
      ethers.deployContract("AttendanceVerifier", [
        ZeroAddress,
        await reputation.getAddress(),
        3,
      ]),
    ).to.be.revertedWithCustomError(
      await ethers.getContractFactory("AttendanceVerifier"),
      "ZeroAddress",
    );
  });
});
