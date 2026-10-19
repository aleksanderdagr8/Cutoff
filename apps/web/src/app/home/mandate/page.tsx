import { redirect } from "next/navigation";
import { HomeShell } from "@/components/home/shell";
import { MandateKeysClient } from "@/components/home/mandate-keys-client";
import { homeDevBypassEnabled } from "@/lib/home/config";
import { readHomeSession } from "@/lib/home/session";
import {
  getMandateForSession,
  listKeysForSession,
} from "@/lib/home/store";

export default async function MandatePage() {
  const session = await readHomeSession();
  if (!session) redirect("/home/sign-in");

  const [mandate, keys] = await Promise.all([
    getMandateForSession(session),
    listKeysForSession(session),
  ]);

  return (
    <HomeShell
      session={session}
      active="mandate"
      bypass={homeDevBypassEnabled()}
    >
      <h1 className="text-[28px] font-semibold tracking-tight text-ink">
        Mandate & keys
      </h1>
      <p className="mt-2 max-w-xl text-[15px] text-secondary">
        Ceiling, never-substitute, address, and expiry. Issue a key once —
        revoke when done.
      </p>
      <div className="mt-10">
        <MandateKeysClient initialMandate={mandate} initialKeys={keys} />
      </div>
    </HomeShell>
  );
}
