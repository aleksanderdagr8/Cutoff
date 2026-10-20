"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

const NAV_LINKS = [
  { href: "#why", label: "Why care" },
  { href: "#enforced", label: "How it works" },
  { href: "#proof", label: "Proof" },
  { href: "#builders", label: "For builders" },
  { href: "#early-access", label: "Early access" },
  { href: "/blog", label: "Blog" },
  { href: "/home", label: "Household" },
] as const;

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-hairline/80 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-5 py-3.5 sm:px-6 md:px-8">
          <a
            href="#top"
            className="font-display text-[26px] font-semibold tracking-[-0.04em] text-ink md:text-[28px]"
            onClick={() => setOpen(false)}
          >
            CUTOFF
          </a>

          <nav
            className="hidden items-center gap-6 text-[14px] text-secondary lg:flex xl:gap-7"
            aria-label="Primary"
          >
            {NAV_LINKS.map((link) =>
              link.href.startsWith("/") ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:text-ink"
                >
                  {link.label}
                </Link>
              ) : (
                <a key={link.href} href={link.href} className="hover:text-ink">
                  {link.label}
                </a>
              ),
            )}
          </nav>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-control text-ink hover:bg-accent/[0.06] lg:hidden"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">{open ? "Close" : "Menu"}</span>
            <span aria-hidden className="relative block h-3.5 w-[18px]">
              <span
                className={`absolute left-0 top-0 block h-[1.5px] w-full origin-center bg-ink transition-transform duration-200 ease-out ${
                  open ? "translate-y-[6.5px] rotate-45" : ""
                }`}
              />
              <span
                className={`absolute left-0 top-[6.5px] block h-[1.5px] w-full bg-ink transition-opacity duration-150 ${
                  open ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute left-0 top-[13px] block h-[1.5px] w-full origin-center bg-ink transition-transform duration-200 ease-out ${
                  open ? "-translate-y-[6.5px] -rotate-45" : ""
                }`}
              />
            </span>
          </button>
        </div>

        {open ? (
          <div
            id={panelId}
            className="border-t border-hairline bg-bg/95 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
          >
            <nav
              className="mx-auto flex max-w-[1120px] flex-col px-5 py-3 sm:px-6"
              aria-label="Mobile"
            >
              {NAV_LINKS.map((link) =>
                link.href.startsWith("/") ? (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="border-b border-hairline/70 py-3.5 text-[16px] font-medium text-ink last:border-b-0"
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.href}
                    href={link.href}
                    className="border-b border-hairline/70 py-3.5 text-[16px] font-medium text-ink last:border-b-0"
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </a>
                ),
              )}
            </nav>
          </div>
        ) : null}
      </header>

      {/* Floating waitlist CTA — bottom-right FAB, safe-area aware; not a locked bar */}
      <a
        href="#early-access"
        className="marketing-waitlist-fab marketing-cta fixed z-50 rounded-control bg-accent px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:opacity-90"
      >
        Join waitlist
      </a>
    </>
  );
}
