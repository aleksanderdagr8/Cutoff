import { NextResponse } from "next/server";
import { readHomeSession } from "@/lib/home/session";
import {
  getMandateForSession,
  upsertMandateForSession,
} from "@/lib/home/store";

export async function GET() {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const mandate = await getMandateForSession(session);
  return NextResponse.json({ mandate });
}

export async function PUT(request: Request) {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    ceiling_cents?: number;
    expires_at?: string;
    address_id?: string;
    never_substitute_ids?: string[];
    canonical_item_ids?: string[];
  } | null;

  if (
    !body ||
    typeof body.ceiling_cents !== "number" ||
    !body.expires_at ||
    !body.address_id ||
    !Array.isArray(body.never_substitute_ids)
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await upsertMandateForSession(session, {
    ceiling_cents: body.ceiling_cents,
    expires_at: body.expires_at,
    address_id: body.address_id,
    never_substitute_ids: body.never_substitute_ids,
    canonical_item_ids: body.canonical_item_ids,
  });
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status as 401 },
    );
  }
  return NextResponse.json({ mandate: result });
}
