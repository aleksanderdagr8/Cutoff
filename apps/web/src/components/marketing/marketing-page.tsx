import Link from "next/link";
import { BuildersPanel } from "./builders-panel";
import { HeroTerminal } from "./hero-terminal";
import { WaitlistForm } from "./waitlist-form";

const STEPS = [
  {
    n: "01",
    title: "Quote",
    body: "Agent asks for a landed price on a canonical replenishment item.",
  },
  {
    n: "02",
    title: "Mandate",
    body: "Household ceiling, address, and never-substitute rules bound the buy.",
  },
  {
    n: "03",
    title: "Commit",
    body: "Idempotent capture against the quote — typed failure if anything drifted.",
  },
  {
    n: "04",
    title: "Receipt",
    body: "Evidence pack stays with the household, even if the key is revoked later.",
  },
] as const;

export function MarketingPage() {
  return (
    <div className="marketing-shell relative min-h-screen">
      <div className="marketing-atmosphere pointer-events-none absolute inset-x-0 top-0 h-[640px]" />

      <header className="sticky top-0 z-30 border-b border-hairline/80 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-6 py-3.5 md:px-8">
          <a
            href="#top"
            className="font-display text-[18px] font-semibold tracking-[-0.03em] text-ink"
          >
            CUTOFF
          </a>
          <nav className="hidden items-center gap-7 text-[14px] text-secondary md:flex">
            <a href="#architecture" className="hover:text-ink">
              Architecture
            </a>
            <a href="#builders" className="hover:text-ink">
              For builders
            </a>
            <a href="#early-access" className="hover:text-ink">
              Early access
            </a>
            <Link href="/home" className="hover:text-ink">
              Household
            </Link>
          </nav>
          <a
            href="#early-access"
            className="marketing-cta rounded-control bg-accent px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90 md:text-[14px]"
          >
            Join waitlist
          </a>
        </div>
      </header>

      <main id="top" className="relative">
        {/* Hero — one composition */}
        <section className="mx-auto grid max-w-[1120px] gap-12 px-6 pb-20 pt-14 md:grid-cols-2 md:items-center md:gap-16 md:px-8 md:pb-28 md:pt-20">
          <div className="marketing-enter">
            <p className="font-display text-[48px] font-semibold leading-[0.95] tracking-[-0.045em] text-ink md:text-[64px]">
              CUTOFF
            </p>
            <h1 className="mt-5 max-w-md text-[22px] font-medium leading-snug tracking-[-0.02em] text-ink md:text-[26px]">
              The shelf agents call when a person says buy.
            </h1>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-secondary">
              Deterministic quotes and commits for replenishment — coffee,
              filters, towels — not a scraped storefront.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#early-access"
                className="marketing-cta rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white hover:opacity-90"
              >
                Request early access
              </a>
              <a
                href="#architecture"
                className="text-[15px] font-medium text-accent underline-offset-4 hover:underline"
              >
                How it works
              </a>
            </div>
          </div>
          <HeroTerminal />
        </section>

        {/* How it works */}
        <section
          id="architecture"
          className="border-t border-hairline bg-surface/40"
        >
          <div className="mx-auto max-w-[1120px] px-6 py-20 md:px-8 md:py-24">
            <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
              Architecture
            </p>
            <h2 className="mt-3 max-w-xl font-display text-[32px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
              Quote → mandate → commit → receipt
            </h2>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-secondary">
              One path. Cutoff is merchant of record; agents never hold a card,
              and households keep the evidence.
            </p>
            <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {STEPS.map((step) => (
                <li key={step.n} className="border-t border-hairline pt-5">
                  <p className="font-mono text-[12px] text-accent">{step.n}</p>
                  <h3 className="mt-2 text-[17px] font-medium text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-secondary">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* For builders */}
        <section id="builders" className="border-t border-hairline">
          <div className="mx-auto max-w-[1120px] px-6 py-20 md:px-8 md:py-24">
            <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
              For builders
            </p>
            <h2 className="mt-3 max-w-xl font-display text-[32px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
              JSON your agent can trust
            </h2>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-secondary">
              Bearer keys, short-lived quotes, and an evidence pack on every
              commit. Early access is sandbox-honest — not a live production
              claim.
            </p>
            <div className="mt-12">
              <BuildersPanel />
            </div>
          </div>
        </section>

        {/* Quiet brand strip */}
        <section className="border-t border-hairline bg-accent/[0.04]">
          <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-6 py-14 md:flex-row md:items-end md:justify-between md:px-8 md:py-16">
            <div className="max-w-xl">
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
            </div>
            <a
              href="#early-access"
              className="shrink-0 text-[15px] font-medium text-accent underline-offset-4 hover:underline"
            >
              Join as brand interest →
            </a>
          </div>
        </section>

        {/* Waitlist */}
        <section
          id="early-access"
          className="border-t border-hairline"
        >
          <div className="mx-auto max-w-[1120px] px-6 py-20 md:px-8 md:py-24">
            <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
              Early access
            </p>
            <h2 className="mt-3 max-w-xl font-display text-[32px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
              Pilot waitlist
            </h2>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-secondary">
              No published pricing yet. Tell us whether you&apos;re building an
              agent or exploring supply — we&apos;ll follow up when the sandbox
              opens to more builders.
            </p>
            <div className="mt-12">
              <WaitlistForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <p className="font-display text-[16px] font-semibold tracking-[-0.02em] text-ink">
              CUTOFF
            </p>
            <p className="mt-1 text-[13px] text-secondary">
              The shelf agents call when a person says buy.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-secondary">
            <Link href="/home" className="hover:text-ink">
              Household
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
