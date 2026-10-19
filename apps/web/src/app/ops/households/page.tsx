import { redirect } from "next/navigation";
import { HouseholdsClient } from "@/components/ops/households-client";
import { OpsShell } from "@/components/ops/shell";
import { opsDevBypassEnabled } from "@/lib/ops/config";
import { readOpsSession } from "@/lib/ops/session";
import { listHouseholdsView } from "@/lib/ops/store";

export default async function OpsHouseholdsPage() {
  const session = await readOpsSession();
  if (!session) redirect("/ops/sign-in");

  const households = await listHouseholdsView();

  return (
    <OpsShell
      session={session}
      active="households"
      bypass={opsDevBypassEnabled()}
    >
      <h1 className="font-display text-[34px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
        Households
      </h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-secondary">
        Every household on Cutoff. Read-only here — actions live on the order
        sheet and Mandates.
      </p>
      <HouseholdsClient households={households} />
    </OpsShell>
  );
}
