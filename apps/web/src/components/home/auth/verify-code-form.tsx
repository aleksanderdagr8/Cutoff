"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AuthError, AuthField, AuthSubmit, AuthTextButton } from "./auth-ui";
import { postAuth } from "./post-json";

type Props = {
  email: string;
  codeAlreadySent: boolean;
};

export function VerifyCodeForm({ email, codeAlreadySent }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(codeAlreadySent);
  const [pending, startTransition] = useTransition();
  const [resending, startResend] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await postAuth("/api/home/session/verify", { code });
      if (!res.ok) {
        setError(res.message ?? "That code didn't work.");
        if (res.status === 401) {
          router.push("/home/sign-in");
          router.refresh();
        }
        return;
      }
      router.push("/home");
      router.refresh();
    });
  }

  function resend() {
    setError(null);
    startResend(async () => {
      const res = await postAuth("/api/home/session/email-code", {});
      if (!res.ok) {
        setError(res.message ?? "Could not send a code.");
        if (res.status === 401) {
          router.push("/home/sign-in");
          router.refresh();
        }
        return;
      }
      setSent(true);
    });
  }

  function useDifferentEmail() {
    startResend(async () => {
      await fetch("/api/home/session", {
        method: "DELETE",
        credentials: "include",
      });
      window.location.href = "/home/sign-in";
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 max-w-md space-y-6">
      <p className="text-[15px] text-secondary">
        {sent
          ? `Enter the 6-digit code sent to ${email}. It expires in 10 minutes.`
          : `We'll email a 6-digit code to ${email}.`}
      </p>
      <AuthField
        id="code"
        label="Code"
        type="text"
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        spellCheck={false}
        value={code}
        onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
        autoFocus
        invalid={Boolean(error)}
        describedBy={error ? "code-error" : undefined}
        className="font-mono text-[24px] tracking-[0.3em]"
        name="one-time-code"
      />
      <AuthError id="code-error" message={error} />
      <div className="flex flex-wrap items-center gap-4">
        <AuthSubmit
          pending={pending}
          pendingLabel="Checking…"
          label="Continue"
          disabled={code.length !== 6}
        />
        <AuthTextButton onClick={resend} disabled={resending || pending}>
          {resending ? "Sending…" : sent ? "Resend code" : "Email me a code"}
        </AuthTextButton>
      </div>
      <AuthTextButton onClick={useDifferentEmail} disabled={resending || pending}>
        Use a different email
      </AuthTextButton>
    </form>
  );
}
