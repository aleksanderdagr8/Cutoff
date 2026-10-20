"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ConnectSnippets,
  connectClientLabel,
  type ConnectClient,
} from "@/components/home/connect-snippets";
import { HomeEmptyHeadline } from "@/components/home/home-empty-headline";
import type { HomeKeyView, HomeNudgeSettingsView } from "@/lib/home/types";

type Scope = "quote" | "commit" | "read_list";

type Props = {
  initialKeys: HomeKeyView[];
  initialNudgeSettings: HomeNudgeSettingsView;
};

const DEFAULT_SCOPES: Scope[] = ["quote", "read_list"];

export function KeysClient({ initialKeys, initialNudgeSettings }: Props) {
  const router = useRouter();
  const [keys, setKeys] = useState(initialKeys);
  const [scopes, setScopes] = useState<Scope[]>(DEFAULT_SCOPES);
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);
  const [watchingKeyId, setWatchingKeyId] = useState<string | null>(null);
  const [client, setClient] = useState<ConnectClient>("claude");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [nudge, setNudge] = useState(initialNudgeSettings);
  const [webhookUrl, setWebhookUrl] = useState(
    initialNudgeSettings.agent_webhook_url ?? "",
  );
  const [emailEnabled, setEmailEnabled] = useState(
    initialNudgeSettings.email_enabled,
  );
  const [nudgeSaved, setNudgeSaved] = useState(false);
  const baselineUsedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!watchingKeyId || connected) return;
    let cancelled = false;
    const tick = async () => {
      const res = await fetch("/api/home/keys", { credentials: "include" });
      if (!res.ok || cancelled) return;
      const body = (await res.json()) as { keys: HomeKeyView[] };
      setKeys(body.keys);
      const row = body.keys.find((k) => k.key_id === watchingKeyId);
      if (!row?.last_used_at) return;
      if (
        baselineUsedAt.current == null ||
        row.last_used_at > baselineUsedAt.current
      ) {
        setConnected(true);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [watchingKeyId, connected]);

  function toggleScope(scope: Scope) {
    if (scope === "quote" || scope === "read_list") {
      // Always keep quote + read_list on for a usable MCP key.
      return;
    }
    setScopes((prev) =>
      prev.includes("commit")
        ? prev.filter((s) => s !== "commit")
        : [...prev, "commit"],
    );
  }

  async function issueKey() {
    setError(null);
    setIssuedSecret(null);
    setConnected(false);
    startTransition(async () => {
      const res = await fetch("/api/home/keys", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scopes }),
      });
      if (!res.ok) {
        setError("Could not issue key. Save a mandate first.");
        return;
      }
      const body = (await res.json()) as HomeKeyView & { secret: string };
      // Secret held in React state only for one-time display.
      setIssuedSecret(body.secret);
      baselineUsedAt.current = body.last_used_at;
      setWatchingKeyId(body.key_id);
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
        credentials: "include",
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
      if (watchingKeyId === keyId) {
        setWatchingKeyId(null);
        setConnected(false);
        setIssuedSecret(null);
      }
      router.refresh();
    });
  }

  async function saveNudge(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNudgeSaved(false);
    startTransition(async () => {
      const res = await fetch("/api/home/nudge-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_webhook_url: webhookUrl.trim() || null,
          email_enabled: emailEnabled,
        }),
      });
      if (!res.ok) {
        setError("Webhook must be https, or leave blank.");
        return;
      }
      const body = (await res.json()) as HomeNudgeSettingsView;
      setNudge(body);
      setWebhookUrl(body.agent_webhook_url ?? "");
      setEmailEnabled(body.email_enabled);
      setNudgeSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="max-w-xl">
      <section>
        <h2 className="text-[18px] font-medium text-ink">
          Connect an assistant
        </h2>
        <p className="mt-2 text-[15px] text-secondary">
          Secret shown once. Never copied into browser storage. Commit scope is
          opt-in.
        </p>

        <fieldset className="mt-6 space-y-3">
          <legend className="text-[13px] text-secondary">Scopes</legend>
          {(
            [
              {
                id: "quote" as const,
                label: "quote",
                hint: "Price and delivery options",
                locked: true,
              },
              {
                id: "read_list" as const,
                label: "read_list",
                hint: "See list and due items",
                locked: true,
              },
              {
                id: "commit" as const,
                label: "commit",
                hint: "Place orders inside the mandate",
                locked: false,
              },
            ] as const
          ).map((row) => {
            const checked = scopes.includes(row.id);
            return (
              <label
                key={row.id}
                className="flex cursor-pointer items-baseline gap-3"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={row.locked || pending}
                  onChange={() => toggleScope(row.id)}
                  className="mt-1"
                />
                <span>
                  <span className="font-mono text-[14px] text-ink">
                    {row.label}
                  </span>
                  <span className="ml-2 text-[13px] text-secondary">
                    {row.hint}
                    {row.locked ? " · always on" : " · opt-in"}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <button
          type="button"
          disabled={pending}
          onClick={issueKey}
          className="home-cta mt-6 rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium disabled:opacity-40"
        >
          {pending && !issuedSecret ? "…" : "Issue key"}
        </button>

        {issuedSecret ? (
          <div className="mt-8 rounded-control border border-hairline bg-surface px-5 py-5">
            <p className="text-[13px] text-secondary">Copy now — shown once</p>
            <p className="mt-2 break-all font-mono text-[14px] text-ink">
              {issuedSecret}
            </p>
            {connected ? (
              <p className="mt-4 text-[15px] font-medium text-accent">
                Connected ✓ ({connectClientLabel(client)})
              </p>
            ) : (
              <p className="mt-4 text-[13px] text-secondary">
                Waiting for first call…
              </p>
            )}
            <button
              type="button"
              className="mt-4 text-[13px] text-secondary underline-offset-2 hover:underline"
              onClick={() => setIssuedSecret(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <ConnectSnippets
          secret={issuedSecret}
          selected={client}
          onSelect={setClient}
        />
      </section>

      <section className="mt-14 border-t border-hairline pt-10">
        <h2 className="text-[18px] font-medium text-ink">Webhook settings</h2>
        <p className="mt-2 text-[15px] text-secondary">
          When a line is due, Cutoff POSTs a signed nudge to your agent URL
          (https only). Email fallback stays off until Resend is wired.
        </p>
        <form onSubmit={saveNudge} className="mt-6 space-y-5">
          <label className="block">
            <span className="text-[13px] text-secondary">Agent webhook URL</span>
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://…"
              className="mt-2 w-full border-b border-hairline bg-transparent py-2 font-mono text-[14px] text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex items-baseline gap-3">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              disabled={pending}
            />
            <span className="text-[14px] text-ink">
              Email fallback{" "}
              <span className="text-secondary">
                (reserved · auto-commit stays off)
              </span>
            </span>
          </label>
          <p className="text-[13px] text-secondary">
            auto_commit_enabled:{" "}
            <span className="font-mono">{String(nudge.auto_commit_enabled)}</span>
          </p>
          <button
            type="submit"
            disabled={pending}
            className="home-cta rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium disabled:opacity-40"
          >
            {pending ? "…" : "Save webhook"}
          </button>
          {nudgeSaved ? (
            <p className="text-[13px] text-accent">Saved</p>
          ) : null}
        </form>
      </section>

      <section className="mt-14 border-t border-hairline pt-10">
        <h2 className="text-[18px] font-medium text-ink">Keys</h2>
        <ul className="mt-6 border-t border-hairline">
          {keys.length === 0 ? (
            <li className="py-6">
              <HomeEmptyHeadline>No keys yet</HomeEmptyHeadline>
              <p className="mt-3 text-[15px] text-secondary">
                Issue one for your buyer agent.
              </p>
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
                    {key.revoked
                      ? "Revoked"
                      : key.last_used_at
                        ? "Connected"
                        : "Active"}{" "}
                    · {key.scopes.join(", ")}
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
      </section>

      {error ? <p className="mt-4 text-[14px] text-red-600">{error}</p> : null}
    </div>
  );
}
