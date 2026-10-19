import { NextResponse } from "next/server";
import { requireOpsSession } from "@/lib/ops/session";
import { runOrderAction } from "@/lib/ops/store";
import type { OpsOrderAction } from "@/lib/ops/types";

const ACTIONS = new Set<OpsOrderAction>([
  "kill_switch_on",
  "kill_switch_off",
  "revoke_key",
  "refund",
  "cancel_before_ship",
  "release_hold",
  "pause_line",
  "replay_webhook",
]);

type Ctx = { params: Promise<{ orderId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const session = await requireOpsSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { orderId } = await ctx.params;
  let body: { action?: string; reason?: string };
  try {
    body = (await request.json()) as { action?: string; reason?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = body.action as OpsOrderAction | undefined;
  if (!action || !ACTIONS.has(action)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await runOrderAction(
    session,
    orderId,
    action,
    body.reason ?? "",
  );
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result);
}
