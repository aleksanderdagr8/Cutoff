import { redirect } from "next/navigation";
import { HomeSectionTitle } from "@/components/home/home-section-title";
import { HomeShell } from "@/components/home/shell";
import { ListClient } from "@/components/home/list-client";
import { homeDevBypassEnabled } from "@/lib/home/config";
import { readHomeSession } from "@/lib/home/session";
import { listLinesForSession } from "@/lib/home/store";

export default async function ListPage() {
  const session = await readHomeSession();
  if (!session) redirect("/home/sign-in");

  const lines = await listLinesForSession(session);

  return (
    <HomeShell
      session={session}
      active="list"
      bypass={homeDevBypassEnabled()}
    >
      <HomeSectionTitle>List</HomeSectionTitle>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-secondary">
        Things your household replenishes. Next advances one cycle, snooze
        waits a week, pause stops nudges until you resume.
      </p>
      <div className="mt-10">
        <ListClient initialLines={lines} />
      </div>
    </HomeShell>
  );
}
