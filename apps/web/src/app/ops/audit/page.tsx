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
      <h1 className="text-[28px] font-semibold tracking-tight text-ink">
        Audit
      </h1>
      <p className="mt-2 max-w-xl text-[15px] text-secondary">
        Append-only operator and risk actions. Reasons travel with every
        mutation.
      </p>
      <AuditClient audits={audits} />
    </OpsShell>
  );
}
