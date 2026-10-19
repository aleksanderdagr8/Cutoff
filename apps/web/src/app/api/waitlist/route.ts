import { NextResponse } from "next/server";

const PERSONAS = new Set(["household", "builder", "brand"]);

type WaitlistBody = {
  persona?: string;
  email?: string;
  name?: string;
  company?: string;
  note?: string;
};

/**
 * Early-access waitlist stub. Accepts lead capture only — no API key issuance.
 * Swap for a real store / CRM later without changing the marketing form contract.
 */
export async function POST(request: Request) {
  let body: WaitlistBody;
  try {
    body = (await request.json()) as WaitlistBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const persona = typeof body.persona === "string" ? body.persona.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!PERSONAS.has(persona)) {
    return NextResponse.json({ error: "invalid_persona" }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (email.length > 254 || name.length > 120 || company.length > 160 || note.length > 500) {
    return NextResponse.json({ error: "field_too_long" }, { status: 400 });
  }

  // Stub success — log for local/dev visibility; no persistence yet.
  console.info("[waitlist]", {
    persona,
    email,
    name: name || undefined,
    company: company || undefined,
    note: note || undefined,
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
