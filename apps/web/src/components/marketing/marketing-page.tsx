import Link from "next/link";
import { BuildersPanel } from "./builders-panel";
import { HeroTerminal } from "./hero-terminal";
import { MarketingHeader } from "./marketing-header";
import { MarketingReveal } from "./marketing-reveal";
import { ProofStrip } from "./proof-strip";
import { WaitlistForm } from "./waitlist-form";

const WHY_CARE = [
  {
    title: "An agent that works for you",
    body: "Looks out for the household — not the company that wants you to forget you subscribed, keep shipping, and quietly raise prices.",
  },
  {
    title: "Keep the refill. Lose the trap.",
    body: "Cancel, skip, or pause on your terms. Your agent shops the shelf — it doesn't own the subscription.",
  },
  {
    title: "The price you were quoted — or a clear no",
    body: "No silent cart inflation between yes and charge. A locked landed quote, or a typed failure in the open.",
  },
] as const;

const ENFORCED = [
  {
    n: "01",
    title: "Mandate",
    body: "You set the ceiling, address, and never-substitute once. Nothing commits outside that fence.",
  },
  {
    n: "02",
    title: "Locked quote",
    body: "Short-lived landed price. Commit honors it or fails loudly — never a surprise total.",
  },
  {
    n: "03",
    title: "Right item",
    body: "Canonical replenishment — coffee, filters, pet, towels. No \"close enough\" substitution.",
  },
  {
    n: "04",
    title: "Receipt you keep",
    body: "Evidence stays with the household, even if you revoke the agent key later. Cutoff stands behind the order.",
  },
] as const;

