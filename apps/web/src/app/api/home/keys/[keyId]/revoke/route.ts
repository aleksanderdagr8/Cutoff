import { NextResponse } from "next/server";
import { readHomeSession } from "@/lib/home/session";
import { revokeKeyForSession } from "@/lib/home/store";

type Ctx = { params: Promise<{ keyId: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { keyId } = await ctx.params;
  const result = await revokeKeyForSession(session, keyId);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status as 401 },
    );
  }
  return NextResponse.json(result);
}
