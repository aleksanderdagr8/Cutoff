import { describe, expect, it } from "vitest";
import {
  buildWelcomeEmail,
  parseMemberInsert,
  welcomeAuthorized,
} from "../../../../../supabase/functions/_shared/welcome-email";

describe("welcome email", () => {
  it("is plain-text friendly and on the callcutoff.com domain", () => {
    const mail = buildWelcomeEmail("member@example.com");
    expect(mail.from).toBe("Cutoff <team@callcutoff.com>");
    expect(mail.text).toContain("https://callcutoff.com/home");
    expect(mail.text).toContain("Welcome to Cutoff");
    expect(mail.html).toContain("#1b3a4b");
    expect(mail.html.toLowerCase()).not.toContain("robot");
    expect(mail.text.toLowerCase()).not.toContain("robot");
  });

  it("accepts only a long bearer secret", () => {
    expect(welcomeAuthorized("Bearer short", "short")).toBe(false);
    const secret = "welcome-secret-value";
    expect(welcomeAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(welcomeAuthorized("Bearer other-secret-value", secret)).toBe(false);
    expect(welcomeAuthorized(null, secret)).toBe(false);
  });

  it("reads a member insert and ignores other webhook events", () => {
    expect(
      parseMemberInsert({
        type: "INSERT",
        table: "members",
        record: {
          member_id: "m1",
          household_id: "h1",
          email: "A@Example.com",
        },
      }),
    ).toEqual({
      memberId: "m1",
      householdId: "h1",
      email: "a@example.com",
    });
    expect(
      parseMemberInsert({
        type: "UPDATE",
        table: "members",
        record: { member_id: "m1", household_id: "h1", email: "a@b.co" },
      }),
    ).toBeNull();
  });
});
