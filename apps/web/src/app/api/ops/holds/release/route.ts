import { NextResponse } from "next/server";
import { requireOpsSession } from "@/lib/ops/session";
import { releaseNeverCommitted } from "@/lib/ops/store";

export async function POST(request: Request) {
  const session = await requireOpsSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { quote_id?: string; reason?: string };
  try {
    body = (await request.json()) as { quote_id?: string; reason?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.quote_id || typeof body.quote_id !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await releaseNeverCommitted(
    session,
    body.quote_id,
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