export function MarketingPage() {
  return (
    <div className="marketing-shell relative min-h-screen">
      <div className="marketing-atmosphere pointer-events-none absolute inset-x-0 top-0 h-[640px]" />

      <MarketingHeader />

      <main id="top" className="relative">
        {/* Hero — brand-first CUTOFF + one headline + sub + CTAs + terminal */}
        <section className="mx-auto grid max-w-[1120px] gap-12 px-6 pb-24 pt-14 md:grid-cols-2 md:items-center md:gap-16 md:px-8 md:pb-28 md:pt-20">
          <div>
            <p
              className="marketing-brand-kinetic font-display text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink sm:text-[52px] md:text-[64px]"
              aria-label="CUTOFF"
            >
              CUTOFF
            </p>
            <h1 className="marketing-headline-kinetic mt-5 max-w-lg text-[22px] font-medium leading-snug tracking-[-0.02em] text-ink md:mt-6 md:text-[26px]">
              Your agent should work for you — not the shelf that wants you
              stuck.
            </h1>
            <p className="marketing-sub-kinetic mt-4 max-w-md text-[16px] leading-relaxed text-secondary">
              The buy path for household replenishment: coffee, filters, pet,
              towels — under a mandate you control. Skip when you don&apos;t
              need it. Keep the receipt.
            </p>
            <div className="marketing-cta-group mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#early-access"
                className="marketing-cta rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white hover:opacity-90"
              >
                Request early access
              </a>
              <a
                href="#why"
                className="text-[15px] font-medium text-accent underline-offset-4 hover:underline"
              >
                Why this is different
              </a>
            </div>
          </div>
          <div className="marketing-hero-panel">
            <HeroTerminal />
          </div>
        </section>

        {/* Why care — H2 / H1 / H3 */}
        <section id="why" className="border-t border-hairline bg-surface/40">
          <div className="mx-auto max-w-[1120px] px-6 py-20 md:px-8 md:py-24">
            <MarketingReveal>
              <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
                Why care
              </p>
              <h2 className="mt-3 max-w-xl font-display text-[32px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
                Why this is different
              </h2>
              <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-secondary">
                Subscribe &amp; Save and auto-ship clubs are built to keep
                shipping. Scraped storefronts are built to dodge bots. Cutoff is
                built so <em className="not-italic text-ink">your</em> rules
                bound the buy.
              </p>
            </MarketingReveal>
            <ul className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
              {WHY_CARE.map((beat, i) => (
                <MarketingReveal key={beat.title} as="li" delay={i + 1}>
                  <div className="border-t border-hairline pt-5">
                    <h3 className="text-[17px] font-medium text-ink">
                      {beat.title}
                    </h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-secondary">
                      {beat.body}
                    </p>
                  </div>
                </MarketingReveal>
              ))}
            </ul>
            <MarketingReveal className="mt-12" delay={4}>
              <p className="max-w-2xl text-[15px] leading-relaxed text-secondary">
                Spending ceiling, never-substitute, locked landed price — and an
                agent that can&apos;t quietly raise the cap. Rank is price and
                delivery, not placement. Cutoff stands behind the order.
              </p>
            </MarketingReveal>
          </div>
        </section>

        {/* Proof strip — Top 5 one-liners; not in the hero */}
        <ProofStrip />

        {/* How it's enforced — Direction C reframing Architecture */}
        <section id="enforced" className="border-t border-hairline">
          <div className="mx-auto max-w-[1120px] px-6 py-20 md:px-8 md:py-24">
            <MarketingReveal>
              <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
                How it works
              </p>
              <h2 className="mt-3 max-w-xl font-display text-[32px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
                Say buy once. Get what you meant.
              </h2>
              <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-secondary">
                No silent cart inflation. No &ldquo;we substituted.&rdquo; No
                ad-ranked shelf. Cutoff locks a landed quote, honors
                never-substitute, and leaves a receipt with the household.
              </p>
            </MarketingReveal>
            <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {ENFORCED.map((step, i) => (
                <MarketingReveal key={step.n} as="li" delay={i + 1}>
                  <div className="border-t border-hairline pt-5">
                    <p className="font-mono text-[12px] text-accent">{step.n}</p>
                    <h3 className="mt-2 text-[17px] font-medium text-ink">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-secondary">
                      {step.body}
                    </p>
                  </div>
                </MarketingReveal>
              ))}
            </ol>
          </div>
        </section>

        {/* For builders — proof under household thesis */}
        <section id="builders" className="border-t border-hairline bg-surface/40">
          <div className="mx-auto max-w-[1120px] px-6 py-20 md:px-8 md:py-24">
            <MarketingReveal>
              <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
                For builders
              </p>
              <h2 className="mt-3 max-w-xl font-display text-[32px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
                JSON your agent can trust
              </h2>
              <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-secondary">
                How household outcomes get enforced: Bearer keys, short-lived
                quotes, and an evidence pack on every commit — a shelf, not a
                scrape. One MCP endpoint for Claude, ChatGPT, Cursor, and Grok
                (xAI). Early access is sandbox-honest — not a live production
                claim.
              </p>
              <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-secondary">
                Amazon{" "}
                <em className="not-italic text-ink">alleges</em> Perplexity
                disguised an agentic browser as a human to reach storefronts and
                accounts. Cloudflare says merchants still can&apos;t tell a helpful
                agent from a malicious bot when UA and IP are spoofable. Cutoff
                skips that roulette: typed{" "}
                <span className="font-mono text-[13px] text-ink">/v1</span> quote
                → commit on a canonical shelf.
              </p>
            </MarketingReveal>
            <MarketingReveal className="mt-12" delay={1}>
              <BuildersPanel />
            </MarketingReveal>
          </div>
        </section>

        {/* Quiet brand strip */}
        <section className="border-t border-hairline bg-accent/[0.04]">
          <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-6 py-14 md:flex-row md:items-end md:justify-between md:px-8 md:py-16">
            <MarketingReveal className="max-w-xl">
              <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
                Brand / supply
              </p>
              <h2 className="mt-3 font-display text-[24px] font-semibold tracking-[-0.02em] text-ink md:text-[28px]">
                Supply interest, not a merchant portal
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-secondary">
                Brands and aggregators can raise a hand for later conversations.
                There is no Shopify connect CTA and no merchant login in the
                product — Cutoff stays merchant of record.
              </p>
            </MarketingReveal>
            <MarketingReveal delay={1}>
              <a
                href="#early-access"
                className="shrink-0 text-[15px] font-medium text-accent underline-offset-4 hover:underline"
              >
                Join as brand interest →
              </a>
            </MarketingReveal>
          </div>
        </section>

        {/* Waitlist */}
        <section id="early-access" className="border-t border-hairline">
          <div className="mx-auto max-w-[1120px] px-6 py-20 md:px-8 md:py-24">
            <MarketingReveal>
              <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
                Early access
              </p>
              <h2 className="mt-3 max-w-xl font-display text-[32px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
                Pilot waitlist
              </h2>
              <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-secondary">
                No published pricing yet. Tell us whether you&apos;re a household,
                building an agent, or exploring supply — we&apos;ll follow up when
                early access opens further.
              </p>
            </MarketingReveal>
            <MarketingReveal className="mt-12" delay={1}>
              <WaitlistForm />
            </MarketingReveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <p className="font-display text-[16px] font-semibold tracking-[-0.02em] text-ink">
              CUTOFF
            </p>
            <p className="mt-1 max-w-sm text-[13px] text-secondary">
              Your agent should work for you — not the shelf that wants you
              stuck.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-secondary">
            <Link href="/home" className="hover:text-ink">
              Household
            </Link>
            <Link href="/docs/why-agents-fail" className="hover:text-ink">
              Evidence
            </Link>
            <a href="#builders" className="hover:text-ink">
              For builders
            </a>
            <a href="#early-access" className="hover:text-ink">
              Early access
            </a>
            <a
              href="https://github.com/aleksanderdagr8/Cutoff"
              className="hover:text-ink"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
        <div className="mx-auto max-w-[1120px] px-6 pb-8 text-[12px] text-secondary md:px-8">
          Exact-fit parts and broader B2B may come later. Day-1 is
          replenishment consumables.
        </div>
      </footer>
    </div>
  );
}
