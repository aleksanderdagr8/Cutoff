"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { OpsFulfillerView } from "@/lib/ops/types";

type Props = {
  initial: OpsFulfillerView[];
};

export function FulfillersClient({ initial }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(f: OpsFulfillerView) {
    const next = !f.suspended;
    const reason = window.prompt(
      `Reason to ${next ? "suspend" : "resume"} ${f.fulfiller_id}:`,
    );
    if (reason == null) return;
    setError(null);
    setPendingId(f.fulfiller_id);
    startTransition(async () => {
      const res = await fetch(`/api/ops/fulfillers/${f.fulfiller_id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suspend: next, reason }),
      });
      setPendingId(null);
      const body = (await res.json().catch(() => null)) as {
        fulfiller?: OpsFulfillerView;
      } | null;
      if (!res.ok) {
        setError("Could not update fulfiller.");
        return;
      }
      if (body?.fulfiller) {
        setRows((prev) =>
          prev.map((row) =>
            row.fulfiller_id === body.fulfiller!.fulfiller_id
              ? body.fulfiller!
              : row,
          ),
        );
      }
      router.refresh();
    });
  }

  return (
    <div>
      {error ? <p className="mt-4 text-[14px] text-red-600">{error}</p> : null}
      <ul className="mt-8 border-t border-hairline">
        {rows.map((f, i) => (
          <li
            key={f.fulfiller_id}
            className="ops-row flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline py-5"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div>
              <p className="text-[17px] text-ink">{f.fulfiller_id}</p>
              <p className="mt-1 text-[13px] text-secondary">
                Score {f.score} · strikes {f.strikes}
                {f.suspended ? (
                  <span className="text-red-600"> · suspended</span>
                ) : (
                  " · active"
                )}
              </p>
            </div>
            <button
              type="button"
              disabled={pendingId === f.fulfiller_id}
              onClick={() => toggle(f)}
              className="text-[14px] text-accent underline-offset-2 hover:underline disabled:opacity-40"
            >
              {pendingId === f.fulfiller_id
                ? "Updating…"
                : f.suspended
                  ? "Resume"
                  : "Suspend"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
