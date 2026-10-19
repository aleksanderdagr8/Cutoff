"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents } from "@/lib/home/format";
import type { HomeKeyView, HomeMandateView } from "@/lib/home/types";

type Props = {
  initialMandate: HomeMandateView | null;
  initialKeys: HomeKeyView[];
};

export function MandateKeysClient({ initialMandate, initialKeys }: Props) {
  const router = useRouter();
  const [mandate, setMandate] = useState(initialMandate);
  const [keys, setKeys] = useState(initialKeys);
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
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);
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

  async function issueKey() {
    setError(null);
    setIssuedSecret(null);
    startTransition(async () => {
      const res = await fetch("/api/home/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scopes: ["quote", "commit", "read_list"],
        }),
      });
      if (!res.ok) {
        setError("Could not issue key.");
        return;
      }
      const body = (await res.json()) as HomeKeyView & { secret: string };
      // Secret held in React state only for one-time display.
      setIssuedSecret(body.secret);
      setKeys((prev) => [
        {
          key_id: body.key_id,
          scopes: body.scopes,
          mandate_ids: body.mandate_ids,
          revoked: false,
          created_at: body.created_at,
          last_used_at: body.last_used_at,
        },
        ...prev,
      ]);
      router.refresh();
    });
  }

  async function revokeKey(keyId: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/home/keys/${keyId}/revoke`, {
        method: "POST",
      });
      if (!res.ok) {
        setError("Could not revoke key.");
        return;
      }
      setKeys((prev) =>
        prev.map((k) =>
          k.key_id === keyId ? { ...k, revoked: true } : k,
        ),
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-14">
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
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save mandate"}
        </button>
      </form>

      <section className="border-t border-hairline pt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight text-ink">
              Agent keys
            </h2>
            <p className="mt-1 text-[14px] text-secondary">
              Secret shown once. Never copied into browser storage.
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={issueKey}
            className="text-[15px] font-medium text-accent disabled:opacity-40"
          >
            Issue key
          </button>
        </div>

        {issuedSecret ? (
          <div className="mt-6 border border-hairline bg-surface px-4 py-4">
            <p className="text-[13px] text-secondary">Copy now — shown once</p>
            <p className="mt-2 break-all font-mono text-[14px] text-ink">
              {issuedSecret}
            </p>
            <button
              type="button"
              className="mt-3 text-[13px] text-secondary underline-offset-2 hover:underline"
              onClick={() => setIssuedSecret(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <ul className="mt-6">
          {keys.length === 0 ? (
            <li className="py-4 text-[15px] text-secondary">
              No keys yet. Issue one for your buyer agent.
            </li>
          ) : (
            keys.map((key, i) => (
              <li
                key={key.key_id}
                className="home-row flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline py-4"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div>
                  <p className="font-mono text-[14px] text-ink">{key.key_id}</p>
                  <p className="mt-1 text-[13px] text-secondary">
                    {key.revoked ? "Revoked" : "Active"} ·{" "}
                    {key.scopes.join(", ")}
                  </p>
                </div>
                {!key.revoked ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revokeKey(key.key_id)}
                    className="text-[14px] text-red-600 disabled:opacity-40"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      {error ? <p className="text-[14px] text-red-600">{error}</p> : null}
    </div>
  );
}
