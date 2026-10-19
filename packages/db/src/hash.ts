/**
 * Agent secret hashing. Hash at rest; plaintext shown once at issue.
 * SHA-256 hex via Web Crypto — available in Workers and Node 20+.
 */

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Issue secret format: ck_live_<48 hex chars>. */
export function generateAgentSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ck_live_${hex}`;
}
