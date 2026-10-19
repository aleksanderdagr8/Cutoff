/**
 * MCP Worker bindings. No DB credentials — API only via service binding.
 */

import type { RateLimiter } from "./rate-limit.js";

/** Cloudflare service binding shape (Fetcher). */
export type ApiService = {
  fetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response>;
};

export type McpBindings = {
  /** Service binding to cutoff-api. */
  API: ApiService;
  /** 30 quotes / minute / key (CF Rate Limiting). */
  QUOTE_RATE_LIMITER: RateLimiter;
  /** 5 commits / minute / key (CF Rate Limiting). */
  COMMIT_RATE_LIMITER: RateLimiter;
};
