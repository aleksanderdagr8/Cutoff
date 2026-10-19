/** Minimal ULID generator using Web Crypto (Workers + Node 20). */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(nowMs: number = Date.now()): string {
  let t = Math.max(0, Math.floor(nowMs));
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out = CROCKFORD[t & 31]! + out;
    t = Math.floor(t / 32);
  }
  const rand = new Uint8Array(10);
  crypto.getRandomValues(rand);
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < 10; i += 1) {
    acc = (acc << 8) | rand[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD[(acc >> bits) & 31]!;
    }
  }
  if (bits > 0) {
    out += CROCKFORD[(acc << (5 - bits)) & 31]!;
  }
  return out.slice(0, 26);
}
