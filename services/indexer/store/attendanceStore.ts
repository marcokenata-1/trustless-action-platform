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

const CURSOR_KEY = "attendance_verified";

export class AttendanceStore {
  private readonly database: Database.Database;
  private readonly insertEvent: Database.Statement;
  private readonly selectByMovement: Database.Statement;
  private readonly selectByMovementAndParticipant: Database.Statement;
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

      CREATE TABLE IF NOT EXISTS sync_cursor (
        cursor_key TEXT PRIMARY KEY,
        last_block INTEGER NOT NULL
      );
    `);

    this.insertEvent = this.database.prepare(`
      INSERT OR IGNORE INTO attendance_events (
        movement_id,
        participant,
        proofs_hash,
        proof_count,
        peers_json,
        transaction_hash,
        block_number,
        log_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectByMovement = this.database.prepare(`
      SELECT
        id,
        movement_id,
        participant,
        proofs_hash,
        proof_count,
        peers_json,
        transaction_hash,
        block_number,
        log_index
      FROM attendance_events
      WHERE movement_id = ?
      ORDER BY block_number ASC, log_index ASC
    `);

    this.selectByMovementAndParticipant = this.database.prepare(`
      SELECT
        id,
        movement_id,
        participant,
        proofs_hash,
        proof_count,
        peers_json,
        transaction_hash,
        block_number,
        log_index
      FROM attendance_events
      WHERE movement_id = ? AND participant = ?
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
    const result = this.insertEvent.run(
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

  listByMovement(movementId: bigint): StoredAttendanceEvent[] {
    const rows = this.selectByMovement.all(movementId.toString()) as Array<{
      id: number;
      movement_id: string;
      participant: string;
      proofs_hash: string;
      proof_count: number;
      peers_json: string;
      transaction_hash: string;
      block_number: number;
      log_index: number;
    }>;
    return rows.map(mapRow);
  }

  listByMovementAndParticipant(
    movementId: bigint,
    participant: string,
  ): StoredAttendanceEvent[] {
    const rows = this.selectByMovementAndParticipant.all(
      movementId.toString(),
      getAddress(participant),
    ) as Array<{
      id: number;
      movement_id: string;
      participant: string;
      proofs_hash: string;
      proof_count: number;
      peers_json: string;
      transaction_hash: string;
      block_number: number;
      log_index: number;
    }>;
    return rows.map(mapRow);
  }

  getLastIndexedBlock(): number | null {
    const row = this.selectCursor.get(CURSOR_KEY) as
      | { last_block: number }
      | undefined;
    return row?.last_block ?? null;
  }

  setLastIndexedBlock(blockNumber: number): void {
    this.upsertCursor.run(CURSOR_KEY, blockNumber);
  }

  close(): void {
    this.database.close();
  }
}

function mapRow(row: {
  id: number;
  movement_id: string;
  participant: string;
  proofs_hash: string;
  proof_count: number;
  peers_json: string;
  transaction_hash: string;
  block_number: number;
  log_index: number;
}): StoredAttendanceEvent {
  const peers = JSON.parse(row.peers_json) as string[];
  return {
    id: row.id,
    movementId: BigInt(row.movement_id),
    participant: row.participant,
    proofsHash: row.proofs_hash,
    proofCount: row.proof_count,
    peers,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    logIndex: row.log_index,
  };
}
