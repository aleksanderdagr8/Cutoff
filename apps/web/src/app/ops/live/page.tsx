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
      <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
        CUTOFF · Ops
      </p>
      <h1 className="mt-3 font-display text-[34px] font-semibold tracking-[-0.03em] text-ink md:text-[44px]">
        Live
      </h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-secondary">
        Order events as they land. Open a row for evidence and actions. Quotes
        that never committed sit below — not a trading board.
      </p>
      <div className="mt-10">
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
