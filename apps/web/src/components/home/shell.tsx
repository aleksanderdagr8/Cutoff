import Link from "next/link";
import type { HomeSession } from "@/lib/home/session";
import { SignOutButton } from "./sign-out-button";

export type HomeNavActive =
  | "today"
  | "list"
  | "orders"
  | "mandate"
  | "keys"
  | "help"
  | "receipt"
  | "sign-in";

const PRIMARY_NAV = [
  { href: "/home", label: "Today", id: "today" as const },
  { href: "/home/list", label: "List", id: "list" as const },
  { href: "/home/orders", label: "Orders", id: "orders" as const },
  { href: "/home/mandate", label: "Mandate", id: "mandate" as const },
  { href: "/home/keys", label: "Keys", id: "keys" as const },
] as const;

type Props = {
  session: HomeSession | null;
  active: HomeNavActive;
  children: React.ReactNode;
  bypass?: boolean;
};

function navActive(active: HomeNavActive, id: (typeof PRIMARY_NAV)[number]["id"]) {
  if (active === "receipt" && id === "orders") return true;
  return active === id;
}

export function HomeShell({ session, active, children, bypass }: Props) {
  return (
    <div className="home-shell relative min-h-screen pb-24 md:pb-0">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 home-atmosphere"
      />
      <div className="relative mx-auto flex min-h-screen max-w-[1120px] gap-12 px-6 py-8 md:px-8">
        <aside className="home-enter hidden w-[220px] shrink-0 flex-col pt-1 md:flex">
          <Link href={session ? "/home" : "/home/sign-in"} className="block">
            <p className="font-display text-[26px] font-semibold tracking-[-0.04em] text-ink">
              CUTOFF
            </p>
          </Link>
          <p className="mt-1 text-[13px] text-secondary">Household</p>

          {session ? (
            <nav className="mt-12 flex flex-1 flex-col gap-0.5" aria-label="Household">
              {PRIMARY_NAV.map((item) => {
                const isActive = navActive(active, item.id);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`home-nav-link relative block rounded-control px-3 py-2.5 text-[15px] transition-[color,background-color] duration-160 ease-out ${
                      isActive
                        ? "home-nav-active bg-accent/[0.09] font-medium text-accent"
                        : "text-secondary hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/home/help"
                className={`mt-6 block rounded-control px-3 py-2 text-[14px] transition-colors duration-160 ease-out ${
                  active === "help"
                    ? "font-medium text-accent"
                    : "text-secondary hover:text-ink"
                }`}
              >
                Help
              </Link>
            </nav>
          ) : (
            <div className="flex-1" />
          )}

          {session ? (
            <div className="mt-8 border-t border-hairline pt-5">
              <p className="truncate text-[14px] text-ink">
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
            <p className="mt-6 text-[11px] leading-snug text-secondary">
              Dev bypass — agent keys never stored in the browser.
            </p>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-8 flex items-center justify-between gap-4 md:hidden">
            <Link href={session ? "/home" : "/home/sign-in"}>
              <p className="font-display text-[22px] font-semibold tracking-[-0.04em] text-ink">
                CUTOFF
              </p>
            </Link>
            {session ? (
              <div className="flex items-center gap-4">
                <Link
                  href="/home/help"
                  className={`text-[13px] ${
                    active === "help" ? "text-accent" : "text-secondary"
                  }`}
                >
                  Help
                </Link>
                <SignOutButton />
              </div>
            ) : null}
          </header>

          <div className="home-enter home-enter-delay">{children}</div>
        </div>
      </div>

      {session ? (
        <nav
          className="home-bottom-nav fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-bg/90 backdrop-blur-md md:hidden"
          aria-label="Household"
        >
          <ul className="mx-auto flex max-w-[1120px] items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
            {PRIMARY_NAV.map((item) => {
              const isActive = navActive(active, item.id);
              return (
                <li key={item.href} className="flex-1">
                  <Link
                    href={item.href}
                    className={`flex flex-col items-center gap-0.5 px-1 py-3 text-[11px] tracking-wide transition-colors duration-160 ease-out ${
                      isActive
                        ? "font-medium text-accent"
                        : "text-secondary"
                    }`}
                  >
                    <span
                      className={`mb-0.5 h-1 w-1 rounded-full transition-transform duration-160 ease-out ${
                        isActive
                          ? "scale-100 bg-accent"
                          : "scale-0 bg-transparent"
                      }`}
                      aria-hidden
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
