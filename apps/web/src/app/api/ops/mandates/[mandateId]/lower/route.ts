import { NextResponse } from "next/server";
import { requireOpsSession } from "@/lib/ops/session";
import { lowerMandateCeiling } from "@/lib/ops/store";

type Ctx = { params: Promise<{ mandateId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const session = await requireOpsSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { mandateId } = await ctx.params;
  let body: { ceiling_cents?: number; reason?: string };
  try {
    body = (await request.json()) as {
      ceiling_cents?: number;
      reason?: string;
    };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (typeof body.ceiling_cents !== "number") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await lowerMandateCeiling(
    session,
    mandateId,
    body.ceiling_cents,
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
