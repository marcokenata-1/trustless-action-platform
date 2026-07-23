import { expect } from "chai";
import { ZeroAddress } from "ethers";
import type { Signer } from "ethers";
import { network } from "hardhat";

import {
  attendanceDomain,
  buildAttendance,
  computeProofsHash,
  getAttendanceParticipant,
  getHandshakePeerAddress,
  createMutualHandshake,
  createHandshake,
  signAttendance,
  signHandshake,
  sortHandshakeProofs,
} from "../shared/attendance.js";
import type { HandshakeProof } from "../shared/attendance.js";

const { ethers } = await network.create();

async function collectProofs(
  participant: Signer,
  peers: Signer[],
  domain: ReturnType<typeof attendanceDomain>,
  movementId = 1n,
): Promise<HandshakeProof[]> {
  const participantAddress = await participant.getAddress();
  const proofs: HandshakeProof[] = [];

  for (const peer of peers) {
    const peerAddress = await peer.getAddress();
    const handshake = createHandshake(
      movementId,
      participantAddress,
      peerAddress,
      1_700_000_000n,
    );
    const peerSignature = await signHandshake(peer, domain, handshake);
    proofs.push({ ...handshake, peerSignature });
  }

  return proofs;
}

describe("attendance EIP-712 helpers", function () {
  it("creates a mutual handshake with swapped roles and a shared timestamp", async function () {
    const [partyA, partyB] = await ethers.getSigners();
    const [handshakeForA, handshakeForB] = createMutualHandshake(
      1n,
      await partyA.getAddress(),
      await partyB.getAddress(),
      1_700_000_000n,
    );

    expect(handshakeForA.participant).to.equal(await partyA.getAddress());
    expect(handshakeForA.peer).to.equal(await partyB.getAddress());
    expect(handshakeForB.participant).to.equal(await partyB.getAddress());
    expect(handshakeForB.peer).to.equal(await partyA.getAddress());
    expect(handshakeForA.timestamp).to.equal(handshakeForB.timestamp);
    expect(handshakeForA.nonce).to.not.equal(handshakeForB.nonce);
  });

  it("builds attendance claim via proofsHash", async function () {
    const [participant, ...peers] = await ethers.getSigners();
    const domain = attendanceDomain(31337n, ZeroAddress);
    const proofs = await collectProofs(
      participant,
      peers.slice(0, 3).reverse(),
      domain,
    );

    for (const proof of proofs) {
      expect(getHandshakePeerAddress(domain, proof)).to.equal(proof.peer);
    }

    const attendance = buildAttendance(domain, proofs);
    const participantSignature = await signAttendance(
      participant,
      domain,
      attendance,
    );

    expect(
      getAttendanceParticipant(domain, attendance, participantSignature),
    ).to.equal(await participant.getAddress());
    expect(attendance.requiredPeerCount).to.equal(3n);
    expect(attendance.proofsHash).to.equal(computeProofsHash(domain, proofs));
    expect(attendance.proofsHash).to.equal(
      computeProofsHash(domain, sortHandshakeProofs(proofs).reverse()),
    );
  });

  it("supports a custom peer quorum without changing the Attendance schema", async function () {
    const [participant, ...peers] = await ethers.getSigners();
    const domain = attendanceDomain(31337n, ZeroAddress);
    const proofs = await collectProofs(participant, peers.slice(0, 4), domain);

    const attendance = buildAttendance(domain, proofs, 4);

    expect(attendance.requiredPeerCount).to.equal(4n);
    expect(attendance.proofsHash).to.equal(computeProofsHash(domain, proofs));
  });

  it("accepts more proofs than the minimum peer count", async function () {
    const [participant, ...peers] = await ethers.getSigners();
    const domain = attendanceDomain(31337n, ZeroAddress);
    const proofs = await collectProofs(participant, peers.slice(0, 4), domain);

    const attendance = buildAttendance(domain, proofs, 3);

    expect(attendance.requiredPeerCount).to.equal(3n);
    expect(attendance.proofsHash).to.equal(computeProofsHash(domain, proofs));
  });

  it("rejects duplicate peers before submission", async function () {
    const [participant, peer] = await ethers.getSigners();
    const domain = attendanceDomain(31337n, ZeroAddress);
    const handshake = createHandshake(
      1n,
      await participant.getAddress(),
      await peer.getAddress(),
    );
    const duplicateProof = {
      ...handshake,
      peerSignature: "0x",
    };

    expect(() =>
      buildAttendance(domain, [duplicateProof, duplicateProof, duplicateProof]),
    ).to.throw("Attendance peers must be unique");
  });

  it("rejects the wrong number of proofs for the requested quorum", async function () {
    const [participant, peer] = await ethers.getSigners();
    const domain = attendanceDomain(31337n, ZeroAddress);
    const proofs = await collectProofs(participant, [peer], domain);

    expect(() => buildAttendance(domain, proofs, 3)).to.throw(
      "Attendance requires at least 3 peers, got 1",
    );
  });
});
