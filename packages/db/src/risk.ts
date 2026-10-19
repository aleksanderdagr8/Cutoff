/**
 * Risk module state. Kill switch, merchant suspend, velocity, merchant_scores.
 * Gate logic and score math stay in @cutoff/domain; this repo stores facts.
 */

import {
  scoreFromEvents,
  type MerchantScoreEventKind,
} from "@cutoff/domain";
import { ulid } from "./ulid.js";

const HOUR_MS = 60 * 60 * 1000;

export type RiskCommitStamp = {
  householdId: string;
  atUtc: string;
};

/** Append-only score event — materializes into merchant_scores. */
export type MerchantScoreEventRow = {
  eventId: string;
  fulfillerId: string;
  kind: MerchantScoreEventKind;
  orderId: string | null;
  atUtc: string;
  actorId: string;
};

/** Materialized merchant_scores row (risk module table). */
export type MerchantScoreRow = {
  fulfillerId: string;
  score: number;
  updatedAt: string;
};

export type RiskAuditRow = {
  auditId: string;
  action: "kill_switch_on" | "kill_switch_off" | "merchant_suspend" | "merchant_resume";
  actorId: string;
  targetId: string | null;
  atUtc: string;
};

export class MemoryRiskRepository {
  killSwitch = false;
  private readonly suspendedMerchants = new Set<string>();
  private readonly commitStamps: RiskCommitStamp[] = [];
  /** Merchant strike counter from cancel / late ship (not a fee). */
  private readonly merchantStrikes = new Map<string, number>();
  private readonly scoreEvents: MerchantScoreEventRow[] = [];
  private readonly merchantScores = new Map<string, MerchantScoreRow>();
  private readonly audits: RiskAuditRow[] = [];

  setKillSwitch(on: boolean, opts: { actorId: string; atUtc: string }): void {
    this.killSwitch = on;
    this.audits.push({
      auditId: ulid(),
      action: on ? "kill_switch_on" : "kill_switch_off",
      actorId: opsActor(opts.actorId),
      targetId: null,
      atUtc: opts.atUtc,
    });
  }

  /** Test/compat helper without audit — prefer setKillSwitch with actor. */
  setKillSwitchFlag(on: boolean): void {
    this.killSwitch = on;
  }

  suspendMerchant(
    fulfillerId: string,
    opts: { actorId: string; atUtc: string },
  ): void {
    this.suspendedMerchants.add(fulfillerId);
    this.audits.push({
      auditId: ulid(),
      action: "merchant_suspend",
      actorId: opsActor(opts.actorId),
      targetId: fulfillerId,
      atUtc: opts.atUtc,
    });
  }

  resumeMerchant(
    fulfillerId: string,
    opts: { actorId: string; atUtc: string },
  ): void {
    this.suspendedMerchants.delete(fulfillerId);
    this.audits.push({
      auditId: ulid(),
      action: "merchant_resume",
      actorId: opsActor(opts.actorId),
      targetId: fulfillerId,
      atUtc: opts.atUtc,
    });
  }

  isMerchantSuspended(fulfillerId: string): boolean {
    return this.suspendedMerchants.has(fulfillerId);
  }

  recordMerchantStrike(fulfillerId: string, reason: "cancel" | "late_ship"): void {
    const next = (this.merchantStrikes.get(fulfillerId) ?? 0) + 1;
    this.merchantStrikes.set(fulfillerId, next);
    // Strikes also feed merchant_scores (cancel / late).
    const kind: MerchantScoreEventKind =
      reason === "cancel" ? "cancel" : "late";
    this.recordScoreEvent({
      fulfillerId,
      kind,
      orderId: null,
      atUtc: new Date().toISOString(),
      actorId: "system.fulfill",
    });
  }

  merchantStrikeCount(fulfillerId: string): number {
    return this.merchantStrikes.get(fulfillerId) ?? 0;
  }

  /**
   * Append a score event and rematerialize merchant_scores for that fulfiller.
   */
  recordScoreEvent(input: {
    fulfillerId: string;
    kind: MerchantScoreEventKind;
    orderId: string | null;
    atUtc: string;
    actorId: string;
  }): MerchantScoreEventRow {
    const row: MerchantScoreEventRow = {
      eventId: ulid(),
      fulfillerId: input.fulfillerId,
      kind: input.kind,
      orderId: input.orderId,
      atUtc: input.atUtc,
      actorId: input.actorId,
    };
    this.scoreEvents.push(row);
    this.rematerialize(input.fulfillerId, input.atUtc);
    return row;
  }

  private rematerialize(fulfillerId: string, atUtc: string): void {
    const events = this.scoreEvents
      .filter((e) => e.fulfillerId === fulfillerId)
      .map((e) => ({ kind: e.kind }));
    const score = scoreFromEvents(events);
    this.merchantScores.set(fulfillerId, {
      fulfillerId,
      score,
      updatedAt: atUtc,
    });
  }

  merchantScore(fulfillerId: string): number {
    return this.merchantScores.get(fulfillerId)?.score ?? 0;
  }

  scoresByFulfiller(): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of this.merchantScores.values()) {
      map.set(row.fulfillerId, row.score);
    }
    return map;
  }

  listMerchantScores(): readonly MerchantScoreRow[] {
    return [...this.merchantScores.values()];
  }

  listScoreEvents(fulfillerId?: string): readonly MerchantScoreEventRow[] {
    if (!fulfillerId) return this.scoreEvents;
    return this.scoreEvents.filter((e) => e.fulfillerId === fulfillerId);
  }

  listAudits(): readonly RiskAuditRow[] {
    return this.audits;
  }

  /** Record a commit attempt that counts toward velocity (after gate pass). */
  recordCommit(householdId: string, atUtc: string): void {
    this.commitStamps.push({ householdId, atUtc });
  }

  commitsInLastHour(householdId: string, nowUtc: string): number {
    const now = Date.parse(nowUtc);
    const windowStart = now - HOUR_MS;
    return this.commitStamps.filter(
      (s) =>
        s.householdId === householdId && Date.parse(s.atUtc) >= windowStart,
    ).length;
  }
}

function opsActor(actorId: string): string {
  return actorId.trim().length > 0 ? actorId : "system";
}
