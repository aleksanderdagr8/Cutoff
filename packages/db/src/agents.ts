/**
 * Agent credential module. Keys are not users.
 * Issue returns secret once; store hash only. Revoke → Postgres + KV fan-out.
 */

import type { AgentScope } from "@cutoff/domain";
import { scopesAreValid } from "@cutoff/domain";
import { generateAgentSecret, sha256Hex } from "./hash.js";
import type { RevocationKv } from "./kv.js";
import { ulid } from "./ulid.js";

export type AgentCredentialRow = {
  keyId: string;
  householdId: string;
  /** SHA-256 hex of the secret. Never the plaintext. */
  secretHash: string;
  scopes: AgentScope[];
  /** Mandates this key may act on. */
  mandateIds: string[];
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type IssueAgentInput = {
  householdId: string;
  scopes: string[];
  mandateIds: string[];
};

export type IssueAgentResult = {
  keyId: string;
  /** Plaintext secret — returned once, never stored. */
  secret: string;
  scopes: AgentScope[];
  mandateIds: string[];
};

export type AuthenticatedAgent = {
  keyId: string;
  householdId: string;
  scopes: AgentScope[];
  mandateIds: string[];
  /** ISO-8601 UTC when the key was issued (for risk key-age check). */
  createdAt: string;
};

export type AuthAgentResult =
  | { ok: true; agent: AuthenticatedAgent }
  | { ok: false; error: "unauthenticated" | "revoked" };

export class MemoryAgentCredentialRepository {
  private readonly rows: AgentCredentialRow[] = [];
  /** Select projection log for U2: prove secret never appears. */
  readonly selectLog: string[] = [];
  readonly structuredLogs: string[] = [];

  constructor(private readonly kv: RevocationKv) {}

  async issue(input: IssueAgentInput): Promise<IssueAgentResult> {
    if (!scopesAreValid(input.scopes)) {
      throw new Error("invalid_scopes");
    }
    const secret = generateAgentSecret();
    const secretHash = await sha256Hex(secret);
    const keyId = ulid();
    const row: AgentCredentialRow = {
      keyId,
      householdId: input.householdId,
      secretHash,
      scopes: input.scopes as AgentScope[],
      mandateIds: [...input.mandateIds],
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(row);
    // Structured log on issue — must never include the secret.
    this.structuredLogs.push(
      JSON.stringify({
        event: "agent_issued",
        key_id: keyId,
        household_id: input.householdId,
      }),
    );
    return {
      keyId,
      secret,
      scopes: row.scopes,
      mandateIds: row.mandateIds,
    };
  }

  async revoke(keyId: string): Promise<boolean> {
    const row = this.rows.find((r) => r.keyId === keyId);
    if (!row) return false;
    if (!row.revokedAt) {
      row.revokedAt = new Date().toISOString();
    }
    await this.kv.putRevoked(keyId);
    this.structuredLogs.push(
      JSON.stringify({ event: "agent_revoked", key_id: keyId }),
    );
    return true;
  }

  /**
   * Gate: read KV first, fall back to Postgres (memory row) on miss.
   */
  async authenticate(bearerSecret: string): Promise<AuthAgentResult> {
    if (!bearerSecret || !bearerSecret.startsWith("ck_live_")) {
      return { ok: false, error: "unauthenticated" };
    }
    const hash = await sha256Hex(bearerSecret);
    const row = this.rows.find((r) => r.secretHash === hash);
    if (!row) {
      return { ok: false, error: "unauthenticated" };
    }

    const kvHit = await this.kv.isRevoked(row.keyId);
    if (kvHit === true) {
      return { ok: false, error: "revoked" };
    }
    // Cache miss → Postgres / memory source of truth.
    if (row.revokedAt) {
      // Repair KV fan-out.
      await this.kv.putRevoked(row.keyId);
      return { ok: false, error: "revoked" };
    }

    row.lastUsedAt = new Date().toISOString();
    // Select projection used by handlers — hash only, never secret.
    this.selectLog.push(
      JSON.stringify({
        key_id: row.keyId,
        household_id: row.householdId,
        secret_hash: row.secretHash,
        scopes: row.scopes,
      }),
    );

    return {
      ok: true,
      agent: {
        keyId: row.keyId,
        householdId: row.householdId,
        scopes: row.scopes,
        mandateIds: row.mandateIds,
        createdAt: row.createdAt,
      },
    };
  }

  /** Safe select: never returns secret or anything that could be one. */
  selectByKeyId(keyId: string): Omit<AgentCredentialRow, never> | null {
    const row = this.rows.find((r) => r.keyId === keyId);
    if (!row) return null;
    const projected = {
      keyId: row.keyId,
      householdId: row.householdId,
      secretHash: row.secretHash,
      scopes: row.scopes,
      mandateIds: row.mandateIds,
      revokedAt: row.revokedAt,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    };
    this.selectLog.push(JSON.stringify(projected));
    return projected;
  }

  /** Test helper: all stored hashes (no secrets exist in storage). */
  storedHashes(): string[] {
    return this.rows.map((r) => r.secretHash);
  }
}
