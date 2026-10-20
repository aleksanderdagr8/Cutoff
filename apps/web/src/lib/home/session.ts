import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { HOME_SESSION_COOKIE, homeDevBypassEnabled } from "./config";
import { ensureHomeMember } from "./member";
import { alignBypassSession } from "./store";
import { createHomeServerClient } from "./supabase/server";
import type { HomeSession } from "./types";

export type { HomeSession } from "./types";

export type HomeAuthGate =
  | { state: "anonymous" }
  | { state: "member"; session: HomeSession }
  | { state: "needs_email_code"; email: string; pending: boolean };

async function readBypassCookieSession(): Promise<HomeSession | null> {
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

type StatusRow = {
  granted?: boolean;
  pending?: boolean;
  email?: string;
  password?: boolean;
};

const readSupabaseGate = cache(async (): Promise<HomeAuthGate> => {
  try {
    const supabase = await createHomeServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { state: "anonymous" };

    const { data, error } = await supabase.rpc("home_email_2fa_status");
    const status = (error ? null : data) as StatusRow | null;
    const email = status?.email || user.email || "";

    if (status?.granted) {
      const member = await ensureHomeMember(supabase);
      if (!("error" in member)) return { state: "member", session: member };
    }

    if (status?.password) {
      return {
        state: "needs_email_code",
        email,
        pending: Boolean(status.pending),
      };
    }
    return { state: "anonymous" };
  } catch {
    return { state: "anonymous" };
  }
});

export async function readHomeAuthGate(): Promise<HomeAuthGate> {
  if (homeDevBypassEnabled()) {
    const session = await readHomeSession();
    return session
      ? { state: "member", session }
      : { state: "anonymous" };
  }
  return readSupabaseGate();
}

export async function readSignedInEmail(): Promise<string | null> {
  if (homeDevBypassEnabled()) return null;
  try {
    const supabase = await createHomeServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}

export async function readHomeSession(): Promise<HomeSession | null> {
  if (homeDevBypassEnabled()) {
    const cookie = await readBypassCookieSession();
    if (!cookie) return null;
    // After server restart the in-memory demo household is reseeded; an old
    // bypass cookie still "looks" signed-in but fails mutations with 401.
    const aligned = await alignBypassSession(cookie);
    if (
      aligned.memberId !== cookie.memberId ||
      aligned.householdId !== cookie.householdId ||
      aligned.householdName !== cookie.householdName
    ) {
      await writeHomeSession(aligned);
    }
    return aligned;
  }
  const gate = await readSupabaseGate();
  return gate.state === "member" ? gate.session : null;
}

export async function writeHomeSession(session: HomeSession): Promise<void> {
  const jar = await cookies();
  try {
    jar.set(HOME_SESSION_COOKIE, JSON.stringify(session), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 14,
    });
  } catch {
    // RSC render cannot set cookies — API routes / actions still heal.
  }
}

export async function clearHomeSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(HOME_SESSION_COOKIE);
}

/** Auth gate for BFF + pages. */
export async function requireHomeSession(): Promise<HomeSession | null> {
  return readHomeSession();
}
