import Link from "next/link";
import type { HomeSession } from "@/lib/home/session";
import { SignOutButton } from "./sign-out-button";

const NAV = [
  { href: "/home/list", label: "List" },
  { href: "/home/mandate", label: "Mandate & keys" },
] as const;

type Props = {
  session: HomeSession | null;
  active: "list" | "mandate" | "receipt" | "sign-in";
  children: React.ReactNode;
  bypass?: boolean;
};

export function HomeShell({ session, active, children, bypass }: Props) {
  return (
    <div className="home-shell relative min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(90%_60%_at_10%_-10%,rgba(27,58,75,0.08),transparent_55%),radial-gradient(70%_50%_at_90%_0%,rgba(29,29,31,0.04),transparent_50%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1120px] gap-10 px-8 py-8">
        <aside className="home-enter hidden w-[200px] shrink-0 pt-2 md:block">
          <Link href="/home" className="block">
            <p className="text-[22px] font-semibold tracking-[-0.03em] text-ink">
              CUTOFF
            </p>
          </Link>
          <p className="mt-1 text-[13px] text-secondary">Household</p>
          {session ? (
            <nav className="mt-10 space-y-1">
              {NAV.map((item) => {
                const isActive =
                  (item.href === "/home/list" && active === "list") ||
                  (item.href === "/home/mandate" && active === "mandate");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-control px-3 py-2 text-[15px] transition-colors duration-[160ms] ease-out ${
                      isActive
                        ? "bg-accent/10 font-medium text-accent"
                        : "text-secondary hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
          {session ? (
            <div className="mt-12 border-t border-hairline pt-4">
              <p className="truncate text-[13px] text-ink">
                {session.householdName}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-secondary">
                {session.email}
              </p>
              <div className="mt-3">
                <SignOutButton />
              </div>
            </div>
          ) : null}
          {bypass ? (
            <p className="mt-8 text-[11px] leading-snug text-secondary">
              Dev bypass auth — agent keys never stored in the browser.
            </p>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-8 flex items-center justify-between md:hidden">
            <Link href="/home">
              <p className="text-[20px] font-semibold tracking-[-0.03em] text-ink">
                CUTOFF
              </p>
            </Link>
            {session ? (
              <nav className="flex gap-4 text-[14px]">
                <Link
                  href="/home/list"
                  className={
                    active === "list" ? "text-accent" : "text-secondary"
                  }
                >
                  List
                </Link>
                <Link
                  href="/home/mandate"
                  className={
                    active === "mandate" ? "text-accent" : "text-secondary"
                  }
                >
                  Mandate
                </Link>
              </nav>
            ) : null}
          </header>
          <div className="home-enter home-enter-delay">{children}</div>
        </div>
      </div>
    </div>
  );
}
