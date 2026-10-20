import Link from "next/link";

const LINKS = [
  { href: "/blog", label: "Blog" },
  { href: "/docs/why-agents-fail", label: "Evidence" },
  { href: "/#early-access", label: "Early access" },
  { href: "/home", label: "Household" },
] as const;

export function BlogHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#1B3A4B]/10 bg-[#F4F4F6]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-3.5 sm:px-6 md:px-8">
        <Link
          href="/"
          className="text-[22px] font-semibold tracking-[-0.04em] text-[#1B3A4B]"
        >
          CUTOFF
        </Link>
        <nav
          className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-[14px] text-[#1B3A4B]/70"
          aria-label="Primary"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                link.href === "/blog"
                  ? "font-medium text-[#1B3A4B] underline decoration-[#E8743B] decoration-2 underline-offset-[6px]"
                  : "hover:text-[#1B3A4B]"
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
    <footer className="mt-auto border-t border-[#1B3A4B]/10">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-10 sm:px-6 md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <p className="text-[16px] font-semibold tracking-[-0.02em] text-[#1B3A4B]">
            CUTOFF
          </p>
          <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[#1B3A4B]/70">
            Your agent should work for you — not the shelf that wants you
            stuck.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-[#1B3A4B]/70">
          <Link href="/blog" className="hover:text-[#1B3A4B]">
            Blog
          </Link>
          <Link href="/home" className="hover:text-[#1B3A4B]">
            Household
          </Link>
          <Link href="/docs/why-agents-fail" className="hover:text-[#1B3A4B]">
            Evidence
          </Link>
          <Link href="/#early-access" className="hover:text-[#1B3A4B]">
            Early access
          </Link>
          <a
            href="https://github.com/aleksanderdagr8/Cutoff"
            className="hover:text-[#1B3A4B]"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a href="/blog/rss.xml" className="hover:text-[#1B3A4B]">
            RSS
          </a>
        </div>
      </div>
    </footer>
  );
}
