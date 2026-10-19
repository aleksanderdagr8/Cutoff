import Link from "next/link";
import type { OpsSession } from "@/lib/ops/session";
import { SignOutButton } from "./sign-out-button";

const NAV = [
  { href: "/ops/live", label: "Live flow", active: "live" },
  { href: "/ops/households", label: "Households", active: "households" },
  { href: "/ops/mandates", label: "Mandates", active: "mandates" },
  { href: "/ops/fulfillers", label: "Fulfillers", active: "fulfillers" },
  { href: "/ops/audit", label: "Audit", active: "audit" },
] as const;

export type OpsNavActive =
  | "live"
  | "order"
  | "households"
  | "mandates"
  | "fulfillers"
  | "audit"
  | "sign-in";

type Props = {
  session: OpsSession | null;
  active: OpsNavActive;
  children: React.ReactNode;
  bypass?: boolean;
};

export function OpsShell({ session, active, children, bypass }: Props) {
  return (
    <div className="ops-shell relative min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(90%_60%_at_10%_-10%,rgba(27,58,75,0.08),transparent_55%),radial-gradient(70%_50%_at_90%_0%,rgba(29,29,31,0.04),transparent_50%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1120px] gap-10 px-8 py-8">
        <aside className="ops-enter hidden w-[220px] shrink-0 pt-2 md:block">
          <Link href="/ops" className="block">
            <p className="text-[22px] font-semibold tracking-[-0.03em] text-ink">
              CUTOFF
            </p>
          </Link>
          <p className="mt-1 text-[13px] text-secondary">Operator</p>
          {session ? (
            <nav className="mt-10 space-y-1">
              {NAV.map((item) => {
                const isActive =
                  active === item.active ||
                  (item.active === "live" && active === "order");
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
            <p className="mt-8 text-[11px] leading-snug text-secondary">
              Dev bypass auth — TOTP parked. Service role stays on the Worker.
            </p>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-8 flex items-center justify-between gap-4 md:hidden">
            <Link href="/ops">
              <p className="text-[20px] font-semibold tracking-[-0.03em] text-ink">
                CUTOFF
              </p>
            </Link>
            {session ? (
              <nav className="flex flex-wrap justify-end gap-3 text-[13px]">
                <Link
                  href="/ops/live"
                  className={
                    active === "live" || active === "order"
                      ? "text-accent"
                      : "text-secondary"
                  }
                >
                  Live
                </Link>
                <Link
                  href="/ops/households"
                  className={
                    active === "households" ? "text-accent" : "text-secondary"
                  }
                >
                  Homes
                </Link>
                <Link
                  href="/ops/mandates"
                  className={
                    active === "mandates" ? "text-accent" : "text-secondary"
                  }
                >
                  Mandates
                </Link>
                <Link
                  href="/ops/fulfillers"
                  className={
                    active === "fulfillers" ? "text-accent" : "text-secondary"
                  }
                >
                  Fulfillers
                </Link>
                <Link
                  href="/ops/audit"
                  className={
                    active === "audit" ? "text-accent" : "text-secondary"
                  }
                >
                  Audit
                </Link>
              </nav>
            ) : null}
          </header>
          <div className="ops-enter ops-enter-delay">{children}</div>
        </div>
      </div>
    </div>
  );
}
