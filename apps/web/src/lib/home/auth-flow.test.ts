import { describe, expect, it } from "vitest";
import {
  finishEmailLink,
  requestPasswordReset,
  setNewPassword,
  startPasswordSignIn,
  startSignUp,
  verifyEmailCode,
  type HouseholdAuthClient,
} from "./auth-flow";

function client(partial: Partial<HouseholdAuthClient> = {}): {
  client: HouseholdAuthClient;
  calls: string[];
} {
  const calls: string[] = [];
  const base: HouseholdAuthClient = {
    signInWithPassword: async () => {
      calls.push("signIn");
      return { error: null };
    },
    signUp: async () => {
      calls.push("signUp");
      return { data: { session: null, user: { id: "u" } }, error: null };
    },
    reauthenticate: async () => {
      calls.push("reauthenticate");
      return { error: null };
    },
    resetPasswordForEmail: async () => {
      calls.push("reset");
      return { error: null };
    },
    updateUser: async () => {
      calls.push("updateUser");
      return { error: null };
    },
    signOut: async () => {
      calls.push("signOut");
      return { error: null };
    },
    verifyOtp: async () => {
      calls.push("verifyOtp");
      return { error: null };
    },
    exchangeCodeForSession: async () => {
      calls.push("exchange");
      return { error: null };
    },
    rpc: async (fn) => {
      calls.push(fn);
      if (fn === "home_email_2fa_may_send" || fn === "home_begin_email_2fa") {
        return { data: { ok: true }, error: null };
      }
      if (fn === "home_verify_email_2fa") return { data: { ok: true }, error: null };
      if (fn === "ensure_home_member") {
        return {
          data: {
            member_id: "m1",
            household_id: "h1",
            email: "a@b.co",
            household_name: "Home",
          },
          error: null,
        };
      }
      return { data: { ok: true }, error: null };
    },
  };
  return { client: { ...base, ...partial }, calls };
}

describe("password sign-in", () => {
  it("sends a code and does not open the household", async () => {
    const { client: auth, calls } = client();
    const result = await startPasswordSignIn(auth, {
      email: "A@B.co",
      password: "long-enough",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.step).toBe("email_code");
    expect(calls).toContain("reauthenticate");
    expect(calls).not.toContain("ensure_home_member");
  });

  it("stops on a wrong password before emailing a code", async () => {
    const { client: auth, calls } = client({
      signInWithPassword: async () => {
        calls.push("signIn");
        return { error: { message: "Invalid login credentials" } };
      },
    });
    const result = await startPasswordSignIn(auth, {
      email: "a@b.co",
      password: "long-enough",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
    expect(calls).not.toContain("reauthenticate");
  });

  it("keeps the session when sending is rate limited", async () => {
    const { client: auth, calls } = client({
      rpc: async (fn) => {
        calls.push(fn);
        if (fn === "home_email_2fa_may_send") {
          return { data: { ok: false, reason: "rate_limited" }, error: null };
        }
        return { data: { ok: true }, error: null };
      },
    });
    const result = await startPasswordSignIn(auth, {
      email: "a@b.co",
      password: "long-enough",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(429);
    expect(calls).not.toContain("signOut");
    expect(calls).not.toContain("ensure_home_member");
  });
});

describe("sign-up and verify", () => {
  it("asks the person to confirm when Auth withholds a session", async () => {
    const { client: auth, calls } = client();
    const result = await startSignUp(auth, {
      email: "a@b.co",
      password: "long-enough",
      emailRedirectTo: "https://callcutoff.com/home/auth/callback?next=/home/sign-in",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.step).toBe("confirm_email");
    expect(calls).not.toContain("reauthenticate");
  });

  it("opens the household only after the code matches", async () => {
    const { client: auth, calls } = client();
    const result = await verifyEmailCode(auth, "123 456");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.step).toBe("signed_in");
      expect(result.body.session).toMatchObject({ memberId: "m1" });
    }
    expect(calls).toContain("home_verify_email_2fa");
    expect(calls).toContain("ensure_home_member");
  });

  it("rejects a short code without calling the database", async () => {
    const { client: auth, calls } = client();
    const result = await verifyEmailCode(auth, "12");
    expect(result.ok).toBe(false);
    expect(calls).not.toContain("home_verify_email_2fa");
  });

  it("does not call a wrong code a mismatch when the check itself fails", async () => {
    const { client: auth } = client({
      rpc: async () => ({ data: null, error: { message: "permission denied" } }),
    });
    const result = await verifyEmailCode(auth, "123456");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.body.error).toBe("email_code_failed");
    }
  });
});

describe("password reset", () => {
  it("returns the same success when the account is missing", async () => {
    const { client: auth } = client({
      resetPasswordForEmail: async () => ({
        error: { message: "User not found" },
      }),
    });
    const result = await requestPasswordReset(
      auth,
      "missing@b.co",
      "https://callcutoff.com/home/auth/callback?next=/home/reset-password",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.step).toBe("reset_sent");
  });

  it("signs out after the password is saved", async () => {
    const { client: auth, calls } = client();
    const result = await setNewPassword(auth, "new-password");
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["updateUser", "home_clear_email_2fa", "signOut"]);
  });
});

describe("email links", () => {
  it("signs out after confirmation so the password is still required", async () => {
    const { client: auth, calls } = client();
    const result = await finishEmailLink(auth, {
      type: "signup",
      next: "/home",
      tokenHash: "abc",
    });
    expect(result.redirect).toBe("/home/sign-in?notice=confirmed");
    expect(calls).toEqual(["verifyOtp", "signOut"]);
  });

  it("keeps the recovery session for the new-password page", async () => {
    const { client: auth, calls } = client();
    const result = await finishEmailLink(auth, {
      type: "recovery",
      next: "/home/reset-password",
      tokenHash: "abc",
    });
    expect(result.redirect).toBe("/home/reset-password");
    expect(calls).toEqual(["verifyOtp"]);
  });
});
