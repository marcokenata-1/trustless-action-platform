import {
  Contract,
  JsonRpcProvider,
  getAddress,
} from "ethers";
import type { EventLog, Provider } from "ethers";

import type {
  ChainMovementEvent,
  ChainReputationEvent,
} from "../store/index.js";

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
  queryMovementEvents(
    fromBlock: number,
    toBlock: number,
  ): Promise<ChainMovementEvent[]>;
  queryReputationEvents(
    fromBlock: number,
    toBlock: number,
  ): Promise<ChainReputationEvent[]>;
}

const ATTENDANCE_VERIFIER_ABI = [
  "event AttendanceVerified(uint256 indexed movementId,address indexed participant,bytes32 indexed proofsHash,uint256 proofCount,address[] peers)",
];

const MOVEMENT_ABI = [
  "event MovementCreated(uint256 indexed movementId,address indexed organiser,uint256 threshold,uint256 deadlineBlock,string cid)",
  "event Committed(uint256 indexed movementId,address indexed committer,uint256 tally)",
  "event MovementActivated(uint256 indexed movementId)",
  "event MovementCancelled(uint256 indexed movementId)",
  "event CreateRequirementUpdated(uint256 oldRequirement,uint256 newRequirement)",
];

const REPUTATION_ABI = [
  "event Registered(address indexed account,uint256 initialGrant)",
  "event AttendanceRewarded(address indexed participant,uint256 indexed movementId,uint256 amount,uint256 newBalance)",
  "event AttendanceVerifierUpdated(address indexed previous,address indexed current)",
  "event InitialGrantUpdated(uint256 previous,uint256 current)",
  "event AttendanceRewardUpdated(uint256 previous,uint256 current)",
];

export class IndexerRpc implements IndexerChain {
  private readonly provider: Provider;
  private readonly verifier: Contract;
  private readonly movement: Contract;
  private readonly reputation: Contract;

  constructor(
    rpcUrlOrProvider: string | Provider,
    verifierAddress: string,
    movementAddress: string,
    reputationAddress: string,
  ) {
    this.provider =
      typeof rpcUrlOrProvider === "string"
        ? new JsonRpcProvider(rpcUrlOrProvider)
        : rpcUrlOrProvider;
    this.verifier = new Contract(
      getAddress(verifierAddress),
      ATTENDANCE_VERIFIER_ABI,
      this.provider,
    );
    this.movement = new Contract(
      getAddress(movementAddress),
      MOVEMENT_ABI,
      this.provider,
    );
    this.reputation = new Contract(
      getAddress(reputationAddress),
      REPUTATION_ABI,
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

    return events.map((event) => this.decodeAttendance(event as EventLog));
  }

  async queryMovementEvents(
    fromBlock: number,
    toBlock: number,
  ): Promise<ChainMovementEvent[]> {
    if (toBlock < fromBlock) {
      return [];
    }

    const events = await this.movement.queryFilter("*", fromBlock, toBlock);
    return events
      .map((event) => this.decodeMovement(event as EventLog))
      .filter((event): event is ChainMovementEvent => event !== null)
      .sort(byBlockAndLog);
  }

  async queryReputationEvents(
    fromBlock: number,
    toBlock: number,
  ): Promise<ChainReputationEvent[]> {
    if (toBlock < fromBlock) {
      return [];
    }

    const events = await this.reputation.queryFilter("*", fromBlock, toBlock);
    return events
      .map((event) => this.decodeReputation(event as EventLog))
      .filter((event): event is ChainReputationEvent => event !== null)
      .sort(byBlockAndLog);
  }

  private decodeAttendance(event: EventLog): ChainAttendanceEvent {
    assertIndexed(event);

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

  private decodeMovement(event: EventLog): ChainMovementEvent | null {
    assertIndexed(event);

    const base = {
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
      logIndex: event.index,
    };

    switch (event.eventName) {
      case "MovementCreated":
        return {
          type: "MovementCreated",
          ...base,
          movementId: event.args.movementId as bigint,
          organiser: getAddress(event.args.organiser as string),
          threshold: event.args.threshold as bigint,
          deadlineBlock: event.args.deadlineBlock as bigint,
          cid: event.args.cid as string,
        };
      case "Committed":
        return {
          type: "Committed",
          ...base,
          movementId: event.args.movementId as bigint,
          committer: getAddress(event.args.committer as string),
          tally: event.args.tally as bigint,
        };
      case "MovementActivated":
        return {
          type: "MovementActivated",
          ...base,
          movementId: event.args.movementId as bigint,
        };
      case "MovementCancelled":
        return {
          type: "MovementCancelled",
          ...base,
          movementId: event.args.movementId as bigint,
        };
      case "CreateRequirementUpdated":
        return {
          type: "CreateRequirementUpdated",
          ...base,
          oldRequirement: event.args.oldRequirement as bigint,
          newRequirement: event.args.newRequirement as bigint,
        };
      default:
        return null;
    }
  }

  private decodeReputation(event: EventLog): ChainReputationEvent | null {
    assertIndexed(event);

    const base = {
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
      logIndex: event.index,
    };

    switch (event.eventName) {
      case "Registered":
        return {
          type: "Registered",
          ...base,
          account: getAddress(event.args.account as string),
          initialGrant: event.args.initialGrant as bigint,
        };
      case "AttendanceRewarded":
        return {
          type: "AttendanceRewarded",
          ...base,
          participant: getAddress(event.args.participant as string),
          movementId: event.args.movementId as bigint,
          amount: event.args.amount as bigint,
          newBalance: event.args.newBalance as bigint,
        };
      case "AttendanceVerifierUpdated":
        return {
          type: "AttendanceVerifierUpdated",
          ...base,
          previous: getAddress(event.args.previous as string),
          current: getAddress(event.args.current as string),
        };
      case "InitialGrantUpdated":
        return {
          type: "InitialGrantUpdated",
          ...base,
          previous: event.args.previous as bigint,
          current: event.args.current as bigint,
        };
      case "AttendanceRewardUpdated":
        return {
          type: "AttendanceRewardUpdated",
          ...base,
          previous: event.args.previous as bigint,
          current: event.args.current as bigint,
        };
      default:
        return null;
    }
  }
}

function byBlockAndLog(
  a: { blockNumber: number; logIndex: number },
  b: { blockNumber: number; logIndex: number },
): number {
  return a.blockNumber === b.blockNumber
    ? a.logIndex - b.logIndex
    : a.blockNumber - b.blockNumber;
}

function assertIndexed(event: EventLog): asserts event is EventLog & {
  blockNumber: number;
  index: number;
} {
  if (event.blockNumber === null || event.index === null) {
    throw new Error("Indexed log is missing blockNumber or logIndex");
  }
}
