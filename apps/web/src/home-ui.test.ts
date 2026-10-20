import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist") {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, acc);
    } else if (/\.(ts|tsx)$/.test(name)) {
      acc.push(path);
    }
  }
  return acc;
}

describe("household /home UI hygiene", () => {
  it("client components never persist agent secrets to browser storage", () => {
    const root = join(import.meta.dirname, "components/home");
    const files = walk(root);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toContain("localStorage");
      expect(src, file).not.toContain("sessionStorage");
    }
  });

  it("keys client shows secret once and documents no storage", () => {
    const src = readFileSync(
      join(import.meta.dirname, "components/home/keys-client.tsx"),
      "utf8",
    );
    expect(src).toContain("shown once");
    expect(src).toContain("Never copied into browser storage");
    expect(src).toContain("setIssuedSecret");
    expect(src).toContain("Issue key");
    expect(src).toContain("Revoke");
    expect(src).toContain("Connect an assistant");
    expect(src).toContain("Connected ✓");
    expect(src).toContain("commit");
    expect(src).toContain("opt-in");
    expect(src).toContain("/api/home/nudge-settings");
    expect(src).not.toMatch(/regenerat/i);
  });

  it("connect snippets cover Claude, ChatGPT, Cursor, and raw MCP", () => {
    const src = readFileSync(
      join(import.meta.dirname, "components/home/connect-snippets.tsx"),
      "utf8",
    );
    expect(src).toContain("https://mcp.callcutoff.com/mcp");
    expect(src).toContain("mcp-remote");
    expect(src).toContain("mcp.json");
    expect(src).toContain("ChatGPT");
    expect(src).toContain("tools/list");
    expect(src).not.toContain("localStorage");
  });

  it("list client exposes due dates and skip modes", () => {
    const src = readFileSync(
      join(import.meta.dirname, "components/home/list-client.tsx"),
      "utf8",
    );
    expect(src).toContain("formatDueAt");
    expect(src).toContain('"next"');
    expect(src).toContain('"snooze"');
    expect(src).toContain('"pause"');
    expect(src).toContain("Snooze 1 wk");
  });

  it("keys API defaults to quote + read_list without commit", () => {
    const src = readFileSync(
      join(import.meta.dirname, "app/api/home/keys/route.ts"),
      "utf8",
    );
    expect(src).toContain('["quote", "read_list"]');
    expect(src).toMatch(/commit is opt-in/);
  });

  it("nudge-settings BFF exists for webhook URL", () => {
    expect(
      statSync(
        join(import.meta.dirname, "app/api/home/nudge-settings/route.ts"),
      ).isFile(),
    ).toBe(true);
  });

  it("home shell exposes Adopted primary nav", () => {
    const src = readFileSync(
      join(import.meta.dirname, "components/home/shell.tsx"),
      "utf8",
    );
    expect(src).toContain('href: "/home"');
    expect(src).toContain('href: "/home/list"');
    expect(src).toContain('href: "/home/orders"');
    expect(src).toContain('href: "/home/mandate"');
    expect(src).toContain('href: "/home/keys"');
    expect(src).toContain("/home/help");
    expect(src).toContain("home-bottom-nav");
    // One bottom nav only; header wordmark slightly larger than the old 22px mark.
    expect(src.match(/home-bottom-nav/g)?.length).toBe(1);
    expect(src).toContain('text-[28px]');
    expect(src).not.toContain('text-[22px]');
  });

  it("Today and sign-in do not duplicate the CUTOFF wordmark as a page title", () => {
    const today = readFileSync(
      join(import.meta.dirname, "app/home/page.tsx"),
      "utf8",
    );
    const signIn = readFileSync(
      join(import.meta.dirname, "app/home/sign-in/page.tsx"),
      "utf8",
    );
    expect(today).not.toMatch(/<h1[^>]*>\s*CUTOFF\s*<\/h1>/);
    expect(signIn).not.toMatch(/<h1[^>]*>\s*CUTOFF\s*<\/h1>/);
    expect(today).toContain("session.email");
    expect(today).toContain("Today");
  });

  it("home routes exist for Adopted areas", () => {
    const app = join(import.meta.dirname, "app/home");
    expect(statSync(join(app, "page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "sign-in/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "list/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "orders/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "mandate/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "keys/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "help/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "receipts/[token]/page.tsx")).isFile()).toBe(
      true,
    );
  });

  it("home mutation clients send credentials so session cookies ride along", () => {
    const root = join(import.meta.dirname, "components/home");
    for (const name of [
      "mandate-client.tsx",
      "keys-client.tsx",
      "list-client.tsx",
      "receipt-actions.tsx",
      "sign-in-form.tsx",
      "sign-out-button.tsx",
    ]) {
      const src = readFileSync(join(root, name), "utf8");
      expect(src, name).toContain('credentials: "include"');
    }
  });

  it("bypass demo household uses stable ids and heals stale cookies", () => {
    const store = readFileSync(
      join(import.meta.dirname, "lib/home/store.ts"),
      "utf8",
    );
    expect(store).toContain("DEMO_HOUSEHOLD_ID");
    expect(store).toContain("DEMO_MEMBER_ID");
    expect(store).toContain("alignBypassSession");
    const session = readFileSync(
      join(import.meta.dirname, "lib/home/session.ts"),
      "utf8",
    );
    expect(session).toContain("alignBypassSession");
  });
});
