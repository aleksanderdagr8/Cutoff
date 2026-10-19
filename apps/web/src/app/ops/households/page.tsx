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
      <h1 className="text-[28px] font-semibold tracking-tight text-ink">
        Households
      </h1>
      <p className="mt-2 max-w-xl text-[15px] text-secondary">
        Operator index of every household. Read-only here — actions live on
        the order sheet and mandates.
      </p>
      <HouseholdsClient households={households} />
    </OpsShell>
  );
}
