import { NextResponse } from "next/server";
import { readHomeSession } from "@/lib/home/session";
import { placesApiConfigured, resolvePlace } from "@/lib/home/places";
import { upsertStructuredAddressForSession } from "@/lib/home/store";

export async function POST(request: Request) {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!placesApiConfigured()) {
    return NextResponse.json(
      { error: "places_not_configured", configured: false },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    place_id?: string;
    session_token?: string;
    line2?: string | null;
  } | null;

  if (!body?.place_id?.trim()) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const resolved = await resolvePlace(body.place_id, {
    sessionToken: body.session_token,
  });
  if ("error" in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }
  if (!("address" in resolved)) {
    return NextResponse.json(
      { error: "places_not_configured", configured: false },
      { status: 503 },
    );
  }

  const address = {
    ...resolved.address,
    line2:
      body.line2 !== undefined
        ? body.line2?.trim() || null
        : resolved.address.line2,
  };

  const saved = await upsertStructuredAddressForSession(session, address);
  if ("error" in saved) {
    return NextResponse.json(
      { error: saved.error },
      { status: saved.status as 401 | 422 },
    );
  }
  return NextResponse.json({ configured: true, address: saved });
}
