"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await fetch("/api/ops/session", { method: "DELETE" });
          router.push("/ops/sign-in");
          router.refresh();
        });
      }}
      className="text-[13px] text-secondary underline-offset-2 transition-colors duration-[160ms] ease-out hover:text-ink hover:underline disabled:opacity-40"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
