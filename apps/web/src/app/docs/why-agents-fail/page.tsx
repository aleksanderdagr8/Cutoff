import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Why agents fail at buying — Cutoff",
  description:
    "Primary citations on scrape/storefront agents, unreliable checkout, missing accountability, and subscription traps — why Cutoff is a shelf, not a scrape.",
};

type Cite = {
  title: string;
  body: string;
  links: { label: string; href: string }[];
  note?: string;
};

const SECTIONS: {
  id: string;
  heading: string;
  intro: string;
  items: Cite[];
}[] = [
  {
    id: "scrape",
    heading: "Scraping / anti-bot",
    intro:
      "Storefront agents get blocked, disguised, or lost — merchants still can’t reliably tell a helpful agent from a malicious bot.",
    items: [
      {
        title: "Amazon v. Perplexity",
        body: "Amazon alleges Perplexity disguised an agentic browser as a human to evade barriers and access private customer accounts (N.D. Cal., complaint filed Nov 4, 2025).",
        links: [
          {
            label: "Complaint (CourtListener PDF)",
            href: "https://storage.courtlistener.com/recap/gov.uscourts.cand.459191/gov.uscourts.cand.459191.1.0.pdf",
          },
          {
            label: "Docket",
            href: "https://www.courtlistener.com/docket/71874820/amazoncom-services-llc-v-perplexity-ai-inc/",
          },
          {
            label: "Bloomberg",
            href: "https://www.bloomberg.com/news/articles/2025-11-04/amazon-demands-perplexity-stop-ai-agent-from-making-purchases",
          },
        ],
      },
      {
        title: "Injunction, then Ninth Circuit vacatur",
        body: "District court issued a preliminary injunction; the Ninth Circuit vacated it on Aug 4, 2026 — among the first appeals rulings on AI agents accessing platforms. Legal status remains unsettled.",
        links: [
          {
            label: "Ninth Circuit opinion (PDF)",
            href: "https://cdn.ca9.uscourts.gov/datastore/opinions/2026/08/04/26-1444.pdf",
          },
          {
            label: "Reuters",
            href: "https://www.reuters.com/business/retail-consumer/amazon-loses-us-court-ban-on-perplexitys-ai-shopping-tools-2026-08-04/",
          },
        ],
      },
      {
        title: "Cloudflare — securing agentic commerce",
        body: "Merchants can’t tell helpful agents from malicious bots; user-agent and IP are spoofable. Visa Trusted Agent Protocol / Mastercard Agent Pay sit on Web Bot Auth.",
        links: [
          {
            label: "Cloudflare Blog (Oct 24, 2025)",
            href: "https://blog.cloudflare.com/secure-agentic-commerce/",
          },
        ],
      },
      {
        title: "Safety layer blocked checkout (anecdote)",
        body: "Understanding AI: ChatGPT Agent’s browsing environment blocked a Kroger login after ~6 minutes during a grocery run.",
        note: "Practitioner report — dated ~Jul 2025; treat as illustration, not a survey.",
        links: [
          {
            label: "Understanding AI",
            href: "https://www.understandingai.org/p/chatgpt-agent-a-big-improvement-but",
          },
        ],
      },
    ],
  },
  {
    id: "wrong-item",
    heading: "Wrong item / missing items / made-up actions",
    intro:
      "End-to-end web agents still miss SKUs, invent cart state, and need rescues — even on “simple” household lists.",
    items: [
      {
        title: "WebArena (historical baseline)",
        body: "Best GPT-4 agent ~14.41% end-to-end success vs human ~78.24% (includes e-commerce tasks). Present as a historical baseline only — not a claim about today’s frontier models.",
        links: [
          {
            label: "arXiv 2307.13854",
            href: "https://arxiv.org/abs/2307.13854",
          },
        ],
      },
      {
        title: "Operator grocery",
        body: "Understanding AI: “Bananas (5)”→15; skipped Cheerios; 13 of 16 items in cart; 30+ minutes plus interventions vs a person under 4 minutes.",
        note: "~Jun 2025 practitioner report.",
        links: [
          {
            label: "Understanding AI",
            href: "https://www.understandingai.org/p/computer-use-agents-seem-like-a-dead",
          },
        ],
      },
      {
        title: "Verge Etsy lamps",
        body: "Agent claimed ~$825 of lamps in cart after ~50 minutes; reviewer’s cart was empty. Also collapsed “vintage-style” into “vintage.”",
        note: "~Jul 2025 Verge review.",
        links: [
          {
            label: "The Verge",
            href: "https://www.theverge.com/ai-artificial-intelligence/710020/openai-review-test-new-release-chatgpt-agent-operator-deep-research-pro-200-subscription",
          },
        ],
      },
    ],
  },
  {
    id: "reliability",
    heading: "Price / totals / unreliable repeat behavior",
    intro:
      "One lucky pass is not a buy path. Reorder reliability is where scrape loops fall apart.",
    items: [
      {
        title: "τ-bench / Sierra",
        body: "Retail agents often clear a single trial around ~50–61% (pass¹); pass⁸ under 25% — a steep drop when the same task must succeed eight times in a row. Best public “reorder reliability” baseline.",
        links: [
          {
            label: "arXiv 2406.12045",
            href: "https://arxiv.org/abs/2406.12045",
          },
          {
            label: "sierra-research/tau-bench",
            href: "https://github.com/sierra-research/tau-bench",
          },
        ],
      },
      {
        title: "Wrong charged total",
        body: "No well-sourced “agent charged the wrong total” primary cite in this pack. Don’t invent one.",
        links: [],
      },
    ],
  },
  {
    id: "accountability",
    heading: "No accountability",
    intro:
      "When the agent reports actions it didn’t take, or the merchant can’t see who authorized the buy, households lose the paper trail.",
    items: [
      {
        title: "Phantom commits",
        body: "The Verge Etsy run: the agent reported cart adds that weren’t in the reviewer’s cart.",
        links: [
          {
            label: "The Verge",
            href: "https://www.theverge.com/ai-artificial-intelligence/710020/openai-review-test-new-release-chatgpt-agent-operator-deep-research-pro-200-subscription",
          },
        ],
      },
      {
        title: "Merchant questions Cloudflare names",
        body: "Is the agent a known customer? Do consumer instructions travel with the order?",
        links: [
          {
            label: "Cloudflare Blog",
            href: "https://blog.cloudflare.com/secure-agentic-commerce/",
          },
        ],
      },
    ],
  },
  {
    id: "subscriptions",
    heading: "Subscription traps",
    intro:
      "Auto-ship isn’t a free pass. Dark patterns and quiet price raises are why “keep the refill, lose the trap” matters.",
    items: [
      {
        title: "FTC Amazon Prime",
        body: "$1B civil penalty + $1.5B consumer redress (~$2.5B), ~35M consumers — deceptive enrollment and hard-to-cancel flows (order Sep 25, 2025). Follow-up Sep 2026: more than $845M paid; refund cap raised.",
        links: [
          {
            label: "FTC press release (Sep 25, 2025)",
            href: "https://www.ftc.gov/news-events/news/press-releases/2025/09/ftc-secures-historic-25-billion-settlement-against-amazon",
          },
          {
            label: "FTC additional payments (Sep 2026)",
            href: "https://www.ftc.gov/news-events/news/press-releases/2026/09/ftc-announces-additional-payments-consumers-stemming-ftcs-amazon-prime-settlement",
          },
        ],
      },
      {
        title: "Subscribe & Save price-hike suit",
        body: "Reporting describes a lawsuit that alleges Subscribe & Save price hikes (OregonLive, May 2026). Allegations only — not a finding of liability.",
        note: "Treat as allegations; verify the filing before quoting specifics.",
        links: [],
      },
      {
        title: "Click-to-cancel vacated",
        body: "Eighth Circuit vacated the FTC’s click-to-cancel (negative option) rule on Jul 8, 2025. Households can’t rely on regulators alone for cancel control.",
        links: [
          {
            label: "8th Circuit opinion (PDF)",
            href: "https://ecf.ca8.uscourts.gov/opndir/25/07/243137P.pdf",
          },
          {
            label: "Reuters",
            href: "https://www.reuters.com/legal/legalindustry/us-click-cancel-rule-blocked-by-appeals-court-2025-07-08/",
          },
        ],
      },
    ],
  },
];

