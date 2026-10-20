import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeEmptyHeadline } from "@/components/home/home-empty-headline";
import { HomeSectionTitle } from "@/components/home/home-section-title";
import { HomeShell } from "@/components/home/shell";
import { homeDevBypassEnabled } from "@/lib/home/config";
import { formatCents } from "@/lib/home/format";
import { readHomeSession } from "@/lib/home/session";
import { listOrdersForSession } from "@/lib/home/store";

function statusLabel(status: string): string {
  if (status === "placed") return "Placed";
  if (status === "refunded") return "Refunded";
  if (status === "cancelled") return "Cancelled";
  return status.replaceAll("_", " ");
}

export default async function OrdersPage() {
  const session = await readHomeSession();
  if (!session) redirect("/home/sign-in");

  const orders = await listOrdersForSession(session);

  return (
    <HomeShell
      session={session}
      active="orders"
      bypass={homeDevBypassEnabled()}
    >
      <HomeSectionTitle>Orders</HomeSectionTitle>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-secondary">
        Receipts for this household. They still work if an agent key was
        revoked.
      </p>

      {orders.length === 0 ? (
        <section className="mt-10 border-t border-hairline pt-8">
          <HomeEmptyHeadline>No receipts yet</HomeEmptyHeadline>
          <p className="mt-3 text-[15px] text-secondary">
            When an agent commits, the receipt appears here.
          </p>
          <Link
            href="/home/list"
            className="mt-4 inline-block text-[15px] text-accent underline-offset-2 hover:underline"
          >
            Check the list
          </Link>
        </section>
      ) : (
        <ul className="mt-10 border-t border-hairline">
          {orders.map((order, i) => (
            <li
              key={order.order_id}
              className="home-row flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline py-5"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[17px] text-ink">
                  {order.brand} · {order.description}
                </p>
                <p className="mt-1 text-[13px] text-secondary">
                  {statusLabel(order.status)} ·{" "}
                  <span className="tabular-nums">
                    {formatCents(order.landed_cents)}
                  </span>
                </p>
              </div>
              {order.receipt_token ? (
                <Link
                  href={`/home/receipts/${order.receipt_token}`}
                  className="text-[14px] font-medium text-accent underline-offset-2 hover:underline"
                >
                  Receipt
                </Link>
              ) : (
                <span className="text-[14px] text-secondary">No receipt</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </HomeShell>
  );
}
