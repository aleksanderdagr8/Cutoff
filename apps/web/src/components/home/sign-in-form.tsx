"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthError, AuthField, AuthNotice, AuthSubmit } from "./auth/auth-ui";
import { postAuth } from "./auth/post-json";

type Props = {
  bypass: boolean;
  supabaseConfigured: boolean;
  notice?: string | null;
  initialError?: string | null;
};

export function SignInForm({
  bypass,
  supabaseConfigured,
  notice = null,
  initialError = null,
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState(bypass ? "member@cutoff.local" : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();

  const liveAuth = !bypass && supabaseConfigured;
  const canSubmit = bypass || liveAuth;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await postAuth(
        "/api/home/session",
        bypass ? { email } : { email, password, intent: "sign_in" },
      );
      if (!res.ok) {
        setError(res.message ?? "Sign-in failed. Try again.");
        return;
      }
      if (res.step === "email_code") {
        router.push("/home/verify");
        router.refresh();
        return;
      }
      router.push("/home");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 max-w-md space-y-6" noValidate={false}>
      <AuthNotice message={notice} />
      <AuthField
        id="email"
        label="Email"
        type="email"
        required
        value={email}
        onChange={setEmail}
        autoComplete="email"
        spellCheck={false}
        autoFocus
        invalid={Boolean(error)}
        describedBy={error ? "sign-in-error" : undefined}
      />

      {liveAuth ? (
        <AuthField
          id="password"
          label="Password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          invalid={Boolean(error)}
          describedBy={error ? "sign-in-error" : undefined}
        />
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
          <span className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
          , or enable{" "}
          <span className="font-mono text-ink">CUTOFF_HOME_DEV_BYPASS=1</span>.
        </p>
      )}

      <AuthError id="sign-in-error" message={error} />

      <AuthSubmit
        pending={pending}
        pendingLabel={liveAuth ? "Sending code…" : "Signing in…"}
        label="Sign in"
        disabled={!canSubmit}
      />

      {liveAuth ? (
        <p className="flex flex-wrap gap-x-4 gap-y-2 text-[14px]">
          <Link
            href="/home/forgot-password"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Forgot password
          </Link>
          <Link
            href="/home/sign-up"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      ) : null}
    </form>
  );
}
