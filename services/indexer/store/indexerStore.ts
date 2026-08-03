import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";
import { getAddress } from "ethers";

export interface AttendanceEventRecord {
  movementId: bigint;
  participant: string;
  proofsHash: string;
  proofCount: number;
  peers: string[];
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
}

export interface StoredAttendanceEvent extends AttendanceEventRecord {
  id: number;
}

export type MovementEventType =
  | "MovementCreated"
  | "Committed"
  | "MovementActivated"
  | "MovementCancelled"
  | "CreateRequirementUpdated";

export type MovementStatus = "Open" | "Activated" | "Cancelled";

export interface ChainMovementEventBase {
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
}

export type ChainMovementEvent =
  | (ChainMovementEventBase & {
      type: "MovementCreated";
      movementId: bigint;
      organiser: string;
      threshold: bigint;
      deadlineBlock: bigint;
      cid: string;
    })
  | (ChainMovementEventBase & {
      type: "Committed";
      movementId: bigint;
      committer: string;
      tally: bigint;
    })
  | (ChainMovementEventBase & {
      type: "MovementActivated";
      movementId: bigint;
    })
  | (ChainMovementEventBase & {
      type: "MovementCancelled";
      movementId: bigint;
    })
  | (ChainMovementEventBase & {
      type: "CreateRequirementUpdated";
      oldRequirement: bigint;
      newRequirement: bigint;
    });

export interface StoredMovement {
  movementId: bigint;
  organiser: string;
  threshold: bigint;
  deadlineBlock: bigint;
  cid: string;
  status: MovementStatus;
  tally: bigint;
  createdBlock: number;
  createdTx: string;
  activatedBlock: number | null;
  cancelledBlock: number | null;
}

export interface StoredMovementCommit {
  movementId: bigint;
  committer: string;
  tally: bigint;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
}

export interface StoredMovementEvent {
  id: number;
  eventType: MovementEventType;
  movementId: bigint | null;
  organiser: string | null;
  committer: string | null;
  threshold: bigint | null;
  deadlineBlock: bigint | null;
  cid: string | null;
  tally: bigint | null;
  oldRequirement: bigint | null;
  newRequirement: bigint | null;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
}

export interface StoredCreateRequirementUpdate {
  id: number;
  oldRequirement: bigint;
  newRequirement: bigint;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
}

export type ReputationEventType =
  | "Registered"
  | "AttendanceRewarded"
  | "AttendanceVerifierUpdated"
  | "InitialGrantUpdated"
  | "AttendanceRewardUpdated";

export type ChainReputationEvent =
  | (ChainMovementEventBase & {
      type: "Registered";
      account: string;
      initialGrant: bigint;
    })
  | (ChainMovementEventBase & {
      type: "AttendanceRewarded";
      participant: string;
      movementId: bigint;
      amount: bigint;
      newBalance: bigint;
    })
  | (ChainMovementEventBase & {
      type: "AttendanceVerifierUpdated";
      previous: string;
      current: string;
    })
  | (ChainMovementEventBase & {
      type: "InitialGrantUpdated";
      previous: bigint;
      current: bigint;
    })
  | (ChainMovementEventBase & {
      type: "AttendanceRewardUpdated";
      previous: bigint;
      current: bigint;
    });

export interface StoredReputationEvent {
  id: number;
  eventType: ReputationEventType;
  account: string | null;
  participant: string | null;
  movementId: bigint | null;
  amount: bigint | null;
  newBalance: bigint | null;
  previousAddress: string | null;
  currentAddress: string | null;
  previousValue: bigint | null;
  currentValue: bigint | null;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
}

export interface ReputationEventFilter {
  eventType?: ReputationEventType;
  participant?: string;
  movementId?: bigint;
}

const ATTENDANCE_CURSOR = "attendance_verified";
const MOVEMENT_CURSOR = "movement_events";
const REPUTATION_CURSOR = "reputation_events";

