"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  bypass: boolean;
  supabaseConfigured: boolean;
};

export function SignInForm({ bypass, supabaseConfigured }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState(
    bypass ? "member@cutoff.local" : "",
  );
  const [password, setPassword] = useState("");
  const [intent, setIntent] = useState<"sign_in" | "sign_up">("sign_in");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const liveAuth = !bypass && supabaseConfigured;
  const canSubmit = bypass || liveAuth;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/home/session", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          bypass
            ? { email }
            : { email, password, intent },
        ),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(
          body?.message ??
            (bypass
              ? "Sign-in failed."
              : "Sign-in failed. Check email/password or Auth settings."),
        );
        return;
      }
      router.push("/home");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 max-w-md space-y-6">
      <label className="block">
        <span className="text-[13px] text-secondary">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full border-b border-hairline bg-transparent py-2 text-[17px] text-ink outline-none transition-[border-color] duration-[160ms] ease-out focus:border-accent"
          autoComplete="email"
        />
      </label>

      {liveAuth ? (
        <>
          <label className="block">
            <span className="text-[13px] text-secondary">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full border-b border-hairline bg-transparent py-2 text-[17px] text-ink outline-none transition-[border-color] duration-[160ms] ease-out focus:border-accent"
              autoComplete={
                intent === "sign_up" ? "new-password" : "current-password"
              }
            />
          </label>
          <div className="flex gap-4 text-[13px]">
            <button
              type="button"
              className={
                intent === "sign_in"
                  ? "font-medium text-accent"
                  : "text-secondary hover:text-ink"
              }
              onClick={() => setIntent("sign_in")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={
                intent === "sign_up"
                  ? "font-medium text-accent"
                  : "text-secondary hover:text-ink"
              }
              onClick={() => setIntent("sign_up")}
            >
              Create household
            </button>
          </div>
          <p className="text-[13px] text-secondary">
            Supabase Auth (email + password). First sign-in links your account
            to a household member.
          </p>
        </>
      ) : bypass ? (
        <p className="text-[13px] text-secondary">
          Local demo uses a household cookie. Set{" "}
          <span className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_*</span> and
          leave{" "}
          <span className="font-mono text-ink">CUTOFF_HOME_DEV_BYPASS</span>{" "}
          unset/0 for real Auth.
        </p>
      ) : (
        <p className="text-[13px] text-secondary">
          Add{" "}
          <span className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_URL</span>{" "}
          and{" "}
          <span className="font-mono text-ink">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </span>
          , or enable{" "}
          <span className="font-mono text-ink">CUTOFF_HOME_DEV_BYPASS=1</span>.
        </p>
      )}

      {error ? <p className="text-[14px] text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={pending || !canSubmit}
        className="home-cta rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40"
      >
        {pending
          ? "Signing in…"
          : liveAuth && intent === "sign_up"
            ? "Create account"
            : "Sign in"}
      </button>
    </form>
  );
}
