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
      <h1 className="font-display text-[34px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
        Mandates
      </h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-secondary">
        Read ceilings and lower them only. Operators cannot raise a ceiling.
      </p>
      <MandatesClient initial={mandates} />
    </OpsShell>
  );
}
