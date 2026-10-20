import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

describe("marketing `/` hygiene", () => {
  it("root page mounts MarketingPage and keeps product shells separate", () => {
    const page = readFileSync(
      join(import.meta.dirname, "app/page.tsx"),
      "utf8",
    );
    expect(page).toContain("MarketingPage");
    expect(page).not.toContain("/ops");
  });

  it("marketing copy avoids dropped claims and invented pricing", () => {
    const root = join(import.meta.dirname, "components/marketing");
    const files = [
      "marketing-page.tsx",
      "hero-terminal.tsx",
      "builders-panel.tsx",
      "proof-strip.tsx",
      "waitlist-form.tsx",
    ];
    const joined = files
      .map((f) => readFileSync(join(root, f), "utf8"))
      .join("\n");
    expect(joined).not.toMatch(/3\.5%/);
    expect(joined).not.toMatch(/\$199/);
    expect(joined).not.toMatch(/Cutoff Spread/i);
    expect(joined).not.toMatch(/Connect Shopify/i);
    expect(joined).not.toMatch(/Protocol Live/i);
    expect(joined).not.toMatch(/virtual card/i);
    expect(joined).toMatch(/coffee/i);
    expect(joined).toMatch(/filter/i);
    expect(joined).toMatch(/towel/i);
    expect(joined).toContain("CUTOFF");
    expect(joined).toContain("/home");
    expect(joined).toMatch(/work for you/i);
    expect(joined).toMatch(/Keep the refill/i);
    expect(joined).toMatch(/household/i);
  });

  it("proof strip ships Top 5 one-liners under Why care, not in the hero", () => {
    const page = readFileSync(
      join(import.meta.dirname, "components/marketing/marketing-page.tsx"),
      "utf8",
    );
    const strip = readFileSync(
      join(import.meta.dirname, "components/marketing/proof-strip.tsx"),
      "utf8",
    );
    expect(page).toContain("ProofStrip");
    expect(page.indexOf("Why care")).toBeLessThan(page.indexOf("<ProofStrip"));
    expect(page.indexOf("<ProofStrip")).toBeLessThan(page.indexOf('id="enforced"'));
    expect(strip).toContain("What agents hit today");
    expect(strip).toContain("/docs/why-agents-fail");
    expect(strip).toMatch(/13 of 16/);
    expect(strip).toMatch(/τ-bench|tau-bench|pass/i);
    expect(strip).toMatch(/\$825/);
    expect(strip).toMatch(/Perplexity/);
    expect(strip).toMatch(/\$2\.5B|2\.5B/);
    expect(strip).toMatch(/prefers-reduced-motion|reduceMotion/);
  });

  it("builders panel cites shelf-not-scrape with Amazon + Cloudflare", () => {
    const page = readFileSync(
      join(import.meta.dirname, "components/marketing/marketing-page.tsx"),
      "utf8",
    );
    const builders = readFileSync(
      join(import.meta.dirname, "components/marketing/builders-panel.tsx"),
      "utf8",
    );
    expect(page).toMatch(/alleges/i);
    expect(page).toMatch(/Perplexity/);
    expect(page).toMatch(/Cloudflare/);
    expect(page).toMatch(/Grok/);
    expect(builders).toMatch(/Why scrape fails/);
    expect(builders).toMatch(/shelf, not a storefront/i);
  });

  it("public evidence docs page prefers primaries and hedges ⚠ items", () => {
    const docs = readFileSync(
      join(import.meta.dirname, "app/docs/why-agents-fail/page.tsx"),
      "utf8",
    );
    expect(docs).toContain("arxiv.org/abs/2307.13854");
    expect(docs).toContain("arxiv.org/abs/2406.12045");
    expect(docs).toContain("blog.cloudflare.com/secure-agentic-commerce");
    expect(docs).toContain(
      "ftc.gov/news-events/news/press-releases/2025/09/ftc-secures-historic-25-billion-settlement-against-amazon",
    );
    expect(docs).toContain("courtlistener.com");
    expect(docs).toMatch(/historical baseline/i);
    expect(docs).toMatch(/alleges/i);
    expect(docs).not.toMatch(/en banc/i);
    expect(docs).not.toMatch(/reddit\.com/i);
    expect(docs).not.toMatch(/wrong charged total.*found/i);
  });

  it("waitlist stub accepts POST and does not mint API keys", () => {
    const src = readFileSync(
      join(import.meta.dirname, "app/api/waitlist/route.ts"),
      "utf8",
    );
    expect(src).toContain("export async function POST");
    expect(src).toMatch(/lead capture only/i);
    expect(src).not.toMatch(/ck_live_/);
    expect(src).not.toMatch(/api.?key.?generat/i);
  });

  it("links the blog from the marketing nav and footer", () => {
    const header = readFileSync(
      join(import.meta.dirname, "components/marketing/marketing-header.tsx"),
      "utf8",
    );
    const page = readFileSync(
      join(import.meta.dirname, "components/marketing/marketing-page.tsx"),
      "utf8",
    );
    const docs = readFileSync(
      join(import.meta.dirname, "app/docs/why-agents-fail/page.tsx"),
      "utf8",
    );
    expect(header).toContain('href: "/blog"');
    expect(header).toContain('label: "Blog"');
    expect(page).toContain('href="/blog"');
    expect(docs).toContain('href="/blog"');
  });

  it("marketing components exist", () => {
    const root = join(import.meta.dirname, "components/marketing");
    for (const name of [
      "marketing-page.tsx",
      "marketing-header.tsx",
      "marketing-reveal.tsx",
      "hero-terminal.tsx",
      "builders-panel.tsx",
      "proof-strip.tsx",
      "waitlist-form.tsx",
    ]) {
      expect(statSync(join(root, name)).isFile()).toBe(true);
    }
  });

  it("landing ships perceptible kinetic type + reduced-motion", () => {
    const css = readFileSync(
      join(import.meta.dirname, "app/globals.css"),
      "utf8",
    );
    expect(css).toContain("marketing-brand-kinetic");
    expect(css).toContain("marketing-headline-kinetic");
    expect(css).toContain("marketing-cta-group");
    expect(css).toContain("marketing-hero-panel");
    expect(css).toContain("marketing-reveal-in");
    expect(css).toContain("marketing-brand-settle");
    expect(css).toContain("marketing-headline-settle");
    expect(css).toContain("marketing-section-rise");
    // Scroll enter must travel far enough to read while scrolling
    expect(css).toMatch(/marketing-section-rise[\s\S]*translateY\(44px\)/);
    expect(css).toMatch(/marketing-section-rise[\s\S]*blur\(10px\)/);
    expect(css).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*marketing-brand-kinetic/,
    );

    const page = readFileSync(
      join(import.meta.dirname, "components/marketing/marketing-page.tsx"),
      "utf8",
    );
    expect(page).toContain("marketing-brand-kinetic");
    expect(page).toContain("marketing-headline-kinetic");
    expect(page).toContain("marketing-cta-group");
    expect(page).toContain("MarketingReveal");
    // Hero brand is page-level, not only nav text
    expect(page).toMatch(
      /marketing-brand-kinetic[\s\S]*CUTOFF[\s\S]*marketing-headline-kinetic/,
    );

    const reveal = readFileSync(
      join(import.meta.dirname, "components/marketing/marketing-reveal.tsx"),
      "utf8",
    );
    expect(reveal).toContain("IntersectionObserver");
    expect(reveal).toContain("prefers-reduced-motion");

    const header = readFileSync(
      join(import.meta.dirname, "components/marketing/marketing-header.tsx"),
      "utf8",
    );
    // #37 mobile header chrome must stay
    expect(header).toContain("lg:hidden");
    expect(header).toContain("aria-expanded");
    expect(header).toContain("marketing-waitlist-fab");
  });
});
