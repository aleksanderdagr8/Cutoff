/**
 * Risk module state. Kill switch, merchant suspend, velocity counters.
 * Gate logic stays in @cutoff/domain; this repo only stores facts.
 */

const HOUR_MS = 60 * 60 * 1000;

export type RiskCommitStamp = {
  householdId: string;
  atUtc: string;
};

export class MemoryRiskRepository {
  killSwitch = false;
  private readonly suspendedMerchants = new Set<string>();
  private readonly commitStamps: RiskCommitStamp[] = [];

  setKillSwitch(on: boolean): void {
    this.killSwitch = on;
  }

  suspendMerchant(fulfillerId: string): void {
    this.suspendedMerchants.add(fulfillerId);
  }

  resumeMerchant(fulfillerId: string): void {
    this.suspendedMerchants.delete(fulfillerId);
  }

  isMerchantSuspended(fulfillerId: string): boolean {
    return this.suspendedMerchants.has(fulfillerId);
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
