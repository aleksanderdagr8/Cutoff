/**
 * Unit 21 — deliver reorder nudges from the queue.
 * Agent webhook: signed POST. Email: EmailNotifyAdapter.
 * After 5 failed agent_webhook attempts, fall back to email.
 */

import type { OutboundWebhookJob } from "@cutoff/adapters";
import { signOutboundWebhook } from "@cutoff/adapters";
import type { ApiBindings } from "../bindings.js";

export const NUDGE_MAX_ATTEMPTS = 5;

export type NudgeDeliverResult = {
  ok: boolean;
  nudgeId: string | null;
  channel: string | null;
  fallbackEmail: boolean;
  error?: string;
};

type NudgeBody = {
  nudge_id?: string;
  household_id?: string;
  line_id?: string;
  display_name?: string | null;
  due_at?: string;
  canonical_item_id?: string;
};

function parseBody(raw: string): NudgeBody | null {
  try {
    const parsed = JSON.parse(raw) as NudgeBody;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function postSignedWebhook(
  bindings: ApiBindings,
  job: OutboundWebhookJob,
  secret: string,
): Promise<{ ok: boolean; status: number }> {
  const nowUnix = Math.floor(Date.parse(bindings.nowUtc()) / 1000);
  const signed = await signOutboundWebhook(secret, nowUnix, job.body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-cutoff-timestamp": signed["x-cutoff-timestamp"],
    "x-cutoff-signature": signed["x-cutoff-signature"],
    "x-cutoff-delivery-id": job.deliveryId,
  };
  const fetchFn = bindings.nudgeFetch ?? fetch;
  const res = await fetchFn(job.url, {
    method: "POST",
    headers,
    body: job.body,
  });
  return { ok: res.ok, status: res.status };
}

/**
 * Deliver one queued nudge job. Updates reorder_nudges status/attempts.
 */
export async function deliverNudgeJob(
  bindings: ApiBindings,
  job: OutboundWebhookJob,
): Promise<NudgeDeliverResult> {
  const body = parseBody(job.body);
  const nudgeId = body?.nudge_id ?? null;
  if (!nudgeId) {
    return {
      ok: false,
      nudgeId: null,
      channel: null,
      fallbackEmail: false,
      error: "missing_nudge_id",
    };
  }

  const nudge = await bindings.reorderNudges.get(nudgeId);
  if (!nudge) {
    return {
      ok: false,
      nudgeId,
      channel: null,
      fallbackEmail: false,
      error: "nudge_not_found",
    };
  }

  if (nudge.status === "acted" || nudge.status === "skipped") {
    return {
      ok: true,
      nudgeId,
      channel: nudge.channel,
      fallbackEmail: false,
    };
  }

  if (nudge.channel === "email") {
    const email = await bindings.emailNotify.sendReorderDue({
      householdId: nudge.householdId,
      lineId: nudge.lineId,
      displayName: body?.display_name ?? null,
      dueAt: nudge.dueAt,
    });
    if (!email.ok) {
      await bindings.reorderNudges.markStatus(nudgeId, "failed", {
        bumpAttempts: true,
      });
      return {
        ok: false,
        nudgeId,
        channel: "email",
        fallbackEmail: false,
        error: email.error,
      };
    }
    await bindings.reorderNudges.markStatus(nudgeId, "sent");
    return { ok: true, nudgeId, channel: "email", fallbackEmail: false };
  }

  // agent_webhook
  const settings = await bindings.nudgeSettings.get(nudge.householdId);
  const secretRef = settings?.agentWebhookSecretRef;
  let secret: string | null = null;
  if (secretRef) {
    secret = (await bindings.secrets.get(secretRef)) ?? null;
  }
  if (!secret) {
    secret = bindings.webhookSecret;
  }

  const posted = await postSignedWebhook(bindings, job, secret);
  if (posted.ok) {
    await bindings.reorderNudges.markStatus(nudgeId, "sent");
    return {
      ok: true,
      nudgeId,
      channel: "agent_webhook",
      fallbackEmail: false,
    };
  }

  const updated = await bindings.reorderNudges.markStatus(nudgeId, "failed", {
    bumpAttempts: true,
  });
  const attempts = updated?.attempts ?? nudge.attempts + 1;

  let fallbackEmail = false;
  if (attempts >= NUDGE_MAX_ATTEMPTS) {
    const email = await bindings.emailNotify.sendReorderDue({
      householdId: nudge.householdId,
      lineId: nudge.lineId,
      displayName: body?.display_name ?? null,
      dueAt: nudge.dueAt,
    });
    fallbackEmail = email.ok;
  }

  return {
    ok: false,
    nudgeId,
    channel: "agent_webhook",
    fallbackEmail,
    error: `http_${posted.status}`,
  };
}

/**
 * Drain in-memory nudge queue (tests / local). CF Queue uses queue() instead.
 */
export async function processPendingNudges(
  bindings: ApiBindings,
): Promise<{ processed: number; ok: number; failed: number }> {
  const queue = bindings.nudgeQueue;
  if (!("pending" in queue) || !Array.isArray(queue.pending)) {
    return { processed: 0, ok: 0, failed: 0 };
  }
  const pending = queue.pending as OutboundWebhookJob[];
  let ok = 0;
  let failed = 0;
  while (pending.length > 0) {
    const job = pending.shift()!;
    const result = await deliverNudgeJob(bindings, job);
    if (result.ok) {
      ok += 1;
      if ("delivered" in queue && Array.isArray(queue.delivered)) {
        (queue.delivered as OutboundWebhookJob[]).push(job);
      }
    } else {
      failed += 1;
    }
  }
  return { processed: ok + failed, ok, failed };
}
