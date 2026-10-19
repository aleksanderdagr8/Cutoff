import "server-only";

import { cookies } from "next/headers";
import { HOME_SESSION_COOKIE, homeDevBypassEnabled } from "./config";

export type HomeSession = {
  memberId: string;
  householdId: string;
  email: string;
  householdName: string;
};

export async function readHomeSession(): Promise<HomeSession | null> {
  const jar = await cookies();
  const raw = jar.get(HOME_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HomeSession;
    if (
      !parsed.memberId ||
      !parsed.householdId ||
      !parsed.email ||
      !parsed.householdName
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeHomeSession(session: HomeSession): Promise<void> {
  const jar = await cookies();
  jar.set(HOME_SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearHomeSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(HOME_SESSION_COOKIE);
}

/** Auth gate for BFF + pages. Bypass uses cookie; live Auth not wired yet. */
export async function requireHomeSession(): Promise<HomeSession | null> {
  const session = await readHomeSession();
  if (session) return session;
  if (!homeDevBypassEnabled()) return null;
  return null;
}
