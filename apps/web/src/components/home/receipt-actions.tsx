"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  token: string;
  skipAvailable: boolean;
};

export function ReceiptActions({ token, skipAvailable }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!skipAvailable && !message) return null;

  async function onSkip() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/home/receipts/${token}/skip`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setError("Skip failed.");
        return;
      }
      const body = (await res.json()) as {
        action: string;
        status: string;
      };
      setMessage(
        body.action === "return_request"
          ? "Return requested."
          : "Order cancelled.",
      );
      router.refresh();
    });
  }

  return (
    <div className="pt-2">
      {message ? (
        <p className="text-[15px] text-ink">{message}</p>
      ) : skipAvailable ? (
        <button
          type="button"
          disabled={pending}
          onClick={onSkip}
          className="home-cta rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-40"
        >
          {pending ? "…" : "Skip"}
        </button>
      ) : null}
      {error ? <p className="mt-2 text-[14px] text-red-600">{error}</p> : null}
    </div>
  );
}
