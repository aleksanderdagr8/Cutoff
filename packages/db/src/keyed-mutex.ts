/**
 * In-process stand-in for the Postgres advisory locks in `commit_order_record`.
 * Locks are acquired in sorted key order so two commits cannot deadlock.
 * Not re-entrant: a task must not `run` again on a key it already holds.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(keys: readonly string[], task: () => Promise<T>): Promise<T> {
    const ordered = [...new Set(keys)].sort();
    const releases: Array<() => void> = [];
    try {
      for (const key of ordered) {
        const previous = this.tails.get(key) ?? Promise.resolve();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const tail = previous.then(
          () => gate,
          () => gate,
        );
        this.tails.set(key, tail);
        releases.push(release);
        await previous;
      }
      return await task();
    } finally {
      for (const release of releases.reverse()) release();
    }
  }
}

export function commitLanes(input: {
  householdId: string;
  idempotencyKey: string;
  quoteId: string;
}): string[] {
  return [
    `quote:${input.quoteId}`,
    `idem:${input.householdId}:${input.idempotencyKey}`,
  ];
}
