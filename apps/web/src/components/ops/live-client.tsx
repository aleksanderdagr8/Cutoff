"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { formatCents, formatUtcClock } from "@/lib/ops/format";
import type {
  OpsAlertView,
  OpsFlowRowView,
  OpsLiveView,
  OpsNeverCommittedView,
} from "@/lib/ops/types";

const POLL_MS = 8_000;

type StatusFilter = "all" | "attention" | "ok";

type Props = {
  initialRows: OpsFlowRowView[];
  initialNeverCommitted: OpsNeverCommittedView[];
  initialAlerts: OpsAlertView[];
  killSwitch: boolean;
};

function needsAttention(status: string): boolean {
  const s = status.toLowerCase();
  return (
    s.includes("hold") ||
    s.includes("stuck") ||
    s.includes("fail") ||
    s.includes("kill") ||
    s.includes("refund") ||
    s.includes("cancel") ||
    s === "captured"
  );
}

export function LiveClient({
  initialRows,
  initialNeverCommitted,
  initialAlerts,
  killSwitch: initialKill,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [neverCommitted, setNeverCommitted] = useState(initialNeverCommitted);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [killSwitch, setKillSwitch] = useState(initialKill);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      setRefreshing(true);
      try {
        const res = await fetch("/api/ops/live", { cache: "no-store" });
        if (!res.ok) return;
        const live = (await res.json()) as OpsLiveView;
        if (cancelled) return;
        setRows(live.rows);
        setNeverCommitted(live.never_committed);
        setAlerts(live.alerts);
        setKillSwitch(live.kill_switch);
        setLastRefreshAt(new Date().toISOString());
      } catch {
        /* keep last good snapshot */
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }

    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  function releaseHold(quoteId: string) {
    const reason = window.prompt(
      "Why are you releasing this hold? (saved in the audit log)",
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
        setError("Could not release hold. Try again or check Audit.");
        return;
      }
      setNeverCommitted((prev) => prev.filter((q) => q.quote_id !== quoteId));
      router.refresh();
    });
  }

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (filter === "attention" && !needsAttention(row.last_event)) return false;
    if (filter === "ok" && needsAttention(row.last_event)) return false;
    if (!q) return true;
    return (
      row.item_description.toLowerCase().includes(q) ||
      row.household_name.toLowerCase().includes(q) ||
      row.fulfiller_id.toLowerCase().includes(q) ||
      row.last_event.toLowerCase().includes(q) ||
      row.order_id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-10">
      <AlertsStrip alerts={alerts} killSwitch={killSwitch} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <FilterChip
            label="All"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterChip
            label="Needs attention"
            active={filter === "attention"}
            onClick={() => setFilter("attention")}
          />
          <FilterChip
            label="Moving"
            active={filter === "ok"}
            onClick={() => setFilter("ok")}
          />
        </div>
        <div className="flex items-center gap-3 text-[13px] text-secondary">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full bg-accent ${
              refreshing ? "ops-live-dot" : ""
            }`}
            aria-hidden
          />
          <span>
            {lastRefreshAt
              ? `Updated ${formatUtcClock(lastRefreshAt)}`
              : "Live · refreshes every 8s"}
          </span>
        </div>
      </div>

      <label className="block max-w-md">
        <span className="sr-only">Filter orders</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by household, item, status…"
          className="w-full border-b border-hairline bg-transparent py-2 text-[16px] text-ink outline-none transition-[border-color] duration-160 ease-out focus:border-accent"
        />
      </label>

      {error ? <p className="text-[14px] text-red-600">{error}</p> : null}

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
            Orders
          </h2>
          <p className="text-[13px] text-secondary">
            {filtered.length} of {rows.length}
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="mt-6 text-[15px] leading-relaxed text-secondary">
            No order events yet. When an agent commits, the stream appears
            here — nothing is hidden behind a dashboard.
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-6 text-[15px] leading-relaxed text-secondary">
            No orders match this filter. Clear search or switch to All.
          </p>
        ) : (
          <ul className="mt-5 border-t border-hairline">
            {filtered.map((row, i) => (
              <li
                key={row.order_id}
                className="ops-row border-b border-hairline"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <Link
                  href={`/ops/orders/${row.order_id}`}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-4 transition-colors duration-160 ease-out hover:bg-accent/[0.03] sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]"
                >
                  <time
                    dateTime={row.at_utc}
                    className="font-mono text-[12px] tabular-nums text-secondary"
                  >
                    {formatUtcClock(row.at_utc).slice(11, 19)}
                  </time>
                  <div className="min-w-0">
                    <p className="text-[16px] text-ink">
                      {row.item_description}
                    </p>
                    <p className="mt-1 text-[13px] text-secondary">
                      {row.household_name} · {formatCents(row.landed_cents)} ·{" "}
                      {row.fulfiller_id} ·{" "}
                      <span className="font-mono text-[12px]">
                        {row.agent_key_id.slice(0, 12)}
                      </span>
                    </p>
                  </div>
                  <p
                    className={`justify-self-end text-[13px] font-medium ${
                      needsAttention(row.last_event)
                        ? "text-red-600"
                        : "text-accent"
                    }`}
                  >
                    {row.last_event}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-hairline pt-8">
        <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Never committed
        </h2>
        <p className="mt-2 max-w-xl text-[14px] text-secondary">
          Open quotes still holding a line. Release only when you are sure the
          agent will not commit.
        </p>
        {neverCommitted.length === 0 ? (
          <p className="mt-5 text-[15px] text-secondary">
            No open quotes waiting on commit.
          </p>
        ) : (
          <ul className="mt-5 border-t border-hairline">
            {neverCommitted.map((qRow, i) => (
              <li
                key={qRow.quote_id}
                className="ops-row flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline py-4"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] text-ink">
                    {qRow.item_description}
                  </p>
                  <p className="mt-1 text-[13px] text-secondary">
                    {qRow.household_name} · {formatCents(qRow.landed_cents)} ·{" "}
                    {qRow.fulfiller_id}
                    {qRow.expired ? (
                      <span className="text-red-600"> · expired</span>
                    ) : (
                      ` · expires ${formatUtcClock(qRow.expires_at)}`
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pendingQuote === qRow.quote_id}
                  onClick={() => releaseHold(qRow.quote_id)}
                  className="text-[14px] font-medium text-accent underline-offset-2 transition-opacity duration-160 ease-out hover:underline disabled:opacity-40"
                >
                  {pendingQuote === qRow.quote_id
                    ? "Releasing…"
                    : "Release hold"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-control px-3 py-1.5 text-[13px] transition-[color,background-color] duration-160 ease-out ${
        active
          ? "bg-accent/[0.09] font-medium text-accent"
          : "text-secondary hover:text-ink"
      }`}
    >
      {label}
    </button>
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
      <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
        Alerts
      </h2>
      {killSwitch ? (
        <p className="ops-row mt-3 text-[15px] text-red-600">
          Kill switch is on — new commits are blocked.
        </p>
      ) : null}
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
