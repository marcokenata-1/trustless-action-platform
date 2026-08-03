import type { AttendanceStore } from "../store/index.js";
import type { IndexerChain } from "../runtime/index.js";

export interface SyncResult {
  fromBlock: number;
  toBlock: number;
  eventsSeen: number;
  eventsInserted: number;
}

export class SyncInProgressError extends Error {
  constructor() {
    super("Sync already in progress; try again later");
    this.name = "SyncInProgressError";
  }
}

export class AttendanceListener {
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;

  constructor(
    private readonly chain: IndexerChain,
    private readonly store: AttendanceStore,
    private readonly startBlock: number,
  ) {}

  async syncOnce(): Promise<SyncResult> {
    if (this.syncing) {
      throw new SyncInProgressError();
    }

    this.syncing = true;
    try {
      const latest = await this.chain.getLatestBlockNumber();
      const lastIndexed = this.store.getLastIndexedBlock();
      const fromBlock =
        lastIndexed === null ? this.startBlock : lastIndexed + 1;

      if (latest < fromBlock) {
        return {
          fromBlock,
          toBlock: latest,
          eventsSeen: 0,
          eventsInserted: 0,
        };
      }

      const events = await this.chain.queryAttendanceVerified(
        fromBlock,
        latest,
      );
      let eventsInserted = 0;
      for (const event of events) {
        const inserted = this.store.insertAttendanceEvent(event);
        if (inserted) {
          eventsInserted += 1;
        }
      }

      this.store.setLastIndexedBlock(latest);

      return {
        fromBlock,
        toBlock: latest,
        eventsSeen: events.length,
        eventsInserted,
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
}
