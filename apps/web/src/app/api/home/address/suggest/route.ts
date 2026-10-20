import { NextResponse } from "next/server";
import { readHomeSession } from "@/lib/home/session";
import { suggestAddresses } from "@/lib/home/places";

export async function GET(request: Request) {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const sessionToken = url.searchParams.get("session_token") ?? undefined;

  const result = await suggestAddresses(q, { sessionToken });
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, configured: true, suggestions: [] },
      { status: result.status },
    );
  }
  return NextResponse.json(result);
}
