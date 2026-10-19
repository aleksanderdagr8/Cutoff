/**
 * Principal module repository (households, members).
 * Memory store simulates RLS: a member reads only their household.
 * No Supabase client outside this package — live adapter later.
 */

import { ulid } from "./ulid.js";

export type HouseholdRow = {
  householdId: string;
  name: string;
  createdAt: string;
};

export type MemberRow = {
  memberId: string;
  householdId: string;
  email: string;
  createdAt: string;
};

export type PrincipalRow = {
  principalId: string;
  email: string;
  createdAt: string;
};

export type SessionRole = "member" | "anon" | "service_role";

export type AuthSession = {
  role: SessionRole;
  /** Present when role === "member". */
  memberId?: string;
  householdId?: string;
};

/**
 * Order insert attempt used to prove anon cannot write orders (U1).
 * Real orders live in the commit module; this is a boundary probe only.
 */
export type OrderInsertAttempt = {
  householdId: string;
  amountCents: number;
};

export class MemoryHouseholdRepository {
  private readonly principals: PrincipalRow[] = [];
  private readonly households: HouseholdRow[] = [];
  private readonly members: MemberRow[] = [];
  /** Probe table for U1 anon-insert denial — not the commit ledger. */
  private readonly orderInserts: OrderInsertAttempt[] = [];

  createPrincipal(email: string): PrincipalRow {
    const row: PrincipalRow = {
      principalId: ulid(),
      email,
      createdAt: new Date().toISOString(),
    };
    this.principals.push(row);
    return row;
  }

  createHousehold(name: string, memberEmail: string): {
    household: HouseholdRow;
    member: MemberRow;
  } {
    const household: HouseholdRow = {
      householdId: ulid(),
      name,
      createdAt: new Date().toISOString(),
    };
    const member: MemberRow = {
      memberId: ulid(),
      householdId: household.householdId,
      email: memberEmail,
      createdAt: new Date().toISOString(),
    };
    this.households.push(household);
    this.members.push(member);
    return { household, member };
  }

  /**
   * RLS-shaped read: member session may only see its own household.
   * Service role may read any. Anon gets null.
   */
  getHousehold(
    session: AuthSession,
    householdId: string,
  ): HouseholdRow | null {
    if (session.role === "anon") return null;

    const household =
      this.households.find((h) => h.householdId === householdId) ?? null;
    if (!household) return null;

    if (session.role === "service_role") return household;

    if (
      session.role === "member" &&
      session.memberId &&
      session.householdId === householdId &&
      this.members.some(
        (m) =>
          m.memberId === session.memberId && m.householdId === householdId,
      )
    ) {
      return household;
    }

    return null;
  }

  memberOf(memberId: string, householdId: string): boolean {
    return this.members.some(
      (m) => m.memberId === memberId && m.householdId === householdId,
    );
  }

  /**
   * U1: anon key cannot insert an order. Service role can (worker path).
   * Member path is not used for agent commits — agents use credentials.
   */
  tryInsertOrder(
    session: AuthSession,
    attempt: OrderInsertAttempt,
  ): { ok: true } | { ok: false; error: "unauthenticated" } {
    if (session.role === "anon") {
      return { ok: false, error: "unauthenticated" };
    }
    if (session.role === "service_role") {
      this.orderInserts.push(attempt);
      return { ok: true };
    }
    // Members do not write orders via anon/browser path.
    return { ok: false, error: "unauthenticated" };
  }

  orderInsertCount(): number {
    return this.orderInserts.length;
  }

  getMember(memberId: string): MemberRow | null {
    return this.members.find((m) => m.memberId === memberId) ?? null;
  }
}
