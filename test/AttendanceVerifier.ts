import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { network } from "hardhat";

import {
  ATTENDANCE_TYPES,
  attendanceDomain,
  buildAttendance,
  computeHandshakeDigest,
  computeProofsHash,
  signAttendance,
  signHandshake,
  sortHandshakeProofs,
} from "../shared/attendance.js";
import type {
  Attendance,
  Handshake,
  HandshakeProof,
} from "../shared/attendance.js";
import { signProof, toContractProof } from "../shared/mapper.js";
import {
  CREATE_REQUIREMENT,
  createMovementWithCommits,
  deployAttendanceContracts,
  REPUTATION_ATTENDANCE_REWARD,
  REPUTATION_INITIAL_GRANT,
} from "./helpers/deployAttendanceContracts.js";

const { ethers } = await network.create();

const REQUIRED_PEERS = 3;

async function deployFixture(requiredPeerCount = REQUIRED_PEERS) {
  const [participant, ...otherSigners] = await ethers.getSigners();
  const { movement, reputation, verifier } = await deployAttendanceContracts(
    ethers,
    requiredPeerCount
  );

  const { chainId } = await ethers.provider.getNetwork();
  const domain = attendanceDomain(chainId, await verifier.getAddress());

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
  peerCount = REQUIRED_PEERS
) {
  const selectedPeers = fixture.peers.slice(0, peerCount);
  const committers = [fixture.participant, ...selectedPeers];
  const movementId = await createMovementWithCommits(
    fixture.movement,
    fixture.participant,
    committers,
    BigInt(committers.length)
  );

  const proofs: HandshakeProof[] = [];
  for (const peer of selectedPeers) {
    proofs.push(
      await signProof(fixture.participant, peer, fixture.domain, movementId)
    );
  }

  const sortedProofs = sortHandshakeProofs(proofs);
  const attendance = buildAttendance(
    fixture.domain,
    sortedProofs,
    REQUIRED_PEERS
  );
  const participantSignature = await signAttendance(
    fixture.participant,
    fixture.domain,
    attendance
  );

  return { movementId, sortedProofs, attendance, participantSignature };
}