export class IndexerStore {
  private readonly database: Database.Database;
  private readonly insertAttendance: Database.Statement;
  private readonly selectAttendanceByMovement: Database.Statement;
  private readonly selectAttendanceByMovementAndParticipant: Database.Statement;
  private readonly insertMovementEventStmt: Database.Statement;
  private readonly selectMovementEvents: Database.Statement;
  private readonly selectMovementEventsById: Database.Statement;
  private readonly upsertMovement: Database.Statement;
  private readonly updateMovementTally: Database.Statement;
  private readonly updateMovementActivated: Database.Statement;
  private readonly updateMovementCancelled: Database.Statement;
  private readonly selectMovements: Database.Statement;
  private readonly selectMovement: Database.Statement;
  private readonly insertCommit: Database.Statement;
  private readonly selectCommits: Database.Statement;
  private readonly insertRequirementUpdate: Database.Statement;
  private readonly selectRequirementUpdates: Database.Statement;
  private readonly insertReputationEventStmt: Database.Statement;
  private readonly selectReputationEvents: Database.Statement;
  private readonly selectCursor: Database.Statement;
  private readonly upsertCursor: Database.Statement;

  constructor(filename: string) {
    if (filename !== ":memory:") {
      mkdirSync(dirname(resolve(filename)), { recursive: true });
    }

    this.database = new Database(filename);
    this.database.pragma("journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS attendance_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movement_id TEXT NOT NULL,
        participant TEXT NOT NULL,
        proofs_hash TEXT NOT NULL,
        proof_count INTEGER NOT NULL,
        peers_json TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        log_index INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE (transaction_hash, log_index)
      );

      CREATE INDEX IF NOT EXISTS attendance_events_movement_idx
        ON attendance_events (movement_id);

      CREATE INDEX IF NOT EXISTS attendance_events_participant_idx
        ON attendance_events (movement_id, participant);

      CREATE TABLE IF NOT EXISTS movement_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        movement_id TEXT,
        organiser TEXT,
        committer TEXT,
        threshold TEXT,
        deadline_block TEXT,
        cid TEXT,
        tally TEXT,
        old_requirement TEXT,
        new_requirement TEXT,
        transaction_hash TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        log_index INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE (transaction_hash, log_index)
      );

      CREATE INDEX IF NOT EXISTS movement_events_movement_idx
        ON movement_events (movement_id);

      CREATE TABLE IF NOT EXISTS movements (
        movement_id TEXT PRIMARY KEY,
        organiser TEXT NOT NULL,
        threshold TEXT NOT NULL,
        deadline_block TEXT NOT NULL,
        cid TEXT NOT NULL,
        status TEXT NOT NULL,
        tally TEXT NOT NULL,
        created_block INTEGER NOT NULL,
        created_tx TEXT NOT NULL,
        activated_block INTEGER,
        cancelled_block INTEGER
      );

      CREATE TABLE IF NOT EXISTS movement_commits (
        movement_id TEXT NOT NULL,
        committer TEXT NOT NULL,
        tally TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        log_index INTEGER NOT NULL,
        PRIMARY KEY (movement_id, committer),
        UNIQUE (transaction_hash, log_index)
      );

      CREATE INDEX IF NOT EXISTS movement_commits_movement_idx
        ON movement_commits (movement_id);

