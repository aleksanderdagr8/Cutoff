import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeSectionTitle } from "@/components/home/home-section-title";
import { HomeShell } from "@/components/home/shell";
import { KeysClient } from "@/components/home/keys-client";
import { homeDevBypassEnabled } from "@/lib/home/config";
import { readHomeSession } from "@/lib/home/session";
import {
  getNudgeSettingsForSession,
  listKeysForSession,
} from "@/lib/home/store";

export default async function KeysPage() {
  const session = await readHomeSession();
  if (!session) redirect("/home/sign-in");

  const [keys, nudgeSettings] = await Promise.all([
    listKeysForSession(session),
    getNudgeSettingsForSession(session),
  ]);

  return (
    <HomeShell
      session={session}
      active="keys"
      bypass={homeDevBypassEnabled()}
    >
      <HomeSectionTitle>Keys</HomeSectionTitle>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-secondary">
        Connect an assistant with a one-time key. Default scopes are quote and
        read_list — commit is opt-in. Set spending limits on{" "}
        <Link
          href="/home/mandate"
          className="text-accent underline-offset-2 hover:underline"
        >
          Mandate
        </Link>
        .
      </p>
      <div className="mt-10">
        <KeysClient
          initialKeys={keys}
          initialNudgeSettings={nudgeSettings}
        />
      </div>
    </HomeShell>
  );
}
