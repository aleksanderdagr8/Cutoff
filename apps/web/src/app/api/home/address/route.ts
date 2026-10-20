import { NextResponse } from "next/server";
import { readHomeSession } from "@/lib/home/session";
import { placesApiConfigured } from "@/lib/home/places";
import {
  getAddressForSession,
  updateAddressUnitForSession,
} from "@/lib/home/store";

/** Status + optional address lookup for the mandate UI. */
export async function GET(request: Request) {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const addressId = url.searchParams.get("address_id");
  const configured = placesApiConfigured();

  if (!addressId) {
    return NextResponse.json({ configured, address: null });
  }

  const address = await getAddressForSession(session, addressId);
  return NextResponse.json({ configured, address });
}

/** Update unit / apt on an already-resolved household address. */
export async function PATCH(request: Request) {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    address_id?: string;
    line2?: string | null;
  } | null;

  if (!body?.address_id?.trim()) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const updated = await updateAddressUnitForSession(
    session,
    body.address_id.trim(),
    body.line2 ?? null,
  );
  if ("error" in updated) {
    return NextResponse.json(
      { error: updated.error },
      { status: updated.status as 401 | 404 },
    );
  }
  return NextResponse.json({ address: updated });
}
