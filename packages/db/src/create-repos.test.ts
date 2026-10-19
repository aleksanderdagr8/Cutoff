import { describe, expect, it } from "vitest";
import { FakePayAdapter } from "@cutoff/adapters";
import {
  createRepos,
  resolveReposModeFromEnv,
} from "./create-repos.js";
import { MemoryAgentCredentialRepository } from "./agents.js";
import { MemoryMandateRepository } from "./mandates.js";
import { MemoryOrderRepository } from "./orders.js";
import { MemoryQuoteRepository } from "./quotes.js";

describe("createRepos", () => {
  it("defaults to memory repositories", () => {
    const repos = createRepos({ pay: new FakePayAdapter() });
    expect(repos.mode).toBe("memory");
    expect(repos.orders).toBeInstanceOf(MemoryOrderRepository);
    expect(repos.quotes).toBeInstanceOf(MemoryQuoteRepository);
    expect(repos.mandates).toBeInstanceOf(MemoryMandateRepository);
    expect(repos.agents).toBeInstanceOf(MemoryAgentCredentialRepository);
    expect(repos.supabase).toBeNull();
  });

  it("explicit memory mode ignores env-looking keys when not requested", () => {
    const repos = createRepos({
      mode: "memory",
      pay: new FakePayAdapter(),
    });
    expect(repos.mode).toBe("memory");
    expect(repos.orders).toBeInstanceOf(MemoryOrderRepository);
  });

  it("postgres mode without client or env throws", () => {
    expect(() =>
      createRepos({
        mode: "postgres",
        pay: new FakePayAdapter(),
        env: {},
      }),
    ).toThrow(/SUPABASE_URL/);
  });
});

describe("resolveReposModeFromEnv", () => {
  it("returns memory when env is empty", () => {
    expect(resolveReposModeFromEnv({})).toBe("memory");
  });

  it("returns postgres when URL and service role are set", () => {
    expect(
      resolveReposModeFromEnv({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE: "service-role-test-key",
      }),
    ).toBe("postgres");
  });

  it("returns memory when only URL is set", () => {
    expect(
      resolveReposModeFromEnv({
        SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toBe("memory");
  });
});