describe("AttendanceVerifier", function () {
  it("accepts a three-peer claim and rewards the participant", async function () {
    const fixture = await deployFixture();
    const { movementId, sortedProofs, attendance, participantSignature } =
      await prepareClaim(fixture);
    const participantAddress = await fixture.participant.getAddress();
    const peers = sortedProofs.map((proof) => proof.peer);

    const transaction = fixture.verifier
      .connect(fixture.participant)
      .submitAttendance(
        movementId,
        participantAddress,
        sortedProofs.map(toContractProof),
        participantSignature
      );

    await expect(transaction)
      .to.emit(fixture.verifier, "AttendanceVerified")
      .withArgs(
        movementId,
        participantAddress,
        attendance.proofsHash,
        3n,
        peers
      );

    expect(
      await fixture.verifier.attendanceVerified(movementId, participantAddress)
    ).to.equal(true);
    expect(
      await fixture.reputation.attendanceRewarded(
        movementId,
        participantAddress
      )
    ).to.equal(true);
    expect(await fixture.reputation.balanceOf(participantAddress)).to.equal(
      REPUTATION_INITIAL_GRANT + REPUTATION_ATTENDANCE_REWARD
    );
    for (const proof of sortedProofs) {
      expect(
        await fixture.verifier.verifiedHandshakeDigests(
          computeHandshakeDigest(fixture.domain, proof)
        )
      ).to.equal(true);
    }
  });

  it("accepts more proofs than the minimum quorum", async function () {
    const fixture = await deployFixture();
    const { movementId, sortedProofs, participantSignature } =
      await prepareClaim(fixture, 4);

    await fixture.verifier.submitAttendance(
      movementId,
      await fixture.participant.getAddress(),
      sortedProofs.map(toContractProof),
      participantSignature
    );

    expect(
      await fixture.reputation.attendanceRewarded(
        movementId,
        await fixture.participant.getAddress()
      )
    ).to.equal(true);
  });

  it("rejects an inactive movement", async function () {
    const fixture = await deployFixture();
    const selectedPeers = fixture.peers.slice(0, REQUIRED_PEERS);
    // High threshold keeps status Open (not Activated).
    const movementId = await createMovementWithCommits(
      fixture.movement,
      fixture.participant,
      [fixture.participant, ...selectedPeers],
      100n
    );

    const proofs: HandshakeProof[] = [];
    for (const peer of selectedPeers) {
      proofs.push(
        await signProof(fixture.participant, peer, fixture.domain, movementId)
      );
    }
    const sortedProofs = sortHandshakeProofs(proofs);
    const attendance = buildAttendance(
      fixture.domain,
      sortedProofs,
      REQUIRED_PEERS
    );
    const participantSignature = await signAttendance(
      fixture.participant,
      fixture.domain,
      attendance
    );

    await expect(
      fixture.verifier.submitAttendance(
        movementId,
        await fixture.participant.getAddress(),
        sortedProofs.map(toContractProof),
        participantSignature
      )
    )
      .to.be.revertedWithCustomError(fixture.verifier, "MovementNotActive")
      .withArgs(movementId);
  });

  it("rejects a participant who did not commit", async function () {
    const fixture = await deployFixture();
    const selectedPeers = fixture.peers.slice(0, REQUIRED_PEERS);
    // Activate with peers only; participant never commits.
    const movementId = await createMovementWithCommits(
      fixture.movement,
      fixture.participant,
      selectedPeers,
      BigInt(selectedPeers.length)
    );

    const proofs: HandshakeProof[] = [];
    for (const peer of selectedPeers) {
      proofs.push(
        await signProof(fixture.participant, peer, fixture.domain, movementId)
      );
    }
    const sortedProofs = sortHandshakeProofs(proofs);
    const attendance = buildAttendance(
      fixture.domain,
      sortedProofs,
      REQUIRED_PEERS
    );
    const participantSignature = await signAttendance(
      fixture.participant,
      fixture.domain,
      attendance
    );
    const participantAddress = await fixture.participant.getAddress();

    await expect(
      fixture.verifier.submitAttendance(
        movementId,
        participantAddress,
        sortedProofs.map(toContractProof),
        participantSignature
      )
    ).to.be.revertedWithCustomError(
      fixture.verifier,
      "ParticipantNotCommitted"
    );
  });

  it("rejects a non-committed peer", async function () {
    const fixture = await deployFixture();
    const selectedPeers = fixture.peers.slice(0, REQUIRED_PEERS);
    const committedPeers = selectedPeers.slice(0, 2);
    const uncommittedPeerSigner = selectedPeers[2];
    const movementId = await createMovementWithCommits(
      fixture.movement,
      fixture.participant,
      [fixture.participant, ...committedPeers],
      3n
    );

    const proofs: HandshakeProof[] = [];
    for (const peer of selectedPeers) {
      proofs.push(
        await signProof(fixture.participant, peer, fixture.domain, movementId)
      );
    }
    const sortedProofs = sortHandshakeProofs(proofs);
    const attendance = buildAttendance(
      fixture.domain,
      sortedProofs,
      REQUIRED_PEERS
    );
    const participantSignature = await signAttendance(
      fixture.participant,
      fixture.domain,
      attendance
    );
    const uncommittedPeer = await uncommittedPeerSigner.getAddress();

    await expect(
      fixture.verifier.submitAttendance(
        movementId,
        await fixture.participant.getAddress(),
        sortedProofs.map(toContractProof),
        participantSignature
      )
    )
      .to.be.revertedWithCustomError(fixture.verifier, "PeerNotCommitted")
      .withArgs(movementId, uncommittedPeer);
  });

  it("rejects fewer proofs than the configured quorum", async function () {
    const fixture = await deployFixture();
    const selectedPeers = fixture.peers.slice(0, 2);
    const movementId = await createMovementWithCommits(
      fixture.movement,
      fixture.participant,
      [fixture.participant, ...selectedPeers],
      3n
    );

    const proofs: HandshakeProof[] = [];
    for (const peer of selectedPeers) {
      proofs.push(
        await signProof(fixture.participant, peer, fixture.domain, movementId)
      );
    }

    const sortedProofs = sortHandshakeProofs(proofs);
    const attendance: Attendance = {
      movementId,
      participant: await fixture.participant.getAddress(),
      requiredPeerCount: 3n,
      proofsHash: computeProofsHash(fixture.domain, sortedProofs),
    };
    const participantSignature = await signAttendance(
      fixture.participant,
      fixture.domain,
      attendance
    );

    await expect(
      fixture.verifier.submitAttendance(
        movementId,
        attendance.participant,
        sortedProofs.map(toContractProof),
        participantSignature
      )
    )
      .to.be.revertedWithCustomError(fixture.verifier, "NotEnoughProofs")
      .withArgs(3n, 2n);
  });

  it("rejects duplicate or unsorted peers", async function () {
    const fixture = await deployFixture();
    const { movementId, sortedProofs } = await prepareClaim(fixture);
    const duplicateProofs = [sortedProofs[0], sortedProofs[0], sortedProofs[1]];
    const attendance: Attendance = {
      movementId,
      participant: await fixture.participant.getAddress(),
      requiredPeerCount: 3n,
      proofsHash: computeProofsHash(fixture.domain, duplicateProofs),
    };
    const participantSignature = await signAttendance(
      fixture.participant,
      fixture.domain,
      attendance
    );

    await expect(
      fixture.verifier.submitAttendance(
        movementId,
        attendance.participant,
        duplicateProofs.map(toContractProof),
        participantSignature
      )
    ).to.be.revertedWithCustomError(fixture.verifier, "ProofsNotSorted");
  });

  it("rejects a self-handshake", async function () {
    const fixture = await deployFixture();
    const { movementId, sortedProofs } = await prepareClaim(fixture);
    const participantAddress = await fixture.participant.getAddress();
    const selfHandshake: Handshake = {
      movementId,
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
        selfHandshake
      ),
    };
    const proofs = sortHandshakeProofs([
      selfProof,
      sortedProofs[0],
      sortedProofs[1],
    ]);
    const attendance: Attendance = {
      movementId,
      participant: participantAddress,
      requiredPeerCount: 3n,
      proofsHash: computeProofsHash(fixture.domain, proofs),
    };
    const participantSignature = await signAttendance(
      fixture.participant,
      fixture.domain,
      attendance
    );

    await expect(
      fixture.verifier.submitAttendance(
        movementId,
        participantAddress,
        proofs.map(toContractProof),
        participantSignature
      )
    )
      .to.be.revertedWithCustomError(fixture.verifier, "InvalidPeer")
      .withArgs(participantAddress);
  });

  it("rejects a tampered peer proof", async function () {
    const fixture = await deployFixture();
    const { movementId, sortedProofs } = await prepareClaim(fixture);
    sortedProofs[0] = {
      ...sortedProofs[0],
      nonce: ethers.id("tampered nonce"),
    };
    const attendance = buildAttendance(
      fixture.domain,
      sortedProofs,
      REQUIRED_PEERS
    );
    const participantSignature = await signAttendance(
      fixture.participant,
      fixture.domain,
      attendance
    );

    await expect(
      fixture.verifier.submitAttendance(
        movementId,
        attendance.participant,
        sortedProofs.map(toContractProof),
        participantSignature
      )
    ).to.be.revertedWithCustomError(fixture.verifier, "InvalidPeerSignature");
  });

  it("rejects a signature from someone other than the participant", async function () {
    const fixture = await deployFixture();
    const { movementId, sortedProofs, attendance } = await prepareClaim(
      fixture
    );
    const wrongSignature = await fixture.peers[0].signTypedData(
      fixture.domain,
      ATTENDANCE_TYPES,
      attendance
    );

    await expect(
      fixture.verifier.submitAttendance(
        movementId,
        attendance.participant,
        sortedProofs.map(toContractProof),
        wrongSignature
      )
    ).to.be.revertedWithCustomError(
      fixture.verifier,
      "InvalidParticipantSignature"
    );
  });

  it("rejects replaying an accepted attendance claim", async function () {
    const fixture = await deployFixture();
    const { movementId, sortedProofs, participantSignature } =
      await prepareClaim(fixture);
    const participantAddress = await fixture.participant.getAddress();
    const contractProofs = sortedProofs.map(toContractProof);

    await fixture.verifier.submitAttendance(
      movementId,
      participantAddress,
      contractProofs,
      participantSignature
    );

    await expect(
      fixture.verifier.submitAttendance(
        movementId,
        participantAddress,
        contractProofs,
        participantSignature
      )
    ).to.be.revertedWithCustomError(
      fixture.verifier,
      "AttendanceAlreadyVerified"
    );
  });

  it("rejects a deployment quorum below three", async function () {
    const reputation = await ethers.deployContract("Reputation", [
      REPUTATION_INITIAL_GRANT,
      REPUTATION_ATTENDANCE_REWARD,
    ]);
    const movement = await ethers.deployContract("Movement", [
      await reputation.getAddress(),
      await(await ethers.getSigners())[0].getAddress(),
      CREATE_REQUIREMENT,
    ]);

    await expect(
      ethers.deployContract("AttendanceVerifier", [
        await movement.getAddress(),
        await reputation.getAddress(),
        2,
      ])
    )
      .to.be.revertedWithCustomError(
        await ethers.getContractFactory("AttendanceVerifier"),
        "InvalidRequiredPeerCount"
      )
      .withArgs(2n);
  });

  it("rejects zero dependency addresses", async function () {
    const reputation = await ethers.deployContract("Reputation", [
      REPUTATION_INITIAL_GRANT,
      REPUTATION_ATTENDANCE_REWARD,
    ]);

    await expect(
      ethers.deployContract("AttendanceVerifier", [
        ZeroAddress,
        await reputation.getAddress(),
        3,
      ])
    ).to.be.revertedWithCustomError(
      await ethers.getContractFactory("AttendanceVerifier"),
      "ZeroAddress"
    );
  });
});
