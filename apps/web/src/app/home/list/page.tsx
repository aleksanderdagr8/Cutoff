import { redirect } from "next/navigation";
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
      <h1 className="font-display text-[34px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
        List
      </h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-secondary">
        Things your household replenishes. Skip pauses a line — nothing is
        placed.
      </p>
      <div className="mt-10">
        <ListClient initialLines={lines} />
      </div>
    </HomeShell>
  );
}
