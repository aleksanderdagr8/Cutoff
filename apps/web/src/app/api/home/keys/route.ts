import { NextResponse } from "next/server";
import { readHomeSession } from "@/lib/home/session";
import { issueKeyForSession, listKeysForSession } from "@/lib/home/store";

const ALLOWED = new Set(["quote", "commit", "read_list"]);

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
  // Unit 22: default quote + read_list; commit is opt-in.
  let scopes: Array<"quote" | "commit" | "read_list"> = ["quote", "read_list"];
  try {
    const body = (await request.json()) as { scopes?: string[] };
    if (Array.isArray(body.scopes) && body.scopes.length > 0) {
      const next = body.scopes.filter(
        (s): s is "quote" | "commit" | "read_list" => ALLOWED.has(s),
      );
      if (next.length > 0) scopes = next;
    }
  } catch {
    // defaults
  }
  // Always include quote + read_list so MCP tools/list is useful.
  if (!scopes.includes("quote")) scopes = ["quote", ...scopes];
  if (!scopes.includes("read_list")) scopes = [...scopes, "read_list"];

  const result = await issueKeyForSession(session, scopes);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status as 401 },
    );
  }
  return NextResponse.json(result, { status: 201 });
}
