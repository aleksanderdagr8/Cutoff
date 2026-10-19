"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents, formatUtcClock } from "@/lib/ops/format";
import type { OpsOrderAction, OpsOrderSheetView } from "@/lib/ops/types";

const ACTION_LABELS: Record<OpsOrderAction, string> = {
  kill_switch_on: "Turn kill switch on",
  kill_switch_off: "Turn kill switch off",
  revoke_key: "Revoke agent key",
  refund: "Refund",
  cancel_before_ship: "Cancel before ship",
  release_hold: "Release hold",
  pause_line: "Pause list line",
  replay_webhook: "Replay webhook",
  lower_ceiling: "Lower ceiling",
  suspend_fulfiller: "Suspend fulfiller",
  resume_fulfiller: "Resume fulfiller",
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
            : "Action failed.",
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
          ? `Recorded · audit ${body.audit.audit_id.slice(0, 10)}…`
          : "Recorded.",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-10">
      <header>
        <p className="text-[13px] text-secondary">{sheet.household_name}</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-ink">
          {sheet.brand ? `${sheet.brand} · ` : ""}
          {sheet.item_description}
        </h1>
        <p className="mt-2 text-[15px] text-secondary">
          {formatCents(sheet.landed_cents)} · {sheet.fulfiller_id} ·{" "}
          <span className="text-ink">{sheet.status}</span>
        </p>
      </header>

      <section className="border-t border-hairline pt-6">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
          Evidence
        </h2>
        {sheet.evidence ? (
          <dl className="mt-4 grid gap-3 text-[14px] sm:grid-cols-2">
            <div>
              <dt className="text-secondary">Actor chain</dt>
              <dd className="mt-1 font-mono text-[13px] text-ink">
                {sheet.evidence.actor_chain.join(" → ")}
              </dd>
            </div>
            <div>
              <dt className="text-secondary">Protocol</dt>
              <dd className="mt-1 text-ink">{sheet.evidence.protocol}</dd>
            </div>
            <div>
              <dt className="text-secondary">Agent key</dt>
              <dd className="mt-1 font-mono text-[13px] text-ink">
                {sheet.evidence.agent_key_id}
              </dd>
            </div>
            <div>
              <dt className="text-secondary">Mandate</dt>
              <dd className="mt-1 font-mono text-[13px] text-ink">
                {sheet.evidence.mandate_id}
              </dd>
            </div>
            <div>
              <dt className="text-secondary">Quote hash</dt>
              <dd className="mt-1 break-all font-mono text-[12px] text-ink">
                {sheet.evidence.quote_hash}
              </dd>
            </div>
            <div>
              <dt className="text-secondary">Address</dt>
              <dd className="mt-1 text-ink">{sheet.evidence.address_id}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-[15px] text-secondary">
            No evidence pack on this order.
          </p>
        )}
      </section>

      <section className="border-t border-hairline pt-6">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
          Rank inputs
        </h2>
        {sheet.rank_inputs ? (
          <p className="mt-4 text-[15px] text-ink">
            Landed {formatCents(sheet.rank_inputs.landed_cents)} · delivery{" "}
            {sheet.rank_inputs.delivery_date_utc} · merchant score{" "}
            {sheet.rank_inputs.merchant_score}
          </p>
        ) : (
          <p className="mt-4 text-[15px] text-secondary">No rank inputs.</p>
        )}
      </section>

      <section className="border-t border-hairline pt-6">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
          Events
        </h2>
        <ul className="mt-4 border-t border-hairline">
          {sheet.events.map((ev, i) => (
            <li
              key={ev.event_id}
              className="ops-row flex justify-between gap-4 border-b border-hairline py-3 text-[14px]"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <span className="text-ink">{ev.status}</span>
              <span className="text-secondary">
                {formatUtcClock(ev.at_utc)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-hairline pt-6">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
          Actions
        </h2>
        <p className="mt-2 text-[13px] text-secondary">
          Every action needs a reason and writes an audit row. Operators cannot
          raise a ceiling, impersonate an agent, or see PAN.
        </p>
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
          <label className="block">
            <span className="text-[13px] text-secondary">Reason</span>
            <input
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this action"
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
            className="rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition-opacity duration-[160ms] ease-out disabled:opacity-40"
          >
            {pending ? "Recording…" : "Run with audit"}
          </button>
        </form>
      </section>
    </div>
  );
}
