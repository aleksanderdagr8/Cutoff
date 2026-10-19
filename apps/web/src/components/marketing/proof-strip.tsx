"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

/** Top 5 one-liners from the problem-evidence pack — approved for the landing strip. */
export const PROOF_LINES = [
  {
    id: "operator",
    text: "Operator grocery: 13 of 16 items, 30+ min + rescues — person under 4.",
  },
  {
    id: "tau",
    text: "τ-bench retail: ~61% once → under 25% eight times in a row.",
  },
  {
    id: "verge",
    text: "Verge Etsy: agent claimed ~$825 in cart — cart was empty.",
  },
  {
    id: "amazon",
    text: "Amazon v. Perplexity: sued over a disguised human-like shopping agent.",
  },
  {
    id: "ftc",
    text: "FTC Amazon Prime: $2.5B settlement — dark patterns for ~35M people.",
  },
] as const;

export function ProofStrip() {
  const labelId = useId();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <section
      id="proof"
      className="border-t border-hairline"
      aria-labelledby={labelId}
    >
      <div className="mx-auto max-w-[1120px] px-6 py-14 md:px-8 md:py-16">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p
            id={labelId}
            className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary"
          >
            What agents hit today
          </p>
          <Link
            href="/docs/why-agents-fail"
            className="text-[14px] font-medium text-accent underline-offset-4 hover:underline"
          >
            Read the evidence →
          </Link>
        </div>

        {reduceMotion ? (
          <ul className="mt-8 space-y-4">
            {PROOF_LINES.map((line) => (
              <li
                key={line.id}
                className="border-t border-hairline pt-4 text-[15px] leading-snug text-ink md:text-[16px]"
              >
                {line.text}
              </li>
            ))}
          </ul>
        ) : (
          <div
            className="proof-marquee mt-8"
            tabIndex={0}
            role="region"
            aria-label="Evidence one-liners, scrolls horizontally; pauses on hover or focus"
          >
            <div className="proof-marquee-track">
              {[0, 1].map((copy) => (
                <ul
                  key={copy}
                  className="proof-marquee-group"
                  aria-hidden={copy === 1 ? true : undefined}
                >
                  {PROOF_LINES.map((line) => (
                    <li key={`${copy}-${line.id}`} className="proof-marquee-item">
                      <span className="text-[15px] leading-snug text-ink md:text-[16px]">
                        {line.text}
                      </span>
                      <span
                        className="mx-6 text-hairline select-none md:mx-8"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
