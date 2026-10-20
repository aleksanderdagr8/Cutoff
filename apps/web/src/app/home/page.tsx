import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeEmptyHeadline } from "@/components/home/home-empty-headline";
import { HomeSectionTitle } from "@/components/home/home-section-title";
import { HomeShell } from "@/components/home/shell";
import { homeDevBypassEnabled } from "@/lib/home/config";
import { formatCents } from "@/lib/home/format";
import { readHomeSession } from "@/lib/home/session";
import {
  getMandateForSession,
  listKeysForSession,
  listLinesForSession,
} from "@/lib/home/store";

export default async function TodayPage() {
  const session = await readHomeSession();
  if (!session) redirect("/home/sign-in");

  const [lines, mandate, keys] = await Promise.all([
    listLinesForSession(session),
    getMandateForSession(session),
    listKeysForSession(session),
  ]);

  const active = lines.filter((l) => !l.paused);
  const paused = lines.filter((l) => l.paused);
  const ordered = lines.filter((l) => l.last_order_id);
  const activeKeys = keys.filter((k) => !k.revoked);

  const needsMandate = !mandate;
  const needsKey = Boolean(mandate) && activeKeys.length === 0;
  const primaryHref = needsMandate
    ? "/home/mandate"
    : needsKey
      ? "/home/keys"
      : "/home/list";
  const primaryLabel = needsMandate
    ? "Set a mandate"
    : needsKey
      ? "Issue an agent key"
      : "Open list";

  return (
    <HomeShell
      session={session}
      active="today"
      bypass={homeDevBypassEnabled()}
    >
      <div className="home-section">
        <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
          {session.householdName}
        </p>
        <p className="mt-1 text-[14px] text-secondary">{session.email}</p>
        <p className="mt-4 max-w-md text-[17px] leading-relaxed text-secondary">
          Your replenishment shelf. Agents buy within the mandate — you skip,
          pause, or check a receipt when you need to.
        </p>

        <div className="mt-10">
          <Link
            href={primaryHref}
            className="home-cta inline-flex rounded-control bg-accent px-6 py-3 text-[15px] font-medium"
          >
            {primaryLabel}
          </Link>
        </div>
      </div>

      <section className="home-section home-section-delay mt-14 border-t border-hairline pt-8">
        <HomeSectionTitle size="today">Today</HomeSectionTitle>
        <p className="mt-2 max-w-lg text-[15px] text-secondary">
          Status of your list — not a live ops board.
        </p>

        {lines.length === 0 ? (
          <div className="mt-8">
            <HomeEmptyHeadline>Nothing on the shelf</HomeEmptyHeadline>
            <p className="mt-3 text-[15px] text-secondary">
              No replenishment lines yet.{" "}
              <Link
                href="/home/mandate"
                className="text-accent underline-offset-2 hover:underline"
              >
                Set a mandate
              </Link>{" "}
              so an agent can start the list.
            </p>
          </div>
        ) : (
          <ul className="mt-8 space-y-0">
            {active.slice(0, 4).map((line, i) => (
              <li
                key={line.line_id}
                className="home-row flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline py-4"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div>
                  <p className="text-[17px] text-ink">
                    {line.brand} · {line.description}
                  </p>
                  <p className="mt-1 text-[13px] text-secondary">
                    {line.last_order_id
                      ? "Ordered"
                      : line.cadence_hint_days
                        ? `About every ${line.cadence_hint_days} days`
                        : "On the list"}
                    {line.last_price_cents != null
                      ? ` · last ${formatCents(line.last_price_cents)}`
                      : ""}
                  </p>
                </div>
                {line.receipt_token ? (
                  <Link
                    href={`/home/receipts/${line.receipt_token}`}
                    className="text-[14px] text-secondary underline-offset-2 hover:text-ink hover:underline"
                  >
                    Receipt
                  </Link>
                ) : null}
              </li>
            ))}
            {paused.length > 0 ? (
              <li className="home-row border-b border-hairline py-4 text-[15px] text-secondary">
                {paused.length} paused — resume from{" "}
                <Link
                  href="/home/list"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  List
                </Link>
              </li>
            ) : null}
            {ordered.length > 0 && active.length === 0 ? (
              <li className="py-4 text-[15px] text-secondary">
                Recent orders are on{" "}
                <Link
                  href="/home/orders"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Orders
                </Link>
                .
              </li>
            ) : null}
          </ul>
        )}
      </section>
    </HomeShell>
  );
}
