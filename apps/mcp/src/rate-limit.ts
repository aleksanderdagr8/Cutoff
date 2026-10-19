/**
 * Unit 19 — per-key rate limits for quote/commit tools.
 * Production: Cloudflare Rate Limiting bindings.
 * Tests: MemoryRateLimiter.
 */

export type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

/** In-memory limiter for unit tests (not location-aware). */
export class MemoryRateLimiter implements RateLimiter {
  private counts = new Map<string, number>();

  constructor(private readonly maxPerWindow: number) {}

  async limit(options: { key: string }): Promise<{ success: boolean }> {
    const next = (this.counts.get(options.key) ?? 0) + 1;
    this.counts.set(options.key, next);
    return { success: next <= this.maxPerWindow };
  }

  /** Test helper. */
  reset() {
    this.counts.clear();
  }
}

export const QUOTE_RATE_LIMIT_PER_MINUTE = 30;
export const COMMIT_RATE_LIMIT_PER_MINUTE = 5;

export function rateLimitedToolResult(kind: "quote" | "commit") {
  const next_action = "try later; do not retry in a loop";
  return {
    content: [
      {
        type: "text" as const,
        text: `rate_limited: too many ${kind}s this minute; ${next_action}`,
      },
    ],
    structuredContent: {
      error: "rate_limited",
      retryable: true,
      next_action,
    },
    isError: true as const,
  };
}
