import { NextResponse } from "next/server";
import { requireOpsSession } from "@/lib/ops/session";
import { setFulfillerSuspended } from "@/lib/ops/store";

type Ctx = { params: Promise<{ fulfillerId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const session = await requireOpsSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { fulfillerId } = await ctx.params;
  let body: { suspend?: boolean; reason?: string };
  try {
    body = (await request.json()) as { suspend?: boolean; reason?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (typeof body.suspend !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await setFulfillerSuspended(
    session,
    fulfillerId,
    body.suspend,
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