      CREATE TABLE IF NOT EXISTS create_requirement_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        old_requirement TEXT NOT NULL,
        new_requirement TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        log_index INTEGER NOT NULL,
        UNIQUE (transaction_hash, log_index)
      );

      CREATE TABLE IF NOT EXISTS reputation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        account TEXT,
        participant TEXT,
        movement_id TEXT,
        amount TEXT,
        new_balance TEXT,
        previous_address TEXT,
        current_address TEXT,
        previous_value TEXT,
        current_value TEXT,
        transaction_hash TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        log_index INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE (transaction_hash, log_index)
      );

      CREATE INDEX IF NOT EXISTS reputation_events_type_idx
        ON reputation_events (event_type);

      CREATE INDEX IF NOT EXISTS reputation_events_participant_idx
        ON reputation_events (participant);

      CREATE INDEX IF NOT EXISTS reputation_events_movement_idx
        ON reputation_events (movement_id);

      CREATE TABLE IF NOT EXISTS sync_cursor (
        cursor_key TEXT PRIMARY KEY,
        last_block INTEGER NOT NULL
      );
    `);

    this.insertAttendance = this.database.prepare(`
      INSERT OR IGNORE INTO attendance_events (
        movement_id, participant, proofs_hash, proof_count, peers_json,
        transaction_hash, block_number, log_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectAttendanceByMovement = this.database.prepare(`
      SELECT id, movement_id, participant, proofs_hash, proof_count, peers_json,
             transaction_hash, block_number, log_index
      FROM attendance_events
      WHERE movement_id = ?
      ORDER BY block_number ASC, log_index ASC
    `);

    this.selectAttendanceByMovementAndParticipant = this.database.prepare(`
      SELECT id, movement_id, participant, proofs_hash, proof_count, peers_json,
             transaction_hash, block_number, log_index
      FROM attendance_events
      WHERE movement_id = ? AND participant = ?
      ORDER BY block_number ASC, log_index ASC
    `);

    this.insertMovementEventStmt = this.database.prepare(`
      INSERT OR IGNORE INTO movement_events (
        event_type, movement_id, organiser, committer, threshold, deadline_block,
        cid, tally, old_requirement, new_requirement,
        transaction_hash, block_number, log_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectMovementEvents = this.database.prepare(`
      SELECT * FROM movement_events
      ORDER BY block_number ASC, log_index ASC
    `);

    this.selectMovementEventsById = this.database.prepare(`
      SELECT * FROM movement_events
      WHERE movement_id = ?
      ORDER BY block_number ASC, log_index ASC
    `);

    this.upsertMovement = this.database.prepare(`
      INSERT INTO movements (
        movement_id, organiser, threshold, deadline_block, cid, status, tally,
        created_block, created_tx, activated_block, cancelled_block
      ) VALUES (?, ?, ?, ?, ?, 'Open', '0', ?, ?, NULL, NULL)
      ON CONFLICT(movement_id) DO NOTHING
    `);

    this.updateMovementTally = this.database.prepare(`
      UPDATE movements SET tally = ? WHERE movement_id = ?
    `);

    this.updateMovementActivated = this.database.prepare(`
      UPDATE movements
      SET status = 'Activated', activated_block = ?
      WHERE movement_id = ?
    `);

    this.updateMovementCancelled = this.database.prepare(`
      UPDATE movements
      SET status = 'Cancelled', cancelled_block = ?
      WHERE movement_id = ?
    `);

    this.selectMovements = this.database.prepare(`
      SELECT * FROM movements
      ORDER BY CAST(movement_id AS INTEGER) ASC
    `);

    this.selectMovement = this.database.prepare(`
      SELECT * FROM movements WHERE movement_id = ?
    `);

    this.insertCommit = this.database.prepare(`
      INSERT OR IGNORE INTO movement_commits (
        movement_id, committer, tally, transaction_hash, block_number, log_index
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.selectCommits = this.database.prepare(`
      SELECT * FROM movement_commits
      WHERE movement_id = ?
      ORDER BY block_number ASC, log_index ASC
    `);

    this.insertRequirementUpdate = this.database.prepare(`
      INSERT OR IGNORE INTO create_requirement_updates (
        old_requirement, new_requirement, transaction_hash, block_number, log_index
      ) VALUES (?, ?, ?, ?, ?)
    `);

    this.selectRequirementUpdates = this.database.prepare(`
      SELECT * FROM create_requirement_updates
      ORDER BY block_number ASC, log_index ASC
    `);

    this.insertReputationEventStmt = this.database.prepare(`
      INSERT OR IGNORE INTO reputation_events (
        event_type, account, participant, movement_id, amount, new_balance,
        previous_address, current_address, previous_value, current_value,
        transaction_hash, block_number, log_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectReputationEvents = this.database.prepare(`
      SELECT * FROM reputation_events
      ORDER BY block_number ASC, log_index ASC
    `);

    this.selectCursor = this.database.prepare(`
      SELECT last_block FROM sync_cursor WHERE cursor_key = ?
    `);

    this.upsertCursor = this.database.prepare(`
      INSERT INTO sync_cursor (cursor_key, last_block)
      VALUES (?, ?)
      ON CONFLICT(cursor_key) DO UPDATE SET last_block = excluded.last_block
    `);
  }

  insertAttendanceEvent(event: AttendanceEventRecord): boolean {
    const result = this.insertAttendance.run(
      event.movementId.toString(),
      getAddress(event.participant),
      event.proofsHash,
      event.proofCount,
      JSON.stringify(event.peers.map((peer) => getAddress(peer))),
      event.transactionHash,
      event.blockNumber,
      event.logIndex,
    );
    return result.changes > 0;
  }

  listAttendanceByMovement(movementId: bigint): StoredAttendanceEvent[] {
    const rows = this.selectAttendanceByMovement.all(
      movementId.toString(),
    ) as AttendanceRow[];
    return rows.map(mapAttendanceRow);
  }

  listAttendanceByMovementAndParticipant(
    movementId: bigint,
    participant: string,
  ): StoredAttendanceEvent[] {
    const rows = this.selectAttendanceByMovementAndParticipant.all(
      movementId.toString(),
      getAddress(participant),
    ) as AttendanceRow[];
    return rows.map(mapAttendanceRow);
  }

  /** @deprecated Prefer listAttendanceByMovement */
  listByMovement(movementId: bigint): StoredAttendanceEvent[] {
    return this.listAttendanceByMovement(movementId);
  }

  /** @deprecated Prefer listAttendanceByMovementAndParticipant */
  listByMovementAndParticipant(
    movementId: bigint,
    participant: string,
  ): StoredAttendanceEvent[] {
    return this.listAttendanceByMovementAndParticipant(movementId, participant);
  }

  insertMovementEvent(event: ChainMovementEvent): boolean {
    const apply = this.database.transaction((item: ChainMovementEvent) => {
      const result = this.insertMovementEventStmt.run(
        item.type,
        "movementId" in item ? item.movementId.toString() : null,
        item.type === "MovementCreated" ? getAddress(item.organiser) : null,
        item.type === "Committed" ? getAddress(item.committer) : null,
        item.type === "MovementCreated" ? item.threshold.toString() : null,
        item.type === "MovementCreated" ? item.deadlineBlock.toString() : null,
        item.type === "MovementCreated" ? item.cid : null,
        item.type === "Committed" ? item.tally.toString() : null,
        item.type === "CreateRequirementUpdated"
          ? item.oldRequirement.toString()
          : null,
        item.type === "CreateRequirementUpdated"
          ? item.newRequirement.toString()
          : null,
        item.transactionHash,
        item.blockNumber,
        item.logIndex,
      );

      if (result.changes === 0) {
        return false;
      }

      switch (item.type) {
        case "MovementCreated":
          this.upsertMovement.run(
            item.movementId.toString(),
            getAddress(item.organiser),
            item.threshold.toString(),
            item.deadlineBlock.toString(),
            item.cid,
            item.blockNumber,
            item.transactionHash,
          );
          break;
        case "Committed":
          this.insertCommit.run(
            item.movementId.toString(),
            getAddress(item.committer),
            item.tally.toString(),
            item.transactionHash,
            item.blockNumber,
            item.logIndex,
          );
          this.updateMovementTally.run(
            item.tally.toString(),
            item.movementId.toString(),
          );
          break;
        case "MovementActivated":
          this.updateMovementActivated.run(
            item.blockNumber,
            item.movementId.toString(),
          );
          break;
        case "MovementCancelled":
          this.updateMovementCancelled.run(
            item.blockNumber,
            item.movementId.toString(),
          );
          break;
        case "CreateRequirementUpdated":
          this.insertRequirementUpdate.run(
            item.oldRequirement.toString(),
            item.newRequirement.toString(),
            item.transactionHash,
            item.blockNumber,
            item.logIndex,
          );
          break;
      }

      return true;
    });

    return apply(event);
  }

  listMovements(): StoredMovement[] {
    return (this.selectMovements.all() as MovementRow[]).map(mapMovementRow);
  }

  getMovement(movementId: bigint): StoredMovement | null {
    const row = this.selectMovement.get(movementId.toString()) as
      | MovementRow
      | undefined;
    return row ? mapMovementRow(row) : null;
  }

  listCommits(movementId: bigint): StoredMovementCommit[] {
    const rows = this.selectCommits.all(movementId.toString()) as CommitRow[];
    return rows.map((row) => ({
      movementId: BigInt(row.movement_id),
      committer: row.committer,
      tally: BigInt(row.tally),
      transactionHash: row.transaction_hash,
      blockNumber: row.block_number,
      logIndex: row.log_index,
    }));
  }

  listMovementEvents(movementId?: bigint): StoredMovementEvent[] {
    const rows = (
      movementId === undefined
        ? this.selectMovementEvents.all()
        : this.selectMovementEventsById.all(movementId.toString())
    ) as MovementEventRow[];
    return rows.map(mapMovementEventRow);
  }

  listCreateRequirementUpdates(): StoredCreateRequirementUpdate[] {
    const rows = this.selectRequirementUpdates.all() as RequirementRow[];
    return rows.map((row) => ({
      id: row.id,
      oldRequirement: BigInt(row.old_requirement),
      newRequirement: BigInt(row.new_requirement),
      transactionHash: row.transaction_hash,
      blockNumber: row.block_number,
      logIndex: row.log_index,
    }));
  }

  insertReputationEvent(event: ChainReputationEvent): boolean {
    const result = this.insertReputationEventStmt.run(
      event.type,
      event.type === "Registered" ? getAddress(event.account) : null,
      event.type === "AttendanceRewarded"
        ? getAddress(event.participant)
        : null,
      event.type === "AttendanceRewarded" ? event.movementId.toString() : null,
      event.type === "Registered"
        ? event.initialGrant.toString()
        : event.type === "AttendanceRewarded"
          ? event.amount.toString()
          : null,
      event.type === "AttendanceRewarded" ? event.newBalance.toString() : null,
      event.type === "AttendanceVerifierUpdated"
        ? getAddress(event.previous)
        : null,
      event.type === "AttendanceVerifierUpdated"
        ? getAddress(event.current)
        : null,
      event.type === "InitialGrantUpdated" ||
        event.type === "AttendanceRewardUpdated"
        ? event.previous.toString()
        : null,
      event.type === "InitialGrantUpdated" ||
        event.type === "AttendanceRewardUpdated"
        ? event.current.toString()
        : null,
      event.transactionHash,
      event.blockNumber,
      event.logIndex,
    );
    return result.changes > 0;
  }

  listReputationEvents(
    filter: ReputationEventFilter = {},
  ): StoredReputationEvent[] {
    let rows = this.selectReputationEvents.all() as ReputationEventRow[];

    if (filter.eventType !== undefined) {
      rows = rows.filter((row) => row.event_type === filter.eventType);
    }
    if (filter.participant !== undefined) {
      const participant = getAddress(filter.participant);
      rows = rows.filter(
        (row) =>
          row.participant === participant || row.account === participant,
      );
    }
    if (filter.movementId !== undefined) {
      const movementId = filter.movementId.toString();
      rows = rows.filter((row) => row.movement_id === movementId);
    }

    return rows.map(mapReputationEventRow);
  }

  getLastIndexedAttendanceBlock(): number | null {
    return this.getCursor(ATTENDANCE_CURSOR);
  }

  setLastIndexedAttendanceBlock(blockNumber: number): void {
    this.upsertCursor.run(ATTENDANCE_CURSOR, blockNumber);
  }

  getLastIndexedMovementBlock(): number | null {
    return this.getCursor(MOVEMENT_CURSOR);
  }

  setLastIndexedMovementBlock(blockNumber: number): void {
    this.upsertCursor.run(MOVEMENT_CURSOR, blockNumber);
  }

  getLastIndexedReputationBlock(): number | null {
    return this.getCursor(REPUTATION_CURSOR);
  }

  setLastIndexedReputationBlock(blockNumber: number): void {
    this.upsertCursor.run(REPUTATION_CURSOR, blockNumber);
  }

  /** @deprecated Prefer getLastIndexedAttendanceBlock */
  getLastIndexedBlock(): number | null {
    return this.getLastIndexedAttendanceBlock();
  }

  /** @deprecated Prefer setLastIndexedAttendanceBlock */
  setLastIndexedBlock(blockNumber: number): void {
    this.setLastIndexedAttendanceBlock(blockNumber);
  }

  close(): void {
    this.database.close();
  }

  private getCursor(key: string): number | null {
    const row = this.selectCursor.get(key) as
      | { last_block: number }
      | undefined;
    return row?.last_block ?? null;
  }
}

/** @deprecated Use IndexerStore */
export { IndexerStore as AttendanceStore };

interface AttendanceRow {
  id: number;
  movement_id: string;
  participant: string;
  proofs_hash: string;
  proof_count: number;
  peers_json: string;
  transaction_hash: string;
  block_number: number;
  log_index: number;
}

interface MovementRow {
  movement_id: string;
  organiser: string;
  threshold: string;
  deadline_block: string;
  cid: string;
  status: MovementStatus;
  tally: string;
  created_block: number;
  created_tx: string;
  activated_block: number | null;
  cancelled_block: number | null;
}

interface CommitRow {
  movement_id: string;
  committer: string;
  tally: string;
  transaction_hash: string;
  block_number: number;
  log_index: number;
}

interface MovementEventRow {
  id: number;
  event_type: MovementEventType;
  movement_id: string | null;
  organiser: string | null;
  committer: string | null;
  threshold: string | null;
  deadline_block: string | null;
  cid: string | null;
  tally: string | null;
  old_requirement: string | null;
  new_requirement: string | null;
  transaction_hash: string;
  block_number: number;
  log_index: number;
}

interface RequirementRow {
  id: number;
  old_requirement: string;
  new_requirement: string;
  transaction_hash: string;
  block_number: number;
  log_index: number;
}

interface ReputationEventRow {
  id: number;
  event_type: ReputationEventType;
  account: string | null;
  participant: string | null;
  movement_id: string | null;
  amount: string | null;
  new_balance: string | null;
  previous_address: string | null;
  current_address: string | null;
  previous_value: string | null;
  current_value: string | null;
  transaction_hash: string;
  block_number: number;
  log_index: number;
}

function mapAttendanceRow(row: AttendanceRow): StoredAttendanceEvent {
  return {
    id: row.id,
    movementId: BigInt(row.movement_id),
    participant: row.participant,
    proofsHash: row.proofs_hash,
    proofCount: row.proof_count,
    peers: JSON.parse(row.peers_json) as string[],
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    logIndex: row.log_index,
  };
}

function mapMovementRow(row: MovementRow): StoredMovement {
  return {
    movementId: BigInt(row.movement_id),
    organiser: row.organiser,
    threshold: BigInt(row.threshold),
    deadlineBlock: BigInt(row.deadline_block),
    cid: row.cid,
    status: row.status,
    tally: BigInt(row.tally),
    createdBlock: row.created_block,
    createdTx: row.created_tx,
    activatedBlock: row.activated_block,
    cancelledBlock: row.cancelled_block,
  };
}

function mapMovementEventRow(row: MovementEventRow): StoredMovementEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    movementId: row.movement_id === null ? null : BigInt(row.movement_id),
    organiser: row.organiser,
    committer: row.committer,
    threshold: row.threshold === null ? null : BigInt(row.threshold),
    deadlineBlock:
      row.deadline_block === null ? null : BigInt(row.deadline_block),
    cid: row.cid,
    tally: row.tally === null ? null : BigInt(row.tally),
    oldRequirement:
      row.old_requirement === null ? null : BigInt(row.old_requirement),
    newRequirement:
      row.new_requirement === null ? null : BigInt(row.new_requirement),
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    logIndex: row.log_index,
  };
}

function mapReputationEventRow(row: ReputationEventRow): StoredReputationEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    account: row.account,
    participant: row.participant,
    movementId: row.movement_id === null ? null : BigInt(row.movement_id),
    amount: row.amount === null ? null : BigInt(row.amount),
    newBalance: row.new_balance === null ? null : BigInt(row.new_balance),
    previousAddress: row.previous_address,
    currentAddress: row.current_address,
    previousValue:
      row.previous_value === null ? null : BigInt(row.previous_value),
    currentValue: row.current_value === null ? null : BigInt(row.current_value),
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    logIndex: row.log_index,
  };
}
