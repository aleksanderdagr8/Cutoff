"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/home/format";
import type { HomeMandateView } from "@/lib/home/types";

type Props = {
  initialMandate: HomeMandateView | null;
};

export function MandateClient({ initialMandate }: Props) {
  const router = useRouter();
  const [mandate, setMandate] = useState(initialMandate);
  const [ceilingDollars, setCeilingDollars] = useState(
    initialMandate ? (initialMandate.ceiling_cents / 100).toFixed(2) : "50.00",
  );
  const [expiresAt, setExpiresAt] = useState(
    initialMandate?.expires_at?.slice(0, 10) ?? "2027-01-01",
  );
  const [addressId, setAddressId] = useState(
    initialMandate?.address_id ?? "addr_home",
  );
  const [neverSub, setNeverSub] = useState(
    (initialMandate?.never_substitute_ids ?? []).join(", "),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function saveMandate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = Math.round(Number.parseFloat(ceilingDollars) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setError("Enter a valid ceiling.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/home/mandate", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ceiling_cents: cents,
          expires_at: new Date(`${expiresAt}T00:00:00.000Z`).toISOString(),
          address_id: addressId.trim(),
          never_substitute_ids: neverSub
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        setError("Could not save mandate.");
        return;
      }
      const body = (await res.json()) as { mandate: HomeMandateView };
      setMandate(body.mandate);
      router.refresh();
    });
  }

  return (
    <form onSubmit={saveMandate} className="max-w-lg space-y-6">
      <label className="block">
        <span className="text-[13px] text-secondary">Ceiling</span>
        <div className="mt-2 flex items-baseline gap-2 border-b border-hairline focus-within:border-accent">
          <span className="text-[17px] text-secondary">$</span>
          <input
            value={ceilingDollars}
            onChange={(e) => setCeilingDollars(e.target.value)}
            className="w-full bg-transparent py-2 text-[17px] tabular-nums text-ink outline-none"
            inputMode="decimal"
          />
        </div>
      </label>
      <label className="block">
        <span className="text-[13px] text-secondary">Never substitute</span>
        <input
          value={neverSub}
          onChange={(e) => setNeverSub(e.target.value)}
          placeholder="item ids, comma-separated"
          className="mt-2 w-full border-b border-hairline bg-transparent py-2 font-mono text-[14px] text-ink outline-none focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="text-[13px] text-secondary">Address</span>
        <input
          value={addressId}
          onChange={(e) => setAddressId(e.target.value)}
          className="mt-2 w-full border-b border-hairline bg-transparent py-2 font-mono text-[14px] text-ink outline-none focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="text-[13px] text-secondary">Expires</span>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="mt-2 w-full border-b border-hairline bg-transparent py-2 text-[17px] text-ink outline-none focus:border-accent"
        />
      </label>
      {mandate ? (
        <p className="text-[13px] text-secondary">
          Current ceiling {formatCents(mandate.ceiling_cents)} ·{" "}
          <span className="font-mono text-[12px]">{mandate.mandate_id}</span>
        </p>
      ) : null}
      {error ? <p className="text-[14px] text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="home-cta rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save mandate"}
      </button>
    </form>
  );
}
