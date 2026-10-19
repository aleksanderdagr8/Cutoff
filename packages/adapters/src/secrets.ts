/**
 * Unit 21 — resolve household webhook HMAC secrets by ref (Vault / CF secrets).
 */

export interface SecretStore {
  get(ref: string): Promise<string | null> | string | null;
}

export class MemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>();

  set(ref: string, value: string): void {
    this.values.set(ref, value);
  }

  get(ref: string): string | null {
    return this.values.get(ref) ?? null;
  }
}
