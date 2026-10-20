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

  it("connect snippets cover Claude, ChatGPT, Cursor, Grok, and raw MCP", () => {
    const src = readFileSync(
      join(import.meta.dirname, "components/home/connect-snippets.tsx"),
      "utf8",
    );
    expect(src).toContain("https://mcp.callcutoff.com/mcp");
    expect(src).toContain("mcp-remote");
    expect(src).toContain("mcp.json");
    expect(src).toContain("ChatGPT");
    expect(src).toContain("Grok");
    expect(src).toContain("grok mcp add");
    expect(src).toContain('"type": "mcp"');
    expect(src).toContain("authorization");
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
    expect(src).toContain("home-bottom-nav");
    // One bottom nav only; header wordmark slightly larger than the old 22px mark.
    expect(src.match(/home-bottom-nav/g)?.length).toBe(1);
    expect(src).toContain("text-[28px]");
    expect(src).not.toContain("text-[22px]");
    expect(src).toContain("HouseholdMenu");
    expect(src).toContain("HomeThemeProvider");
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

  it("household menu hosts dark mode toggle (not header chrome icon)", () => {
    const menu = readFileSync(
      join(import.meta.dirname, "components/home/household-menu.tsx"),
      "utf8",
    );
    expect(menu).toContain('aria-label="Dark mode"');
    expect(menu).toContain('role="switch"');
    expect(menu).toContain('variant: "desktop" | "mobile"');
    expect(menu).toContain("Open menu");
    expect(menu).toContain("Match system");
    expect(menu).toContain("/home/help");
    expect(menu).not.toContain("localStorage");
    expect(menu).not.toContain("sessionStorage");

    const theme = readFileSync(
      join(import.meta.dirname, "lib/home/theme.ts"),
      "utf8",
    );
    expect(theme).toContain("cutoff-home-theme");
    expect(theme).toContain("localStorage");
    expect(theme).toContain('"system"');
  });

  it("home motion uses CSS enter/stagger/press without a heavy animation lib", () => {
    const css = readFileSync(
      join(import.meta.dirname, "app/globals.css"),
      "utf8",
    );
    expect(css).toContain("home-section");
    expect(css).toContain("home-press");
    expect(css).toContain("home-row-muted");
    expect(css).toContain("home-wordmark-enter");
    expect(css).toContain("home-title-kinetic");
    expect(css).toContain("home-empty-kinetic");
    expect(css).toContain('html[data-home-theme="dark"] .home-shell');
    expect(css).toContain("prefers-reduced-motion");

    const pkg = readFileSync(
      join(import.meta.dirname, "../package.json"),
      "utf8",
    );
    expect(pkg).not.toContain("framer-motion");
  });

  it("kinetic type is limited to wordmark, section titles, and empty headlines", () => {
    const wordmark = readFileSync(
      join(import.meta.dirname, "components/home/home-wordmark.tsx"),
      "utf8",
    );
    expect(wordmark).toContain("home-wordmark-enter");
    expect(wordmark).toContain("peekHomeWordmarkEnter");
    expect(wordmark).not.toContain("sessionStorage");

    const motion = readFileSync(
      join(import.meta.dirname, "lib/home/motion.ts"),
      "utf8",
    );
    expect(motion).toContain("sessionStorage");
    expect(motion).toContain("cutoff-home-wordmark-enter");

    const title = readFileSync(
      join(import.meta.dirname, "components/home/home-section-title.tsx"),
      "utf8",
    );
    expect(title).toContain("home-title-kinetic");

    const empty = readFileSync(
      join(import.meta.dirname, "components/home/home-empty-headline.tsx"),
      "utf8",
    );
    expect(empty).toContain("home-empty-kinetic");
  });

  it("home routes exist for Adopted areas", () => {
    const app = join(import.meta.dirname, "app/home");
    expect(statSync(join(app, "page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "sign-in/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "sign-up/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "forgot-password/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "reset-password/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "verify/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "auth/confirm/route.ts")).isFile()).toBe(true);
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
    const postJson = readFileSync(join(root, "auth/post-json.ts"), "utf8");
    expect(postJson).toContain('credentials: "include"');
    for (const name of [
      "sign-in-form.tsx",
      "auth/sign-up-form.tsx",
      "auth/forgot-password-form.tsx",
      "auth/reset-password-form.tsx",
      "auth/verify-code-form.tsx",
    ]) {
      const src = readFileSync(join(root, name), "utf8");
      expect(src, name).toContain("postAuth");
    }
    for (const name of [
      "mandate-client.tsx",
      "address-autofill.tsx",
      "keys-client.tsx",
      "list-client.tsx",
      "receipt-actions.tsx",
      "sign-out-button.tsx",
    ]) {
      const src = readFileSync(join(root, name), "utf8");
      expect(src, name).toContain('credentials: "include"');
    }
    const verify = readFileSync(join(root, "auth/verify-code-form.tsx"), "utf8");
    expect(verify).toContain('credentials: "include"');
  });

  it("mandate address uses Places typeahead and keeps address_id", () => {
    const autofill = readFileSync(
      join(import.meta.dirname, "components/home/address-autofill.tsx"),
      "utf8",
    );
    expect(autofill).toContain('role="combobox"');
    expect(autofill).toContain('role="listbox"');
    expect(autofill).toContain("/api/home/address/suggest");
    expect(autofill).toContain("/api/home/address/resolve");
    expect(autofill).toContain("GOOGLE_PLACES_API_KEY");
    expect(autofill).toContain("onAddressIdChange");
    expect(autofill).not.toContain("localStorage");

    const mandate = readFileSync(
      join(import.meta.dirname, "components/home/mandate-client.tsx"),
      "utf8",
    );
    expect(mandate).toContain("AddressAutofill");
    expect(mandate).toContain("address_id");

    expect(
      statSync(
        join(import.meta.dirname, "app/api/home/address/suggest/route.ts"),
      ).isFile(),
    ).toBe(true);
    expect(
      statSync(
        join(import.meta.dirname, "app/api/home/address/resolve/route.ts"),
      ).isFile(),
    ).toBe(true);
    expect(
      statSync(join(import.meta.dirname, "app/api/home/address/route.ts"))
        .isFile(),
    ).toBe(true);

    const places = readFileSync(
      join(import.meta.dirname, "lib/home/places.ts"),
      "utf8",
    );
    expect(places).toContain("GOOGLE_PLACES_API_KEY");
    expect(places).toContain("places.googleapis.com");
    expect(places).not.toContain("NEXT_PUBLIC_GOOGLE");
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

  it("auth screens name their fields and avoid decorative imagery", () => {
    const root = join(import.meta.dirname, "components/home");
    const signIn = readFileSync(join(root, "sign-in-form.tsx"), "utf8");
    const ui = readFileSync(join(root, "auth/auth-ui.tsx"), "utf8");
    expect(signIn).toContain('id="email"');
    expect(signIn).toContain('id="password"');
    expect(signIn).toContain("/home/forgot-password");
    expect(signIn).toContain("/home/sign-up");
    expect(ui).toContain('role="alert"');
    expect(ui).toContain("aria-invalid");
    expect(ui).toContain("aria-busy");
    const verify = readFileSync(join(root, "auth/verify-code-form.tsx"), "utf8");
    expect(verify).toContain('autoComplete="one-time-code"');
    for (const file of [signIn, ui, verify]) {
      expect(file.toLowerCase()).not.toContain("robot");
    }
  });
});
