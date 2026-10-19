import { redirect } from "next/navigation";
import { FulfillersClient } from "@/components/ops/fulfillers-client";
import { OpsShell } from "@/components/ops/shell";
import { opsDevBypassEnabled } from "@/lib/ops/config";
import { readOpsSession } from "@/lib/ops/session";
import { listFulfillersView } from "@/lib/ops/store";

export default async function OpsFulfillersPage() {
  const session = await readOpsSession();
  if (!session) redirect("/ops/sign-in");

  const fulfillers = await listFulfillersView();

  return (
    <OpsShell
      session={session}
      active="fulfillers"
      bypass={opsDevBypassEnabled()}
    >
      <h1 className="text-[28px] font-semibold tracking-tight text-ink">
        Fulfillers
      </h1>
      <p className="mt-2 max-w-xl text-[15px] text-secondary">
        Score and strikes from risk events. Suspend writes an audit row.
      </p>
      <FulfillersClient initial={fulfillers} />
    </OpsShell>
  );
}
