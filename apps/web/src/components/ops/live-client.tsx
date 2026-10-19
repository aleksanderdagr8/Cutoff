"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents, formatUtcClock } from "@/lib/ops/format";
import type {
  OpsAlertView,
  OpsFlowRowView,
  OpsNeverCommittedView,
} from "@/lib/ops/types";

type Props = {
  initialRows: OpsFlowRowView[];
  initialNeverCommitted: OpsNeverCommittedView[];
  initialAlerts: OpsAlertView[];
  killSwitch: boolean;
};

export function LiveClient({
  initialRows,
  initialNeverCommitted,
  initialAlerts,
  killSwitch,
}: Props) {
  const router = useRouter();
  const [neverCommitted, setNeverCommitted] = useState(initialNeverCommitted);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function releaseHold(quoteId: string) {
    const reason = window.prompt(
      "Reason for releasing this hold (required for audit):",
    );
    if (reason == null) return;
    setError(null);
    setPendingQuote(quoteId);
    startTransition(async () => {
      const res = await fetch("/api/ops/holds/release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quote_id: quoteId, reason }),
      });
      setPendingQuote(null);
      if (!res.ok) {
        setError("Could not release hold.");
        return;
      }
      setNeverCommitted((prev) => prev.filter((q) => q.quote_id !== quoteId));
      router.refresh();
    });
  }

  return (
    <div className="space-y-10">
      <AlertsStrip alerts={initialAlerts} killSwitch={killSwitch} />

      {error ? <p className="text-[14px] text-red-600">{error}</p> : null}

      <section>
        <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
          Orders
        </h2>
        {initialRows.length === 0 ? (
          <p className="mt-4 text-[15px] text-secondary">
            No order events yet.
          </p>
        ) : (
          <ul className="mt-4 border-t border-hairline">
            {initialRows.map((row, i) => (
              <li
                key={row.order_id}
                className="ops-row border-b border-hairline"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Link
                  href={`/ops/orders/${row.order_id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-4 transition-colors duration-[160ms] ease-out hover:bg-accent/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] text-ink">
                      {row.item_description}
                    </p>
                    <p className="mt-1 text-[13px] text-secondary">
                      {formatUtcClock(row.at_utc)} · {row.household_name} ·{" "}
                      {formatCents(row.landed_cents)} · {row.fulfiller_id} ·{" "}
                      <span className="font-mono text-[12px]">
                        {row.agent_key_id.slice(0, 12)}
                      </span>
                    </p>
                  </div>
                  <p className="text-[13px] font-medium text-accent">
                    {row.last_event}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
          Never committed
        </h2>
        {neverCommitted.length === 0 ? (
          <p className="mt-4 text-[15px] text-secondary">
            No open quotes waiting on commit.
          </p>
        ) : (
          <ul className="mt-4 border-t border-hairline">
            {neverCommitted.map((q, i) => (
              <li
                key={q.quote_id}
                className="ops-row flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline py-4"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] text-ink">{q.item_description}</p>
                  <p className="mt-1 text-[13px] text-secondary">
                    {q.household_name} · {formatCents(q.landed_cents)} ·{" "}
                    {q.fulfiller_id}
                    {q.expired ? (
                      <span className="text-red-600"> · expired</span>
                    ) : (
                      ` · expires ${formatUtcClock(q.expires_at)}`
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pendingQuote === q.quote_id}
                  onClick={() => releaseHold(q.quote_id)}
                  className="text-[14px] text-accent underline-offset-2 hover:underline disabled:opacity-40"
                >
                  {pendingQuote === q.quote_id ? "Releasing…" : "Release hold"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AlertsStrip({
  alerts,
  killSwitch,
}: {
  alerts: OpsAlertView[];
  killSwitch: boolean;
}) {
  if (alerts.length === 0 && !killSwitch) {
    return (
      <section className="border-b border-hairline pb-6">
        <p className="text-[13px] text-secondary">No active alerts.</p>
      </section>
    );
  }

  return (
    <section className="border-b border-hairline pb-6">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
        Alerts
      </h2>
      <ul className="mt-3 space-y-2">
        {alerts.map((a) => (
          <li key={a.alert_id} className="ops-row text-[14px]">
            {a.href ? (
              <Link
                href={a.href}
                className="text-ink underline-offset-2 hover:underline"
              >
                <span
                  className={
                    a.severity === "critical" || a.severity === "warn"
                      ? "text-red-600"
                      : "text-secondary"
                  }
                >
                  {a.title}
                </span>
                <span className="text-secondary"> — {a.detail}</span>
              </Link>
            ) : (
              <>
                <span
                  className={
                    a.severity === "critical" || a.severity === "warn"
                      ? "text-red-600"
                      : "text-secondary"
                  }
                >
                  {a.title}
                </span>
                <span className="text-secondary"> — {a.detail}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
