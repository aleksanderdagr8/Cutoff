"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AuthError, AuthField, AuthNotice, AuthSubmit } from "./auth-ui";
import { postAuth } from "./post-json";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await postAuth("/api/home/recover", { email });
      if (!res.ok) {
        setError(res.message ?? "Could not send the reset email.");
        return;
      }
      setNotice("If an account exists for that email, a reset link is on its way.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 max-w-md space-y-6">
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
        describedBy={error ? "forgot-error" : undefined}
      />
      <AuthError id="forgot-error" message={error} />
      <AuthSubmit
        pending={pending}
        pendingLabel="Sending link…"
        label="Send reset link"
        disabled={Boolean(notice)}
      />
      <p className="text-[14px]">
        <Link
          href="/home/sign-in"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
