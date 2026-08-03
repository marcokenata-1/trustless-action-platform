import {
  Contract,
  JsonRpcProvider,
  getAddress,
} from "ethers";
import type { EventLog, Provider } from "ethers";

export interface ChainAttendanceEvent {
  movementId: bigint;
  participant: string;
  proofsHash: string;
  proofCount: number;
  peers: string[];
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
}

export interface IndexerChain {
  getLatestBlockNumber(): Promise<number>;
  queryAttendanceVerified(
    fromBlock: number,
    toBlock: number,
  ): Promise<ChainAttendanceEvent[]>;
}

const ATTENDANCE_VERIFIER_ABI = [
  "event AttendanceVerified(uint256 indexed movementId,address indexed participant,bytes32 indexed proofsHash,uint256 proofCount,address[] peers)",
];

export class IndexerRpc implements IndexerChain {
  private readonly provider: Provider;
  private readonly verifier: Contract;

  constructor(rpcUrlOrProvider: string | Provider, verifierAddress: string) {
    this.provider =
      typeof rpcUrlOrProvider === "string"
        ? new JsonRpcProvider(rpcUrlOrProvider)
        : rpcUrlOrProvider;
    this.verifier = new Contract(
      getAddress(verifierAddress),
      ATTENDANCE_VERIFIER_ABI,
      this.provider,
    );
  }

  async getLatestBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  async queryAttendanceVerified(
    fromBlock: number,
    toBlock: number,
  ): Promise<ChainAttendanceEvent[]> {
    if (toBlock < fromBlock) {
      return [];
    }

    const events = await this.verifier.queryFilter(
      this.verifier.filters.AttendanceVerified(),
      fromBlock,
      toBlock,
    );

    return events.map((event) => this.decodeEvent(event as EventLog));
  }

  private decodeEvent(event: EventLog): ChainAttendanceEvent {
    if (event.blockNumber === null || event.index === null) {
      throw new Error("Indexed log is missing blockNumber or logIndex");
    }

    const peers = (event.args.peers as string[]).map((peer) =>
      getAddress(peer),
    );
    const proofCount = Number(event.args.proofCount as bigint);
    if (!Number.isSafeInteger(proofCount)) {
      throw new Error("proofCount exceeds JavaScript safe integer");
    }

    return {
      movementId: event.args.movementId as bigint,
      participant: getAddress(event.args.participant as string),
      proofsHash: event.args.proofsHash as string,
      proofCount,
      peers,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
      logIndex: event.index,
    };
  }
}
