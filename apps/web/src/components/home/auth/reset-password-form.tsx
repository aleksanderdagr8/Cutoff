"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthError, AuthField, AuthSubmit } from "./auth-ui";
import { postAuth } from "./post-json";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    startTransition(async () => {
      const res = await postAuth("/api/home/password", { password });
      if (!res.ok) {
        setError(res.message ?? "Could not update the password.");
        return;
      }
      router.push("/home/sign-in?notice=password_updated");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 max-w-md space-y-6">
      <AuthField
        id="password"
        label="New password"
        type="password"
        required
        minLength={8}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        autoFocus
        invalid={Boolean(error)}
        describedBy={error ? "reset-error" : undefined}
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
        describedBy={error ? "reset-error" : undefined}
      />
      <AuthError id="reset-error" message={error} />
      <AuthSubmit pending={pending} pendingLabel="Saving…" label="Update password" />
      <p className="text-[14px]">
        <Link
          href="/home/forgot-password"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Request a new link
        </Link>
      </p>
    </form>
  );
}
