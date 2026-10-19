"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/home/format";
import type { HomeListLineView } from "@/lib/home/types";

type Props = {
  initialLines: HomeListLineView[];
};

export function ListClient({ initialLines }: Props) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function skip(lineId: string) {
    setError(null);
    setPendingId(lineId);
    startTransition(async () => {
      const res = await fetch("/api/home/list/skip", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ list_line_id: lineId }),
      });
      setPendingId(null);
      if (!res.ok) {
        setError("Could not pause that line.");
        return;
      }
      setLines((prev) =>
        prev.map((l) =>
          l.line_id === lineId ? { ...l, paused: true } : l,
        ),
      );
      router.refresh();
    });
  }

  if (lines.length === 0) {
    return (
      <section className="border-t border-hairline pt-8">
        <p className="text-[15px] text-secondary">
          No replenishment lines yet. After a mandate is set, your agent can
          add items here.
        </p>
        <Link
          href="/home/mandate"
          className="mt-4 inline-block text-[15px] text-accent underline-offset-2 hover:underline"
        >
          Set a mandate
        </Link>
      </section>
    );
  }

  return (
    <section className="border-t border-hairline">
      {error ? (
        <p className="pt-4 text-[14px] text-red-600">{error}</p>
      ) : null}
      <ul>
        {lines.map((line, i) => (
          <li
            key={line.line_id}
            className="home-row flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline py-5"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[17px] text-ink">
                {line.brand} · {line.description}
              </p>
              <p className="mt-1 text-[13px] text-secondary">
                {line.paused
                  ? "Paused"
                  : line.cadence_hint_days
                    ? `About every ${line.cadence_hint_days} days`
                    : "Active"}
                {line.never_substitute ? " · never substitute" : ""}
                {line.last_price_cents != null
                  ? ` · last ${formatCents(line.last_price_cents)}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {line.receipt_token ? (
                <Link
                  href={`/home/receipts/${line.receipt_token}`}
                  className="text-[14px] text-secondary underline-offset-2 hover:text-ink hover:underline"
                >
                  Receipt
                </Link>
              ) : null}
              {!line.paused ? (
                <button
                  type="button"
                  disabled={pendingId === line.line_id}
                  onClick={() => skip(line.line_id)}
                  className="text-[14px] font-medium text-accent transition-opacity duration-[160ms] ease-out disabled:opacity-40"
                >
                  {pendingId === line.line_id ? "…" : "Skip"}
                </button>
              ) : (
                <span className="text-[14px] text-secondary">Paused</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
