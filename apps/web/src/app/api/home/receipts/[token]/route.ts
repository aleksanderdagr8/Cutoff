import { NextResponse } from "next/server";
import { readHomeSession } from "@/lib/home/session";
import { getReceiptForSession } from "@/lib/home/store";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { token } = await ctx.params;
  const result = await getReceiptForSession(session, token);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status as 401 },
    );
  }
  return NextResponse.json(result);
}
