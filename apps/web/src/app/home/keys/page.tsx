import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeShell } from "@/components/home/shell";
import { KeysClient } from "@/components/home/keys-client";
import { homeDevBypassEnabled } from "@/lib/home/config";
import { readHomeSession } from "@/lib/home/session";
import { listKeysForSession } from "@/lib/home/store";

export default async function KeysPage() {
  const session = await readHomeSession();
  if (!session) redirect("/home/sign-in");

  const keys = await listKeysForSession(session);

  return (
    <HomeShell
      session={session}
      active="keys"
      bypass={homeDevBypassEnabled()}
    >
      <h1 className="font-display text-[34px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
        Keys
      </h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-secondary">
        Issue a key once for your buyer agent. Revoke when you are done. Set
        spending limits on{" "}
        <Link
          href="/home/mandate"
          className="text-accent underline-offset-2 hover:underline"
        >
          Mandate
        </Link>
        .
      </p>
      <div className="mt-10">
        <KeysClient initialKeys={keys} />
      </div>
    </HomeShell>
  );
}
