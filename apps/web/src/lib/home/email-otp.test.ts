import { describe, expect, it } from "vitest";
import {
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_TTL_MINUTES,
  afterEmailLink,
  gotrueReauthenticationHash,
  mapSupabaseAuthError,
  messageForOtpReason,
  requestOrigin,
  safeInternalPath,
} from "./email-otp";

describe("gotrue reauthentication hash", () => {
  it("matches the published SHA-224 vector", () => {
    expect(
      gotrueReauthenticationHash("gotrue@testing.email.ai.moda", "131337"),
    ).toBe("3f4cef3ebadfa21c8a4559e025966e5806dcc6081d3cf657444c0054");
  });
});

describe("otp copy and limits", () => {
  it("keeps the attempt cap and lifetime used by the migration", () => {
    expect(EMAIL_OTP_MAX_ATTEMPTS).toBe(5);
    expect(EMAIL_OTP_TTL_MINUTES).toBe(10);
  });

  it("names remaining tries and lockout", () => {
    expect(messageForOtpReason("mismatch", 2)).toContain("2 tries left");
    expect(messageForOtpReason("locked")).toContain("new code");
    expect(messageForOtpReason("rate_limited")).toContain("Wait");
  });

  it("maps auth errors to short sentences", () => {
    expect(mapSupabaseAuthError("Invalid login credentials")).toContain("don't match");
    expect(mapSupabaseAuthError("Email rate limit exceeded")).toContain("Wait");
  });
});

describe("auth redirects", () => {
  it("rejects absolute and protocol-relative next paths", () => {
    expect(safeInternalPath("https://evil.test", "/home")).toBe("/home");
    expect(safeInternalPath("//evil.test", "/home")).toBe("/home");
    expect(safeInternalPath("/home/reset-password", "/home")).toBe(
      "/home/reset-password",
    );
  });

  it("treats recovery links differently from confirmation", () => {
    expect(afterEmailLink("recovery", "/home")).toBe("recovery");
    expect(afterEmailLink(null, "/home/reset-password")).toBe("recovery");
    expect(afterEmailLink("signup", "/home/sign-in")).toBe("confirmed");
    expect(afterEmailLink(null, "https://evil.test/home/reset-password")).toBe(
      "confirmed",
    );
  });

  it("uses the apex origin for the production host", () => {
    const request = new Request("http://internal/home/sign-in", {
      headers: { host: "www.callcutoff.com", "x-forwarded-proto": "https" },
    });
    expect(requestOrigin(request)).toBe("https://callcutoff.com");
  });
});
