import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeShell } from "@/components/home/shell";
import { MandateClient } from "@/components/home/mandate-client";
import { homeDevBypassEnabled } from "@/lib/home/config";
import { placesApiConfigured } from "@/lib/home/places";
import { readHomeSession } from "@/lib/home/session";
import {
  getAddressForSession,
  getMandateForSession,
} from "@/lib/home/store";

export default async function MandatePage() {
  const session = await readHomeSession();
  if (!session) redirect("/home/sign-in");

  const mandate = await getMandateForSession(session);
  const address = mandate
    ? await getAddressForSession(session, mandate.address_id)
    : null;

  return (
    <HomeShell
      session={session}
      active="mandate"
      bypass={homeDevBypassEnabled()}
    >
      <h1 className="font-display text-[34px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
        Mandate
      </h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-secondary">
        Spending ceiling, never-substitute, address, and expiry. Agent keys
        live on{" "}
        <Link
          href="/home/keys"
          className="text-accent underline-offset-2 hover:underline"
        >
          Keys
        </Link>
        .
      </p>
      <div className="mt-10">
        <MandateClient
          initialMandate={mandate}
          initialAddress={address}
          placesConfigured={placesApiConfigured()}
        />
      </div>
    </HomeShell>
  );
}