export default function WhyAgentsFailPage() {
  return (
    <div className="marketing-shell relative min-h-screen">
      <div className="marketing-atmosphere pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

      <header className="sticky top-0 z-30 border-b border-hairline/80 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[720px] items-center justify-between gap-4 px-6 py-3.5 md:px-8">
          <Link
            href="/"
            className="font-display text-[18px] font-semibold tracking-[-0.03em] text-ink"
          >
            CUTOFF
          </Link>
          <nav className="flex items-center gap-5 text-[14px] text-secondary">
            <Link href="/#proof" className="hover:text-ink">
              Proof
            </Link>
            <Link href="/#early-access" className="hover:text-ink">
              Early access
            </Link>
            <Link href="/blog" className="hover:text-ink">
              Blog
            </Link>
            <Link href="/home" className="hover:text-ink">
              Household
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-[720px] px-6 py-14 md:px-8 md:py-20">
        <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
          Evidence
        </p>
        <h1 className="mt-3 font-display text-[32px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
          Why agents fail at buying
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-secondary">
          Citations behind the marketing proof strip — why scrape-the-storefront
          agents break, and why Subscribe &amp; Save isn&apos;t the safe
          alternative. Prefer court, FTC, Cloudflare, and academic primaries.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-secondary">
          This page is{" "}
          <em className="not-italic text-ink">proof for the problem</em>, not a
          change to the Direction A thesis on{" "}
          <Link href="/" className="text-accent underline-offset-2 hover:underline">
            callcutoff.com
          </Link>
          .
        </p>

        <nav
          className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-6 text-[14px] text-secondary"
          aria-label="Sections"
        >
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="hover:text-ink">
              {s.heading}
            </a>
          ))}
        </nav>

        {SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="mt-16 scroll-mt-24 border-t border-hairline pt-10"
          >
            <h2 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-ink md:text-[28px]">
              {section.heading}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-secondary">
              {section.intro}
            </p>
            <ul className="mt-8 space-y-8">
              {section.items.map((item) => (
                <li key={item.title}>
                  <h3 className="text-[17px] font-medium text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-secondary">
                    {item.body}
                  </p>
                  {item.note ? (
                    <p className="mt-2 text-[13px] leading-relaxed text-secondary">
                      Note: {item.note}
                    </p>
                  ) : null}
                  {item.links.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
                      {item.links.map((link) => (
                        <li key={link.href}>
                          <a
                            href={link.href}
                            className="text-accent underline-offset-4 hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {link.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="mt-16 border-t border-hairline pt-10">
          <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
            What Cutoff does instead
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-secondary">
            A canonical JSON shelf, a mandate you set, an immutable landed
            quote, and a receipt the household keeps — not a browser that
            pretends to be you on someone else&apos;s storefront.
          </p>
          <p className="mt-6">
            <Link
              href="/#early-access"
              className="text-[15px] font-medium text-accent underline-offset-4 hover:underline"
            >
              Request early access →
            </Link>
          </p>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-6 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <p className="font-display text-[16px] font-semibold tracking-[-0.02em] text-ink">
            CUTOFF
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/blog" className="text-[14px] text-secondary hover:text-ink">
              Blog
            </Link>
            <Link href="/" className="text-[14px] text-secondary hover:text-ink">
              ← Back to home
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
