import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";
import { getAddress } from "ethers";

import type { HandshakeProof } from "../../../shared/attendance.js";

export interface MutualHandshakeSession {
  movementId: bigint;
  partyA: string;
  partyB: string;
  proofs: [HandshakeProof, HandshakeProof];
}

export interface StoredHandshakeResult {
  created: boolean;
  session: MutualHandshakeSession;
}

interface HandshakeSessionRow {
  movement_id: string;
  party_a: string;
  party_b: string;
  a_nonce: string;
  a_timestamp: string;
  a_peer_signature: string;
  b_nonce: string;
  b_timestamp: string;
  b_peer_signature: string;
}

export class HandshakeStore {
  private readonly database: Database.Database;
  private readonly selectSession: Database.Statement;
  private readonly insertSession: Database.Statement;

  constructor(filename: string) {
    if (filename !== ":memory:") {
      mkdirSync(dirname(resolve(filename)), { recursive: true });
    }

    this.database = new Database(filename);
    this.database.pragma("journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS handshake_sessions (
        movement_id TEXT NOT NULL,
        party_a TEXT NOT NULL,
        party_b TEXT NOT NULL,
        a_nonce TEXT NOT NULL,
        a_timestamp TEXT NOT NULL,
        a_peer_signature TEXT NOT NULL,
        b_nonce TEXT NOT NULL,
        b_timestamp TEXT NOT NULL,
        b_peer_signature TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (movement_id, party_a, party_b)
      )
    `);

    this.selectSession = this.database.prepare(`
      SELECT
        movement_id,
        party_a,
        party_b,
        a_nonce,
        a_timestamp,
        a_peer_signature,
        b_nonce,
        b_timestamp,
        b_peer_signature
      FROM handshake_sessions
      WHERE movement_id = ? AND party_a = ? AND party_b = ?
    `);
    this.insertSession = this.database.prepare(`
      INSERT INTO handshake_sessions (
        movement_id,
        party_a,
        party_b,
        a_nonce,
        a_timestamp,
        a_peer_signature,
        b_nonce,
        b_timestamp,
        b_peer_signature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (movement_id, party_a, party_b) DO NOTHING
    `);
  }

  get(
    movementId: bigint,
    partyA: string,
    partyB: string,
  ): MutualHandshakeSession | undefined {
    const [canonicalA, canonicalB] = getNormalizedHandshakeParties(
      partyA,
      partyB,
    );
    const row = this.selectSession.get(
      movementId.toString(),
      canonicalA,
      canonicalB,
    ) as HandshakeSessionRow | undefined;

    return row ? rowToSession(row) : undefined;
  }

  insertOrGet(proposed: MutualHandshakeSession): StoredHandshakeResult {
    const [partyA, partyB] = getNormalizedHandshakeParties(
      proposed.partyA,
      proposed.partyB,
    );
    const proofForA = proposed.proofs.find(
      (proof) => getAddress(proof.participant) === partyA,
    );
    const proofForB = proposed.proofs.find(
      (proof) => getAddress(proof.participant) === partyB,
    );

    if (!proofForA || !proofForB) {
      throw new Error("Mutual session must contain one proof for each party");
    }

    const result = this.insertSession.run(
      proposed.movementId.toString(),
      partyA,
      partyB,
      proofForA.nonce,
      proofForA.timestamp.toString(),
      proofForA.peerSignature,
      proofForB.nonce,
      proofForB.timestamp.toString(),
      proofForB.peerSignature,
    );

    const session = this.get(proposed.movementId, partyA, partyB);
    if (!session) {
      throw new Error("Handshake session was not persisted");
    }

    return {
      created: result.changes === 1,
      session,
    };
  }

  close(): void {
    this.database.close();
  }
}

/*
  Returns [partyA, partyB] with addresses sorted ascending so
  (Alice, Bob) and (Bob, Alice) share the same storage key.
*/
export function getNormalizedHandshakeParties(
  partyA: string,
  partyB: string,
): [string, string] {
  const normalizedA = getAddress(partyA);
  const normalizedB = getAddress(partyB);

  if (normalizedA === normalizedB) {
    throw new Error("A party cannot handshake with itself");
  }

  return BigInt(normalizedA) < BigInt(normalizedB)
    ? [normalizedA, normalizedB]
    : [normalizedB, normalizedA];
}

function rowToSession(row: HandshakeSessionRow): MutualHandshakeSession {
  const movementId = BigInt(row.movement_id);
  const proofForA: HandshakeProof = {
    movementId,
    participant: row.party_a,
    peer: row.party_b,
    nonce: row.a_nonce,
    timestamp: BigInt(row.a_timestamp),
    peerSignature: row.a_peer_signature,
  };
  const proofForB: HandshakeProof = {
    movementId,
    participant: row.party_b,
    peer: row.party_a,
    nonce: row.b_nonce,
    timestamp: BigInt(row.b_timestamp),
    peerSignature: row.b_peer_signature,
  };

  return {
    movementId,
    partyA: row.party_a,
    partyB: row.party_b,
    proofs: [proofForA, proofForB],
  };
}
