import { redirect } from "next/navigation";
import { AuditClient } from "@/components/ops/audit-client";
import { OpsShell } from "@/components/ops/shell";
import { opsDevBypassEnabled } from "@/lib/ops/config";
import { readOpsSession } from "@/lib/ops/session";
import { listAuditView } from "@/lib/ops/store";

export default async function OpsAuditPage() {
  const session = await readOpsSession();
  if (!session) redirect("/ops/sign-in");

  const audits = await listAuditView();

  return (
    <OpsShell
      session={session}
      active="audit"
      bypass={opsDevBypassEnabled()}
    >
      <h1 className="font-display text-[34px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
        Audit
      </h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-secondary">
        Append-only operator and risk actions. Reasons travel with every
        mutation.
      </p>
      <AuditClient audits={audits} />
    </OpsShell>
  );
}
