import Link from "next/link";
import type { OpsSession } from "@/lib/ops/session";
import { SignOutButton } from "./sign-out-button";

export type OpsNavActive =
  | "live"
  | "order"
  | "households"
  | "mandates"
  | "fulfillers"
  | "audit"
  | "sign-in";

const PRIMARY_NAV = [
  { href: "/ops/live", label: "Live", id: "live" as const },
  { href: "/ops/households", label: "Households", id: "households" as const },
  { href: "/ops/mandates", label: "Mandates", id: "mandates" as const },
  { href: "/ops/fulfillers", label: "Fulfillers", id: "fulfillers" as const },
] as const;

type Props = {
  session: OpsSession | null;
  active: OpsNavActive;
  children: React.ReactNode;
  bypass?: boolean;
};

function navActive(
  active: OpsNavActive,
  id: (typeof PRIMARY_NAV)[number]["id"],
) {
  if (active === "order" && id === "live") return true;
  return active === id;
}

export function OpsShell({ session, active, children, bypass }: Props) {
  return (
    <div className="ops-shell relative min-h-screen pb-24 md:pb-0">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 ops-atmosphere"
      />
      <div className="relative mx-auto flex min-h-screen max-w-[1120px] gap-12 px-6 py-8 md:px-8">
        <aside className="ops-enter hidden w-[220px] shrink-0 flex-col pt-1 md:flex">
          <Link href={session ? "/ops/live" : "/ops/sign-in"} className="block">
            <p className="font-display text-[26px] font-semibold tracking-[-0.04em] text-ink">
              CUTOFF
            </p>
          </Link>
          <p className="mt-1 text-[13px] text-secondary">Ops</p>

          {session ? (
            <nav
              className="mt-12 flex flex-1 flex-col gap-0.5"
              aria-label="Operator"
            >
              {PRIMARY_NAV.map((item) => {
                const isActive = navActive(active, item.id);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`ops-nav-link relative block rounded-control px-3 py-2.5 text-[15px] transition-[color,background-color] duration-160 ease-out ${
                      isActive
                        ? "ops-nav-active bg-accent/[0.09] font-medium text-accent"
                        : "text-secondary hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/ops/audit"
                className={`mt-6 block rounded-control px-3 py-2 text-[14px] transition-colors duration-160 ease-out ${
                  active === "audit"
                    ? "font-medium text-accent"
                    : "text-secondary hover:text-ink"
                }`}
              >
                Audit
              </Link>
            </nav>
          ) : (
            <div className="flex-1" />
          )}

          {session ? (
            <div className="mt-8 border-t border-hairline pt-5">
              <p className="truncate text-[14px] text-ink">
                {session.displayName}
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
              Dev bypass — TOTP later. Service role stays on the Worker.
            </p>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-8 flex items-center justify-between gap-4 md:hidden">
            <Link href={session ? "/ops/live" : "/ops/sign-in"}>
              <p className="font-display text-[22px] font-semibold tracking-[-0.04em] text-ink">
                CUTOFF
                <span className="ml-2 text-[13px] font-sans font-medium tracking-normal text-secondary">
                  Ops
                </span>
              </p>
            </Link>
            {session ? (
              <div className="flex items-center gap-4">
                <Link
                  href="/ops/audit"
                  className={`text-[13px] ${
                    active === "audit" ? "text-accent" : "text-secondary"
                  }`}
                >
                  Audit
                </Link>
                <SignOutButton />
              </div>
            ) : null}
          </header>

          <div className="ops-enter ops-enter-delay">{children}</div>
        </div>
      </div>

      {session ? (
        <nav
          className="ops-bottom-nav fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-bg/90 backdrop-blur-md md:hidden"
          aria-label="Operator"
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
