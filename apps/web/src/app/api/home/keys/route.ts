import { NextResponse } from "next/server";
import { readHomeSession } from "@/lib/home/session";
import { issueKeyForSession, listKeysForSession } from "@/lib/home/store";

export async function GET() {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const keys = await listKeysForSession(session);
  return NextResponse.json({ keys });
}

/** Issue agent key. Secret returned once — never written to browser storage. */
export async function POST(request: Request) {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  let scopes: Array<"quote" | "commit" | "read_list"> = [
    "quote",
    "commit",
    "read_list",
  ];
  try {
    const body = (await request.json()) as { scopes?: string[] };
    if (Array.isArray(body.scopes) && body.scopes.length > 0) {
      scopes = body.scopes as Array<"quote" | "commit" | "read_list">;
    }
  } catch {
    // defaults
  }

  const result = await issueKeyForSession(session, scopes);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status as 401 },
    );
  }
  return NextResponse.json(result, { status: 201 });
}
