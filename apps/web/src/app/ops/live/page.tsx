import { redirect } from "next/navigation";
import { LiveClient } from "@/components/ops/live-client";
import { OpsShell } from "@/components/ops/shell";
import { opsDevBypassEnabled } from "@/lib/ops/config";
import { readOpsSession } from "@/lib/ops/session";
import { getLiveView } from "@/lib/ops/store";

export default async function OpsLivePage() {
  const session = await readOpsSession();
  if (!session) redirect("/ops/sign-in");

  // Seed clock keeps never-committed / stuck alerts visible in demo.
  const live = await getLiveView("2026-10-19T12:10:00.000Z");

  return (
    <OpsShell
      session={session}
      active="live"
      bypass={opsDevBypassEnabled()}
    >
      <h1 className="text-[28px] font-semibold tracking-tight text-ink">
        Live flow
      </h1>
      <p className="mt-2 max-w-xl text-[15px] text-secondary">
        One row per order from events. Side lane for quotes that never
        committed. Alerts stay in a strip — not a card grid.
      </p>
      <div className="mt-8">
        <LiveClient
          initialRows={live.rows}
          initialNeverCommitted={live.never_committed}
          initialAlerts={live.alerts}
          killSwitch={live.kill_switch}
        />
      </div>
    </OpsShell>
  );
}
