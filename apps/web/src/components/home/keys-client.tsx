"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { HomeKeyView } from "@/lib/home/types";

type Props = {
  initialKeys: HomeKeyView[];
};

export function KeysClient({ initialKeys }: Props) {
  const router = useRouter();
  const [keys, setKeys] = useState(initialKeys);
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
        setError("Could not issue key. Save a mandate first.");
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
    <div className="max-w-xl">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="text-[15px] text-secondary">
          Secret shown once. Never copied into browser storage.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={issueKey}
          className="home-cta rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40"
        >
          {pending ? "…" : "Issue key"}
        </button>
      </div>

      {issuedSecret ? (
        <div className="mt-8 rounded-control border border-hairline bg-surface px-5 py-5">
          <p className="text-[13px] text-secondary">Copy now — shown once</p>
          <p className="mt-2 break-all font-mono text-[14px] text-ink">
            {issuedSecret}
          </p>
          <button
            type="button"
            className="mt-4 text-[13px] text-secondary underline-offset-2 hover:underline"
            onClick={() => setIssuedSecret(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <ul className="mt-10 border-t border-hairline">
        {keys.length === 0 ? (
          <li className="py-6 text-[15px] text-secondary">
            No keys yet. Issue one for your buyer agent.
          </li>
        ) : (
          keys.map((key, i) => (
            <li
              key={key.key_id}
              className="home-row flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline py-5"
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
                  className="text-[14px] text-red-600 transition-opacity duration-160 ease-out disabled:opacity-40"
                >
                  Revoke
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>

      {error ? <p className="mt-4 text-[14px] text-red-600">{error}</p> : null}
    </div>
  );
}
