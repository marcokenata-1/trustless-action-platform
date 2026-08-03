import { Contract, JsonRpcProvider, getAddress } from "ethers";
import type { Signer, TypedDataDomain } from "ethers";

import { attendanceDomain } from "../../../shared/attendance.js";
import type { HandshakeProof } from "../../../shared/attendance.js";

const ATTENDANCE_VERIFIER_ABI = [
  "function requiredPeerCount() view returns (uint256)",
  "function submitAttendance(uint256 movementId,address participant,(address peer,bytes32 nonce,uint64 timestamp,bytes peerSignature)[] proofs,bytes participantSignature)",
];

export interface SubmissionResult {
  transactionHash: string;
  blockNumber: number | null;
}

export interface SimulatorRuntime {
  getDomain(): Promise<TypedDataDomain>;
  getSigner(address: string): Promise<Signer>;
  getRequiredPeerCount(): Promise<number>;
  submitAttendance(
    movementId: bigint,
    participant: string,
    proofs: readonly HandshakeProof[],
    participantSignature: string,
  ): Promise<SubmissionResult>;
}

/*
  Uses unlocked JSON-RPC accounts supplied by a local Hardhat node.
  Real clients would sign in their own wallet instead.
*/
export class Simulator implements SimulatorRuntime {
  private readonly provider: JsonRpcProvider;
  private readonly verifierAddress: string;
  private readonly verifier: Contract;

  constructor(rpcUrl: string, verifierAddress: string) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.verifierAddress = getAddress(verifierAddress);
    this.verifier = new Contract(
      this.verifierAddress,
      ATTENDANCE_VERIFIER_ABI,
      this.provider,
    );
  }

  async getDomain(): Promise<TypedDataDomain> {
    const { chainId } = await this.provider.getNetwork();

    return attendanceDomain(chainId, this.verifierAddress);
  }

  // TODO: @stephen This only works with unlocked local-node accounts. Use wallet-managed signing for non-local environments.
  async getSigner(address: string): Promise<Signer> {
    return this.provider.getSigner(getAddress(address));
  }

  async getRequiredPeerCount(): Promise<number> {
    const peerCount = (await this.verifier.requiredPeerCount()) as bigint;
    const result = Number(peerCount);

    if (!Number.isSafeInteger(result)) {
      throw new Error("Contract peer count exceeds JavaScript safe integer");
    }

    return result;
  }

  async submitAttendance(
    movementId: bigint,
    participant: string,
    proofs: readonly HandshakeProof[],
    participantSignature: string,
  ): Promise<SubmissionResult> {
    const signer = await this.getSigner(participant);
    const connectedVerifier = this.verifier.connect(signer) as Contract;
    const serializedProof = proofs.map((proof) => ({
      peer: proof.peer,
      nonce: proof.nonce,
      timestamp: proof.timestamp,
      peerSignature: proof.peerSignature,
    }));

    const txn = await connectedVerifier.submitAttendance(
      movementId,
      participant,
      serializedProof,
      participantSignature,
    );
    const receipt = await txn.wait();

    return {
      transactionHash: txn.hash,
      blockNumber: receipt?.blockNumber ?? null,
    };
  }
}
