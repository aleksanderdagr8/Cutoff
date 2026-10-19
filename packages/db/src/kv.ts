/**
 * Revoked-key cache. Framework: KV for revoked-key lookups, rebuilt from Postgres.
 * Memory implementation for CI / Units 1–3.
 */

export interface RevocationKv {
  putRevoked(keyId: string): Promise<void>;
  isRevoked(keyId: string): Promise<boolean | null>;
  /** Test helper on memory impl — force a cache miss. */
  clearKey?(keyId: string): void;
}

/** In-memory KV. null means "cache miss" so the gate falls back to Postgres. */
export class MemoryRevocationKv implements RevocationKv {
  private readonly revoked = new Set<string>();
  /** Simulate cold cache: ids in this set always miss until put again. */
  private readonly forceMiss = new Set<string>();

  async putRevoked(keyId: string): Promise<void> {
    this.forceMiss.delete(keyId);
    this.revoked.add(keyId);
  }

  async isRevoked(keyId: string): Promise<boolean | null> {
    if (this.forceMiss.has(keyId)) return null;
    if (this.revoked.has(keyId)) return true;
    return null;
  }

  /** Test helper: force a cache miss so Postgres fallback is exercised. */
  clearKey(keyId: string): void {
    this.revoked.delete(keyId);
    this.forceMiss.add(keyId);
  }
}
