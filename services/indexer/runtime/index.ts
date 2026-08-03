import {
  Contract,
  JsonRpcProvider,
  getAddress,
  id,
} from "ethers";
import type { Log, Provider } from "ethers";

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
  private readonly eventTopic: string;

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
    this.eventTopic = id(
      "AttendanceVerified(uint256,address,bytes32,uint256,address[])",
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

    const logs = await this.provider.getLogs({
      address: await this.verifier.getAddress(),
      fromBlock,
      toBlock,
      topics: [this.eventTopic],
    });

    return logs.map((log) => this.decodeLog(log));
  }

  private decodeLog(log: Log): ChainAttendanceEvent {
    const parsed = this.verifier.interface.parseLog({
      topics: [...log.topics],
      data: log.data,
    });
    if (!parsed || parsed.name !== "AttendanceVerified") {
      throw new Error("Unexpected log while indexing AttendanceVerified");
    }

    if (log.blockNumber === null || log.index === null) {
      throw new Error("Indexed log is missing blockNumber or logIndex");
    }

    const peers = (parsed.args.peers as string[]).map((peer) =>
      getAddress(peer),
    );
    const proofCount = Number(parsed.args.proofCount as bigint);
    if (!Number.isSafeInteger(proofCount)) {
      throw new Error("proofCount exceeds JavaScript safe integer");
    }

    return {
      movementId: parsed.args.movementId as bigint,
      participant: getAddress(parsed.args.participant as string),
      proofsHash: parsed.args.proofsHash as string,
      proofCount,
      peers,
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.index,
    };
  }
}
