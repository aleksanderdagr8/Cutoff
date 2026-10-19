/**
 * Outbound webhook signing + test receiver.
 * Queue delivery happens after the durable write, never inside the commit tx.
 * Adapters stay free of @cutoff/domain — compare is local.
 */

function signaturesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export type OutboundWebhookJob = {
  deliveryId: string;
  url: string;
  eventType: string;
  body: string;
  createdAtUtc: string;
};

export type SignedWebhookHeaders = {
  "x-cutoff-timestamp": string;
  "x-cutoff-signature": string;
};

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Sign body with timestamp. Header format: t=<unix>,v1=<hex>. */
export async function signOutboundWebhook(
  secret: string,
  timestampUnix: number,
  body: string,
): Promise<SignedWebhookHeaders> {
  const signedPayload = `${timestampUnix}.${body}`;
  const hex = await hmacSha256Hex(secret, signedPayload);
  return {
    "x-cutoff-timestamp": String(timestampUnix),
    "x-cutoff-signature": `t=${timestampUnix},v1=${hex}`,
  };
}

export async function verifyOutboundWebhook(
  secret: string,
  headers: {
    timestamp?: string;
    signature?: string;
  },
  body: string,
): Promise<boolean> {
  if (!headers.timestamp || !headers.signature) return false;
  const match = /^t=(\d+),v1=([a-f0-9]+)$/i.exec(headers.signature);
  if (!match) return false;
  const ts = match[1]!;
  const provided = match[2]!.toLowerCase();
  if (ts !== headers.timestamp) return false;
  const expected = await hmacSha256Hex(secret, `${ts}.${body}`);
  return signaturesEqual(expected, provided);
}

/**
 * Test receiver used in Unit 9: rejects unsigned (or bad-signature) deliveries.
 */
export class TestWebhookReceiver {
  readonly accepted: Array<{ body: string; headers: SignedWebhookHeaders }> =
    [];
  readonly rejected: Array<{ reason: string }> = [];

  constructor(private readonly secret: string) {}

  async receive(
    body: string,
    headers: Partial<SignedWebhookHeaders>,
  ): Promise<{ ok: true } | { ok: false; error: "unsigned" }> {
    const ok = await verifyOutboundWebhook(
      this.secret,
      {
        timestamp: headers["x-cutoff-timestamp"],
        signature: headers["x-cutoff-signature"],
      },
      body,
    );
    if (!ok) {
      this.rejected.push({ reason: "unsigned" });
      return { ok: false, error: "unsigned" };
    }
    this.accepted.push({
      body,
      headers: {
        "x-cutoff-timestamp": headers["x-cutoff-timestamp"]!,
        "x-cutoff-signature": headers["x-cutoff-signature"]!,
      },
    });
    return { ok: true };
  }
}

/**
 * In-memory outbound queue. Writes land here after the order transaction;
 * `drain` signs and delivers (fake Cloudflare Queue consumer).
 */
export class MemoryOutboundWebhookQueue {
  readonly pending: OutboundWebhookJob[] = [];
  readonly delivered: OutboundWebhookJob[] = [];

  enqueue(job: Omit<OutboundWebhookJob, "deliveryId"> & { deliveryId?: string }): void {
    this.pending.push({
      deliveryId: job.deliveryId ?? `whdel_${this.pending.length + 1}`,
      url: job.url,
      eventType: job.eventType,
      body: job.body,
      createdAtUtc: job.createdAtUtc,
    });
  }

  /**
   * Deliver next pending job. When `sign` is false, sends without signature
   * (used to prove the test receiver rejects unsigned outbound).
   */
  async drainOne(opts: {
    secret: string;
    receiver: TestWebhookReceiver;
    nowUnix: number;
    sign?: boolean;
  }): Promise<{ ok: boolean; error?: "unsigned" | "empty" }> {
    const job = this.pending.shift();
    if (!job) return { ok: false, error: "empty" };
    const sign = opts.sign !== false;
    const headers = sign
      ? await signOutboundWebhook(opts.secret, opts.nowUnix, job.body)
      : ({} as Partial<SignedWebhookHeaders>);
    const result = await opts.receiver.receive(job.body, headers);
    if (!result.ok) {
      // Put back so callers can retry signed.
      this.pending.unshift(job);
      return { ok: false, error: "unsigned" };
    }
    this.delivered.push(job);
    return { ok: true };
  }
}
