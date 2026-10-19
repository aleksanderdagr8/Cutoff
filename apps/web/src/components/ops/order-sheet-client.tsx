"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents, formatUtcClock } from "@/lib/ops/format";
import type { OpsOrderAction, OpsOrderSheetView } from "@/lib/ops/types";

const ACTION_LABELS: Record<OpsOrderAction, string> = {
  kill_switch_on: "Turn kill switch on",
  kill_switch_off: "Turn kill switch off",
  revoke_key: "Revoke agent key",
  refund: "Refund household",
  cancel_before_ship: "Cancel before ship",
  release_hold: "Release hold",
  pause_line: "Pause list line",
  replay_webhook: "Replay webhook",
  lower_ceiling: "Lower ceiling",
  suspend_fulfiller: "Suspend fulfiller",
  resume_fulfiller: "Resume fulfiller",
};

const ACTION_HINTS: Partial<Record<OpsOrderAction, string>> = {
  kill_switch_on: "Blocks new commits across Cutoff until you turn it off.",
  revoke_key: "Stops this agent key immediately. Secret cannot be regenerated.",
  refund: "Starts a refund path. Write why — it lands in Audit.",
  cancel_before_ship: "Only while the order has not shipped.",
  release_hold: "Frees the open quote hold on this line.",
  pause_line: "Household list line pauses; agent will not reorder it.",
};

type Props = {
  initial: OpsOrderSheetView;
};

export function OrderSheetClient({ initial }: Props) {
  const router = useRouter();
  const [sheet, setSheet] = useState(initial);
  const [action, setAction] = useState<OpsOrderAction | "">(
    initial.available_actions[0] ?? "",
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!action) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/ops/orders/${sheet.order_id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        sheet?: OpsOrderSheetView;
        audit?: { audit_id: string };
      } | null;
      if (!res.ok) {
        setError(
          body?.error === "reason_required"
            ? "A reason is required for every operator action."
            : "Action failed. Nothing was recorded.",
        );
        return;
      }
      if (body?.sheet) {
        setSheet(body.sheet);
        setAction(body.sheet.available_actions[0] ?? "");
      }
      setReason("");
      setMessage(
        body?.audit
          ? `Saved to Audit · ${body.audit.audit_id.slice(0, 10)}…`
          : "Saved to Audit.",
      );
      router.refresh();
    });
  }

  const hint = action ? ACTION_HINTS[action] : undefined;

  return (
    <div className="space-y-10">
      <header>
        <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
          {sheet.household_name}
        </p>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink md:text-[40px]">
          {sheet.brand ? `${sheet.brand} · ` : ""}
          {sheet.item_description}
        </h1>
        <p className="mt-3 text-[16px] text-secondary">
          {formatCents(sheet.landed_cents)} · {sheet.fulfiller_id} ·{" "}
          <span className="font-medium text-ink">{sheet.status}</span>
        </p>
        <p className="mt-2 font-mono text-[12px] text-secondary">
          {sheet.order_id}
        </p>
      </header>

      <section className="border-t border-hairline pt-8">
        <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Evidence
        </h2>
        <p className="mt-2 max-w-xl text-[14px] text-secondary">
          Packed at commit. No card numbers — operators never see PAN.
        </p>
        {sheet.evidence ? (
          <dl className="mt-6 divide-y divide-hairline border-y border-hairline">
            <EvidenceRow
              label="Actor chain"
              value={sheet.evidence.actor_chain.join(" → ")}
              mono
            />
            <EvidenceRow label="Protocol" value={sheet.evidence.protocol} />
            <EvidenceRow
              label="Agent key"
              value={sheet.evidence.agent_key_id}
              mono
            />
            <EvidenceRow
              label="Mandate"
              value={sheet.evidence.mandate_id}
              mono
            />
            <EvidenceRow
              label="Quote hash"
              value={sheet.evidence.quote_hash}
              mono
              breakAll
            />
            <EvidenceRow label="Address" value={sheet.evidence.address_id} />
            <EvidenceRow
              label="Amount"
              value={formatCents(sheet.evidence.amount_cents)}
            />
          </dl>
        ) : (
          <p className="mt-5 text-[15px] text-secondary">
            No evidence pack on this order yet.
          </p>
        )}
      </section>

      <section className="border-t border-hairline pt-8">
        <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Rank inputs
        </h2>
        {sheet.rank_inputs ? (
          <p className="mt-4 text-[15px] text-ink">
            Landed {formatCents(sheet.rank_inputs.landed_cents)} · delivery{" "}
            {sheet.rank_inputs.delivery_date_utc} · merchant score{" "}
            {sheet.rank_inputs.merchant_score}
          </p>
        ) : (
          <p className="mt-4 text-[15px] text-secondary">
            No rank inputs recorded for this order.
          </p>
        )}
      </section>

      <section className="border-t border-hairline pt-8">
        <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Timeline
        </h2>
        {sheet.events.length === 0 ? (
          <p className="mt-5 text-[15px] text-secondary">
            No events on this order yet.
          </p>
        ) : (
          <ol className="mt-5 border-t border-hairline">
            {sheet.events.map((ev, i) => (
              <li
                key={ev.event_id}
                className="ops-row grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 border-b border-hairline py-3 text-[14px]"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <time
                  dateTime={ev.at_utc}
                  className="font-mono text-[12px] tabular-nums text-secondary"
                >
                  {formatUtcClock(ev.at_utc).slice(11, 19)}
                </time>
                <span className="text-ink">{ev.status}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="border-t border-hairline pt-8">
        <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Actions
        </h2>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-secondary">
          Every action needs a reason and writes an audit row. You cannot raise
          a ceiling, impersonate an agent, or see PAN.
        </p>
        {sheet.available_actions.length === 0 ? (
          <p className="mt-6 text-[15px] text-secondary">
            No actions available on this order right now.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 max-w-lg space-y-5">
            <label className="block">
              <span className="text-[13px] text-secondary">Action</span>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as OpsOrderAction)}
                className="mt-2 w-full border-b border-hairline bg-transparent py-2 text-[16px] text-ink outline-none focus:border-accent"
              >
                {sheet.available_actions.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABELS[a]}
                  </option>
                ))}
              </select>
            </label>
            {hint ? (
              <p className="text-[13px] leading-relaxed text-secondary">
                {hint}
              </p>
            ) : null}
            <label className="block">
              <span className="text-[13px] text-secondary">
                Reason (required · audit)
              </span>
              <input
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this action — plain language"
                className="mt-2 w-full border-b border-hairline bg-transparent py-2 text-[16px] text-ink outline-none focus:border-accent"
              />
            </label>
            {error ? <p className="text-[14px] text-red-600">{error}</p> : null}
            {message ? (
              <p className="text-[14px] text-secondary">{message}</p>
            ) : null}
            <button
              type="submit"
              disabled={pending || !action}
              className="ops-cta rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40"
            >
              {pending ? "Recording…" : "Run with audit"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function EvidenceRow({
  label,
  value,
  mono,
  breakAll,
}: {
  label: string;
  value: string;
  mono?: boolean;
  breakAll?: boolean;
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-6">
      <dt className="text-[13px] text-secondary">{label}</dt>
      <dd
        className={`text-[14px] text-ink ${mono ? "font-mono text-[13px]" : ""} ${
          breakAll ? "break-all" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
