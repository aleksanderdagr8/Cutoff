"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  bypass: boolean;
  supabaseConfigured: boolean;
};

export function SignInForm({ bypass, supabaseConfigured }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("ops@cutoff.local");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/ops/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(
          body?.message ??
            "Operator sign-in is not available. Enable CUTOFF_OPS_DEV_BYPASS=1 for local.",
        );
        return;
      }
      router.push("/ops/live");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 max-w-md space-y-6">
      <label className="block">
        <span className="text-[13px] text-secondary">Operator email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full border-b border-hairline bg-transparent py-2 text-[17px] text-ink outline-none transition-[border-color] duration-[160ms] ease-out focus:border-accent"
          autoComplete="email"
        />
      </label>

      {bypass ? (
        <p className="text-[13px] text-secondary">
          Local demo uses an operator cookie. Live Auth + TOTP are not required
          yet.
        </p>
      ) : supabaseConfigured ? (
        <p className="text-[13px] text-secondary">
          Supabase keys are present, but operator Auth + TOTP are not wired.
          Set{" "}
          <span className="font-mono text-ink">CUTOFF_OPS_DEV_BYPASS=1</span>{" "}
          to continue locally.
        </p>
      ) : (
        <p className="text-[13px] text-secondary">
          Add Supabase secrets or enable{" "}
          <span className="font-mono text-ink">CUTOFF_OPS_DEV_BYPASS=1</span>.
        </p>
      )}

      {error ? <p className="text-[14px] text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={pending || (!bypass && !supabaseConfigured)}
        className="ops-cta rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
