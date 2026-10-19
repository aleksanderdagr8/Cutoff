/**
 * MCP Worker bindings. No DB credentials — API only via service binding.
 */

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
};
