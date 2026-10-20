import { afterEach, describe, expect, it } from "vitest";
import { opsDevBypassEnabled } from "./config";

const KEYS = [
  "NODE_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CUTOFF_OPS_DEV_BYPASS",
] as const;

function env(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

describe("opsDevBypassEnabled", () => {
  const prev: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of KEYS) {
      if (prev[key] === undefined) delete env()[key];
      else env()[key] = prev[key];
    }
  });

  function snap() {
    for (const key of KEYS) {
      prev[key] = env()[key];
    }
  }

  it("allows the bypass in local dev when the flag is 1", () => {
    snap();
    env().NODE_ENV = "development";
    process.env.CUTOFF_OPS_DEV_BYPASS = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    expect(opsDevBypassEnabled()).toBe(true);
  });

  it("does not allow the bypass in production even when the flag is 1", () => {
    snap();
    env().NODE_ENV = "production";
    process.env.CUTOFF_OPS_DEV_BYPASS = "1";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(opsDevBypassEnabled()).toBe(false);
  });

  it("does not allow the bypass in production when the flag is 0", () => {
    snap();
    env().NODE_ENV = "production";
    process.env.CUTOFF_OPS_DEV_BYPASS = "0";
    expect(opsDevBypassEnabled()).toBe(false);
  });
});
