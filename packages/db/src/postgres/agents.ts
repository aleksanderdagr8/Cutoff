import type { AgentScope } from "@cutoff/domain";
import { scopesAreValid } from "@cutoff/domain";
import type {
  AgentCredentialRepository,
  AgentCredentialRow,
  AuthAgentResult,
  IssueAgentInput,
  IssueAgentResult,
} from "../agents.js";
import { generateAgentSecret, sha256Hex } from "../hash.js";
import type { RevocationKv } from "../kv.js";
import type { CutoffSupabaseClient } from "../supabase-client.js";
import { ulid } from "../ulid.js";
import { mapAgent, throwOnError, type DbAgent } from "./mappers.js";

export class PostgresAgentCredentialRepository
  implements AgentCredentialRepository
{
  readonly selectLog: string[] = [];
  readonly structuredLogs: string[] = [];

  constructor(
    private readonly db: CutoffSupabaseClient,
    private readonly kv: RevocationKv,
  ) {}

  async issue(input: IssueAgentInput): Promise<IssueAgentResult> {
    if (!scopesAreValid(input.scopes)) {
      throw new Error("invalid_scopes");
    }
    const secret = generateAgentSecret();
    const secretHash = await sha256Hex(secret);
    const keyId = ulid();
    const createdAt = new Date().toISOString();
    const { error } = await this.db.from("agent_credentials").insert({
      key_id: keyId,
      household_id: input.householdId,
      secret_hash: secretHash,
      scopes: input.scopes,
      mandate_ids: input.mandateIds,
      revoked_at: null,
      last_used_at: null,
      created_at: createdAt,
    });
    throwOnError(error, "agent_credentials.insert");
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
      scopes: input.scopes as AgentScope[],
      mandateIds: [...input.mandateIds],
    };
  }

  async revoke(keyId: string): Promise<boolean> {
    const existing = await this.selectByKeyId(keyId);
    if (!existing) return false;
    const revokedAt = existing.revokedAt ?? new Date().toISOString();
    if (!existing.revokedAt) {
      const { error } = await this.db
        .from("agent_credentials")
        .update({ revoked_at: revokedAt })
        .eq("key_id", keyId);
      throwOnError(error, "agent_credentials.revoke");
    }
    const { error: revError } = await this.db.from("revocations").upsert({
      key_id: keyId,
      revoked_at: revokedAt,
    });
    throwOnError(revError, "revocations.upsert");
    await this.kv.putRevoked(keyId);
    this.structuredLogs.push(
      JSON.stringify({ event: "agent_revoked", key_id: keyId }),
    );
    return true;
  }

  async authenticate(bearerSecret: string): Promise<AuthAgentResult> {
    if (!bearerSecret || !bearerSecret.startsWith("ck_live_")) {
      return { ok: false, error: "unauthenticated" };
    }
    const hash = await sha256Hex(bearerSecret);
    const { data, error } = await this.db
      .from("agent_credentials")
      .select("*")
      .eq("secret_hash", hash)
      .maybeSingle();
    throwOnError(error, "agent_credentials.authenticate");
    if (!data) {
      return { ok: false, error: "unauthenticated" };
    }
    const row = mapAgent(data as DbAgent);

    const kvHit = await this.kv.isRevoked(row.keyId);
    if (kvHit === true) {
      return { ok: false, error: "revoked" };
    }
    if (row.revokedAt) {
      await this.kv.putRevoked(row.keyId);
      return { ok: false, error: "revoked" };
    }

    const lastUsedAt = new Date().toISOString();
    const { error: touchError } = await this.db
      .from("agent_credentials")
      .update({ last_used_at: lastUsedAt })
      .eq("key_id", row.keyId);
    throwOnError(touchError, "agent_credentials.touch");

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

  async selectByKeyId(
    keyId: string,
  ): Promise<Omit<AgentCredentialRow, never> | null> {
    const { data, error } = await this.db
      .from("agent_credentials")
      .select("*")
      .eq("key_id", keyId)
      .maybeSingle();
    throwOnError(error, "agent_credentials.selectByKeyId");
    if (!data) return null;
    const projected = mapAgent(data as DbAgent);
    this.selectLog.push(JSON.stringify(projected));
    return projected;
  }

  async listForHousehold(
    householdId: string,
  ): Promise<readonly AgentCredentialRow[]> {
    const { data, error } = await this.db
      .from("agent_credentials")
      .select("*")
      .eq("household_id", householdId);
    throwOnError(error, "agent_credentials.listForHousehold");
    return ((data ?? []) as DbAgent[]).map(mapAgent);
  }

  storedHashes(): string[] {
    // Postgres source of truth — not buffered; test helper is memory-oriented.
    return [];
  }
}
