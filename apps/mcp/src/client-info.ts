/**
 * Soft per-key client name from initialize (stateless Worker; isolate-local).
 * Used for commit actor_chain: mcp:<name>.
 */

const clientNameByKeyId = new Map<string, string>();

export function rememberClientName(keyId: string, name: string | undefined) {
  const trimmed = name?.trim();
  if (trimmed) {
    clientNameByKeyId.set(keyId, trimmed);
  }
}

export function clientNameForKey(keyId: string): string {
  return clientNameByKeyId.get(keyId) ?? "unknown";
}
