"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthError, AuthField, AuthNotice, AuthSubmit } from "./auth-ui";
import { postAuth } from "./post-json";

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    startTransition(async () => {
      const res = await postAuth("/api/home/session", {
        email,
        password,
        intent: "sign_up",
      });
      if (!res.ok) {
        setError(res.message ?? "Could not create the account.");
        return;
      }
      if (res.step === "email_code") {
        router.push("/home/verify");
        router.refresh();
        return;
      }
      setNotice("Check your email for a confirmation link, then sign in.");
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
        describedBy={error ? "sign-up-error" : undefined}
      />
      <AuthField
        id="password"
        label="Password"
        type="password"
        required
        minLength={8}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        invalid={Boolean(error)}
        describedBy={error ? "sign-up-error" : undefined}
      />
      <AuthField
        id="confirm-password"
        label="Confirm password"
        type="password"
        required
        minLength={8}
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        invalid={Boolean(error)}
        describedBy={error ? "sign-up-error" : undefined}
      />
      <AuthError id="sign-up-error" message={error} />
      <AuthSubmit
        pending={pending}
        pendingLabel="Creating account…"
        label="Create account"
        disabled={Boolean(notice)}
      />
      <p className="text-[14px]">
        <Link
          href="/home/sign-in"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Already have an account
        </Link>
      </p>
    </form>
  );
}
