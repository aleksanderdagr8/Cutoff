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
      <h1 className="text-[28px] font-semibold tracking-tight text-ink">
        List
      </h1>
      <p className="mt-2 max-w-xl text-[15px] text-secondary">
        Replenishment lines for your household. Skip pauses a line — nothing
        is placed.
      </p>
      <div className="mt-8">
        <ListClient initialLines={lines} />
      </div>
    </HomeShell>
  );
}
