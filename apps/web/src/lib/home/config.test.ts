import { afterEach, describe, expect, it } from "vitest";
import { homeDevBypassEnabled, supabaseConfigured } from "./config";

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CUTOFF_HOME_DEV_BYPASS",
] as const;

function setNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

describe("homeDevBypassEnabled", () => {
  const prev: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });

  function snap() {
    for (const key of KEYS) {
      prev[key] = process.env[key];
    }
  }

  it("defaults to bypass when public Supabase env is missing", () => {
    snap();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.CUTOFF_HOME_DEV_BYPASS;
    expect(supabaseConfigured()).toBe(false);
    expect(homeDevBypassEnabled()).toBe(true);
  });

  it("disables bypass when public env is set and flag is 0", () => {
    snap();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.CUTOFF_HOME_DEV_BYPASS = "0";
    expect(supabaseConfigured()).toBe(true);
    expect(homeDevBypassEnabled()).toBe(false);
  });

  it("keeps escape hatch when flag is 1 even with public env", () => {
    snap();
    const prevNode = process.env.NODE_ENV;
    setNodeEnv("development");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.CUTOFF_HOME_DEV_BYPASS = "1";
    expect(homeDevBypassEnabled()).toBe(true);
    setNodeEnv(prevNode);
  });

  it("does not allow the bypass in production even when the flag is 1", () => {
    snap();
    const prevNode = process.env.NODE_ENV;
    setNodeEnv("production");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.CUTOFF_HOME_DEV_BYPASS = "1";
    expect(homeDevBypassEnabled()).toBe(false);
    setNodeEnv(prevNode);
  });

  it("auto-enables Auth when public env is set and flag is unset", () => {
    snap();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    delete process.env.CUTOFF_HOME_DEV_BYPASS;
    expect(homeDevBypassEnabled()).toBe(false);
  });
});
