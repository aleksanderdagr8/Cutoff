import type {
  AuthSession,
  HouseholdRow,
  MemberRow,
  OrderInsertAttempt,
} from "../households.js";
import type { CutoffSupabaseClient } from "../supabase-client.js";
import { ulid } from "../ulid.js";
import { throwOnError } from "./mappers.js";

type DbHousehold = {
  household_id: string;
  name: string;
  created_at: string;
};

type DbMember = {
  member_id: string;
  household_id: string;
  email: string;
  created_at: string;
};

/**
 * Minimal household/member writes for Postgres mode FK parents.
 * RLS-shaped reads match the memory repo conventions.
 */
export class PostgresHouseholdRepository {
  constructor(private readonly db: CutoffSupabaseClient) {}

  async createHousehold(
    name: string,
    memberEmail: string,
  ): Promise<{ household: HouseholdRow; member: MemberRow }> {
    const householdId = ulid();
    const memberId = ulid();
    const createdAt = new Date().toISOString();

    const { error: hhError } = await this.db.from("households").insert({
      household_id: householdId,
      name,
      created_at: createdAt,
    });
    throwOnError(hhError, "households.insert");

    const { error: memberError } = await this.db.from("members").insert({
      member_id: memberId,
      household_id: householdId,
      email: memberEmail,
      created_at: createdAt,
    });
    throwOnError(memberError, "members.insert");

    return {
      household: {
        householdId,
        name,
        createdAt,
      },
      member: {
        memberId,
        householdId,
        email: memberEmail,
        createdAt,
      },
    };
  }

  async getHousehold(
    session: AuthSession,
    householdId: string,
  ): Promise<HouseholdRow | null> {
    if (session.role === "anon") return null;

    const { data, error } = await this.db
      .from("households")
      .select("*")
      .eq("household_id", householdId)
      .maybeSingle();
    throwOnError(error, "households.get");
    if (!data) return null;
    const household = data as DbHousehold;

    if (session.role === "service_role") {
      return {
        householdId: household.household_id,
        name: household.name,
        createdAt: household.created_at,
      };
    }

    if (
      session.role === "member" &&
      session.memberId &&
      session.householdId === householdId
    ) {
      const member = await this.getMember(session.memberId);
      if (member?.householdId === householdId) {
        return {
          householdId: household.household_id,
          name: household.name,
          createdAt: household.created_at,
        };
      }
    }
    return null;
  }

  async getMember(memberId: string): Promise<MemberRow | null> {
    const { data, error } = await this.db
      .from("members")
      .select("*")
      .eq("member_id", memberId)
      .maybeSingle();
    throwOnError(error, "members.get");
    if (!data) return null;
    const row = data as DbMember;
    return {
      memberId: row.member_id,
      householdId: row.household_id,
      email: row.email,
      createdAt: row.created_at,
    };
  }

  async memberOf(memberId: string, householdId: string): Promise<boolean> {
    const member = await this.getMember(memberId);
    return member?.householdId === householdId;
  }

  async listHouseholds(): Promise<readonly HouseholdRow[]> {
    const { data, error } = await this.db.from("households").select("*");
    throwOnError(error, "households.list");
    return ((data ?? []) as DbHousehold[]).map((h) => ({
      householdId: h.household_id,
      name: h.name,
      createdAt: h.created_at,
    }));
  }

  /** Probe kept for API parity; service role only (same as memory). */
  tryInsertOrder(
    session: AuthSession,
    _attempt: OrderInsertAttempt,
  ): { ok: true } | { ok: false; error: "unauthenticated" } {
    void _attempt;
    if (session.role === "service_role") return { ok: true };
    return { ok: false, error: "unauthenticated" };
  }
}
