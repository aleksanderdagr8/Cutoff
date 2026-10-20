import Link from "next/link";

const LINKS = [
  { href: "/blog", label: "Blog" },
  { href: "/docs/why-agents-fail", label: "Evidence" },
  { href: "/#early-access", label: "Early access" },
  { href: "/home", label: "Household" },
] as const;

export function BlogHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline/80 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[720px] items-center justify-between gap-4 px-6 py-3.5 md:px-8">
        <Link
          href="/"
          className="font-display text-[18px] font-semibold tracking-[-0.03em] text-ink"
        >
          CUTOFF
        </Link>
        <nav
          className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-[14px] text-secondary"
          aria-label="Primary"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                link.href === "/blog" ? "text-ink" : "hover:text-ink"
              }
              aria-current={link.href === "/blog" ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function BlogFooter() {
  return (
    <footer className="mt-auto border-t border-hairline">
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-6 py-10 md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <p className="font-display text-[16px] font-semibold tracking-[-0.02em] text-ink">
            CUTOFF
          </p>
          <p className="mt-1 max-w-sm text-[13px] text-secondary">
            Your agent should work for you — not the shelf that wants you
            stuck.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-secondary">
          <Link href="/blog" className="hover:text-ink">
            Blog
          </Link>
          <Link href="/home" className="hover:text-ink">
            Household
          </Link>
          <Link href="/docs/why-agents-fail" className="hover:text-ink">
            Evidence
          </Link>
          <Link href="/#early-access" className="hover:text-ink">
            Early access
          </Link>
          <a
            href="https://github.com/aleksanderdagr8/Cutoff"
            className="hover:text-ink"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a href="/blog/rss.xml" className="hover:text-ink">
            RSS
          </a>
        </div>
      </div>
    </footer>
  );
}
