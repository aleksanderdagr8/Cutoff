"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/ops/format";
import type { OpsMandateView } from "@/lib/ops/types";

type Props = {
  initial: OpsMandateView[];
};

export function MandatesClient({ initial }: Props) {
  const router = useRouter();
  const [mandates, setMandates] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function lower(m: OpsMandateView) {
    const raw = window.prompt(
      `Lower ceiling for ${m.household_name} (current ${formatCents(m.ceiling_cents)}). Enter new ceiling in cents — must be lower:`,
      String(Math.max(0, m.ceiling_cents - 500)),
    );
    if (raw == null) return;
    const ceiling = Number.parseInt(raw, 10);
    if (!Number.isInteger(ceiling)) {
      setError("Ceiling must be a whole number of cents.");
      return;
    }
    const reason = window.prompt(
      "Why are you lowering this ceiling? (saved in Audit)",
    );
    if (reason == null) return;

    setError(null);
    setPendingId(m.mandate_id);
    startTransition(async () => {
      const res = await fetch(`/api/ops/mandates/${m.mandate_id}/lower`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ceiling_cents: ceiling, reason }),
      });
      setPendingId(null);
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        mandate?: OpsMandateView;
      } | null;
      if (!res.ok) {
        setError(
          body?.error === "over_ceiling"
            ? "Operators can only lower a ceiling — not raise it."
            : "Could not lower ceiling.",
        );
        return;
      }
      if (body?.mandate) {
        setMandates((prev) =>
          prev.map((row) =>
            row.mandate_id === body.mandate!.mandate_id ? body.mandate! : row,
          ),
        );
      }
      router.refresh();
    });
  }

  if (mandates.length === 0) {
    return (
      <p className="mt-10 text-[15px] leading-relaxed text-secondary">
        No mandates yet. Households set these from /home.
      </p>
    );
  }

  return (
    <div>
      {error ? <p className="mt-4 text-[14px] text-red-600">{error}</p> : null}
      <ul className="mt-10 border-t border-hairline">
        {mandates.map((m, i) => (
          <li
            key={m.mandate_id}
            className="ops-row flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline py-5"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[17px] text-ink">{m.household_name}</p>
              <p className="mt-1 text-[13px] text-secondary">
                Ceiling {formatCents(m.ceiling_cents)} · expires{" "}
                {m.expires_at.slice(0, 10)} · {m.address_id}
                {m.never_substitute_ids.length
                  ? ` · never-sub ${m.never_substitute_ids.length}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={pendingId === m.mandate_id}
              onClick={() => lower(m)}
              className="text-[14px] font-medium text-accent underline-offset-2 transition-opacity duration-160 ease-out hover:underline disabled:opacity-40"
            >
              {pendingId === m.mandate_id ? "Lowering…" : "Lower ceiling"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
