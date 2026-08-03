import type { IndexerStore } from "../store/index.js";
import type { IndexerChain } from "../runtime/index.js";

export interface StreamSyncResult {
  fromBlock: number;
  toBlock: number;
  eventsSeen: number;
  eventsInserted: number;
  /** Set when this stream failed; other streams may still have succeeded. */
  error?: string;
}

export interface SyncResult {
  attendance: StreamSyncResult;
  movement: StreamSyncResult;
  reputation: StreamSyncResult;
}

export class SyncInProgressError extends Error {
  constructor() {
    super("Sync already in progress; try again later");
    this.name = "SyncInProgressError";
  }
}

type StreamLabel = keyof SyncResult;

export class IndexerListener {
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;

  constructor(
    private readonly chain: IndexerChain,
    private readonly store: IndexerStore,
    private readonly startBlock: number,
  ) {}

  async syncOnce(): Promise<SyncResult> {
    if (this.syncing) {
      throw new SyncInProgressError();
    }

    this.syncing = true;
    try {
      const latest = await this.chain.getLatestBlockNumber();
      const [attendance, movement, reputation] = await Promise.allSettled([
        this.syncAttendance(latest),
        this.syncMovement(latest),
        this.syncReputation(latest),
      ]);

      return {
        attendance: settleStream("attendance", attendance, latest),
        movement: settleStream("movement", movement, latest),
        reputation: settleStream("reputation", reputation, latest),
      };
    } finally {
      this.syncing = false;
    }
  }

  startPolling(intervalMs: number): void {
    if (this.timer !== null) {
      return;
    }

    const tick = () => {
      void this.syncOnce().catch((error: unknown) => {
        if (error instanceof SyncInProgressError) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Unknown sync error";
        console.error(`Indexer sync failed: ${message}`);
      });
    };

    tick();
    this.timer = setInterval(tick, intervalMs);
  }

  stopPolling(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async syncAttendance(latest: number): Promise<StreamSyncResult> {
    const lastIndexed = this.store.getLastIndexedAttendanceBlock();
    const fromBlock =
      lastIndexed === null ? this.startBlock : lastIndexed + 1;

    if (latest < fromBlock) {
      return emptyResult(fromBlock, latest);
    }

    const events = await this.chain.queryAttendanceVerified(fromBlock, latest);
    let eventsInserted = 0;
    for (const event of events) {
      if (this.store.insertAttendanceEvent(event)) {
        eventsInserted += 1;
      }
    }

    this.store.setLastIndexedAttendanceBlock(latest);
    return {
      fromBlock,
      toBlock: latest,
      eventsSeen: events.length,
      eventsInserted,
    };
  }

  private async syncMovement(latest: number): Promise<StreamSyncResult> {
    const lastIndexed = this.store.getLastIndexedMovementBlock();
    const fromBlock =
      lastIndexed === null ? this.startBlock : lastIndexed + 1;

    if (latest < fromBlock) {
      return emptyResult(fromBlock, latest);
    }

    const events = await this.chain.queryMovementEvents(fromBlock, latest);
    let eventsInserted = 0;
    for (const event of events) {
      if (this.store.insertMovementEvent(event)) {
        eventsInserted += 1;
      }
    }

    this.store.setLastIndexedMovementBlock(latest);
    return {
      fromBlock,
      toBlock: latest,
      eventsSeen: events.length,
      eventsInserted,
    };
  }

  private async syncReputation(latest: number): Promise<StreamSyncResult> {
    const lastIndexed = this.store.getLastIndexedReputationBlock();
    const fromBlock =
      lastIndexed === null ? this.startBlock : lastIndexed + 1;

    if (latest < fromBlock) {
      return emptyResult(fromBlock, latest);
    }

    const events = await this.chain.queryReputationEvents(fromBlock, latest);
    let eventsInserted = 0;
    for (const event of events) {
      if (this.store.insertReputationEvent(event)) {
        eventsInserted += 1;
      }
    }

    this.store.setLastIndexedReputationBlock(latest);
    return {
      fromBlock,
      toBlock: latest,
      eventsSeen: events.length,
      eventsInserted,
    };
  }
}

/** @deprecated Use IndexerListener */
export { IndexerListener as AttendanceListener };

function emptyResult(fromBlock: number, toBlock: number): StreamSyncResult {
  return {
    fromBlock,
    toBlock,
    eventsSeen: 0,
    eventsInserted: 0,
  };
}

function settleStream(
  label: StreamLabel,
  settled: PromiseSettledResult<StreamSyncResult>,
  latest: number,
): StreamSyncResult {
  if (settled.status === "fulfilled") {
    return settled.value;
  }

  const message =
    settled.reason instanceof Error
      ? settled.reason.message
      : "Unknown sync error";
  console.error(`Indexer ${label} sync failed: ${message}`);
  return {
    ...emptyResult(0, latest),
    error: message,
  };
}
