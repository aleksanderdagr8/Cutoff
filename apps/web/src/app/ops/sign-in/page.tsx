import { redirect } from "next/navigation";
import { OpsShell } from "@/components/ops/shell";
import { SignInForm } from "@/components/ops/sign-in-form";
import { opsDevBypassEnabled, supabaseConfigured } from "@/lib/ops/config";
import { readOpsSession } from "@/lib/ops/session";

export default async function OpsSignInPage() {
  const session = await readOpsSession();
  if (session) redirect("/ops/live");

  const bypass = opsDevBypassEnabled();
  const configured = supabaseConfigured();

  return (
    <OpsShell session={null} active="sign-in" bypass={bypass}>
      <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
        Operator
      </p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.03em] text-ink md:text-[44px]">
        CUTOFF
      </h1>
      <p className="mt-3 max-w-md text-[16px] leading-relaxed text-secondary">
        Watch live order flow. Act on stuck hold, kill switch, revoke, refund,
        and cancel-before-ship — each with a reason and an audit row.
      </p>
      <SignInForm bypass={bypass} supabaseConfigured={configured} />
    </OpsShell>
  );
}
