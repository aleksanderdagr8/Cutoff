/**
 * Unit 20 — cron nudge row writer (idempotent).
 * Selects due lines, inserts reorder_nudges (on conflict do nothing),
 * enqueues one message per newly created nudge. Delivery is Unit 21.
 */

import type { NudgeChannel } from "@cutoff/db";
import type { ApiBindings } from "../bindings.js";

export type NudgeCronResult = {
  scanned: number;
  created: number;
  skippedExisting: number;
  enqueued: number;
};

function channelsForHousehold(
  settings: {
    agentWebhookUrl: string | null;
    emailEnabled: boolean;
  } | null,
): NudgeChannel[] {
  const channels: NudgeChannel[] = [];
  if (settings?.agentWebhookUrl) {
    channels.push("agent_webhook");
  }
  // Default settings: emailEnabled=true when no row yet.
  if (settings == null || settings.emailEnabled) {
    channels.push("email");
  }
  return channels;
}

function suggestedDeliverBy(dueAt: string): string {
  // YYYY-MM-DD for agent quote deliver_by.
  return dueAt.slice(0, 10);
}

function buildNudgeBody(input: {
  nudgeId: string;
  householdId: string;
  lineId: string;
  canonicalItemId: string;
  displayName: string | null;
  dueAt: string;
}): string {
  return JSON.stringify({
    type: "reorder.due",
    nudge_id: input.nudgeId,
    household_id: input.householdId,
    line_id: input.lineId,
    canonical_item_id: input.canonicalItemId,
    display_name: input.displayName,
    due_at: input.dueAt,
    suggested: {
      qty: 1,
      deliver_by: suggestedDeliverBy(input.dueAt),
    },
    actions: {
      quote: "POST /v1/list/reorder",
      skip: "POST /v1/list/skip",
    },
  });
}

/**
 * Cron tick: durable nudge rows first, then enqueue for Unit 21 delivery.
 */
export async function runNudgeCron(
  bindings: ApiBindings,
): Promise<NudgeCronResult> {
  const nowUtc = bindings.nowUtc();
  const dueLines = await bindings.list.listDueForNudgeCron(nowUtc);

  let created = 0;
  let skippedExisting = 0;
  let enqueued = 0;

  for (const line of dueLines) {
    if (line.nextDueAt == null) continue;

    const settings = await bindings.nudgeSettings.get(line.householdId);
    const channels = channelsForHousehold(settings);
    const displayName =
      bindings.catalog.get(line.canonicalItemId)?.description ?? null;

    for (const channel of channels) {
      const inserted = await bindings.reorderNudges.insert({
        householdId: line.householdId,
        lineId: line.lineId,
        dueAt: line.nextDueAt,
        channel,
        nowUtc,
      });

      if (!inserted.ok) {
        skippedExisting += 1;
        continue;
      }
      if (!inserted.created) {
        skippedExisting += 1;
        continue;
      }

      created += 1;

      const url =
        channel === "agent_webhook"
          ? (settings?.agentWebhookUrl ?? "")
          : "https://notify.callcutoff.com/email";

      bindings.nudgeQueue.enqueue({
        url,
        eventType: "reorder.due",
        body: buildNudgeBody({
          nudgeId: inserted.nudge.nudgeId,
          householdId: line.householdId,
          lineId: line.lineId,
          canonicalItemId: line.canonicalItemId,
          displayName,
          dueAt: line.nextDueAt,
        }),
        createdAtUtc: nowUtc,
        deliveryId: `nudge_${inserted.nudge.nudgeId}`,
      });
      enqueued += 1;
    }
  }

  return {
    scanned: dueLines.length,
    created,
    skippedExisting,
    enqueued,
  };
}
