import "server-only";

import { cookies } from "next/headers";
import { OPS_SESSION_COOKIE, opsDevBypassEnabled } from "./config";

export type OpsSession = {
  operatorId: string;
  email: string;
  displayName: string;
};

export async function readOpsSession(): Promise<OpsSession | null> {
  const jar = await cookies();
  const raw = jar.get(OPS_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OpsSession;
    if (!parsed.operatorId || !parsed.email || !parsed.displayName) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeOpsSession(session: OpsSession): Promise<void> {
  const jar = await cookies();
  jar.set(OPS_SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearOpsSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(OPS_SESSION_COOKIE);
}

/** Auth gate for BFF + pages. Bypass uses cookie; live Auth + TOTP not wired. */
export async function requireOpsSession(): Promise<OpsSession | null> {
  const session = await readOpsSession();
  if (session) return session;
  if (!opsDevBypassEnabled()) return null;
  return null;
}
