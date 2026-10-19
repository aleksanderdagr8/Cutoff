import { redirect } from "next/navigation";
import { MandatesClient } from "@/components/ops/mandates-client";
import { OpsShell } from "@/components/ops/shell";
import { opsDevBypassEnabled } from "@/lib/ops/config";
import { readOpsSession } from "@/lib/ops/session";
import { listMandatesView } from "@/lib/ops/store";

export default async function OpsMandatesPage() {
  const session = await readOpsSession();
  if (!session) redirect("/ops/sign-in");

  const mandates = await listMandatesView();

  return (
    <OpsShell
      session={session}
      active="mandates"
      bypass={opsDevBypassEnabled()}
    >
      <h1 className="text-[28px] font-semibold tracking-tight text-ink">
        Mandates
      </h1>
      <p className="mt-2 max-w-xl text-[15px] text-secondary">
        Read mandates and lower a ceiling only. Operators cannot raise a
        ceiling.
      </p>
      <MandatesClient initial={mandates} />
    </OpsShell>
  );
}
