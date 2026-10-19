import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeShell } from "@/components/home/shell";
import { ReceiptActions } from "@/components/home/receipt-actions";
import { homeDevBypassEnabled } from "@/lib/home/config";
import { formatCents } from "@/lib/home/format";
import { readHomeSession } from "@/lib/home/session";
import { getReceiptForSession } from "@/lib/home/store";

type Props = {
  params: Promise<{ token: string }>;
};

/**
 * Household receipt (Unit 10).
 * Works if the agent key was revoked. No agent credential in the page.
 * Skip is one control — no interstitial, no confirmation copy.
 */
export default async function ReceiptPage({ params }: Props) {
  const session = await readHomeSession();
  if (!session) redirect("/home/sign-in");

  const { token } = await params;
  const result = await getReceiptForSession(session, token);
  const receipt = "error" in result ? null : result;

  return (
    <HomeShell
      session={session}
      active="receipt"
      bypass={homeDevBypassEnabled()}
    >
      <p className="text-[13px] text-secondary">
        <Link href="/home/list" className="hover:text-ink">
          List
        </Link>
        <span className="mx-2">/</span>
        Receipt
      </p>
      <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-ink">
        Receipt
      </h1>
      <p className="mt-2 max-w-xl text-[15px] text-secondary">
        Charge details for your household. Works even if the agent key was
        revoked.
      </p>

      {receipt ? (
        <section className="mt-10 space-y-6 border-t border-hairline pt-8">
          <div>
            <p className="text-[13px] text-secondary">Item</p>
            <p className="mt-1 text-[17px] text-ink">
              {receipt.item.brand} · {receipt.item.description}
            </p>
          </div>
          <div>
            <p className="text-[13px] text-secondary">Landed price</p>
            <p className="mt-1 text-[17px] tabular-nums text-ink">
              {formatCents(receipt.landed_cents)}
            </p>
          </div>
          <div>
            <p className="text-[13px] text-secondary">Fulfiller</p>
            <p className="mt-1 text-[17px] text-ink">{receipt.fulfiller_id}</p>
          </div>
          <div>
            <p className="text-[13px] text-secondary">Why this seller</p>
            <ul className="mt-2 space-y-1 text-[15px] text-ink">
              <li>
                Landed{" "}
                <span className="tabular-nums">
                  {formatCents(receipt.why_this_seller.landed_cents)}
                </span>
              </li>
              <li>Delivery {receipt.why_this_seller.delivery_date}</li>
              <li>Score {receipt.why_this_seller.merchant_score}</li>
            </ul>
          </div>
          <ReceiptActions
            token={token}
            skipAvailable={receipt.skip_available}
          />
        </section>
      ) : (
        <section className="mt-10 border-t border-hairline pt-8">
          <p className="text-[15px] text-secondary">
            This receipt is not available for your household. Token{" "}
            <span className="font-mono text-ink">{token}</span>.
          </p>
        </section>
      )}
    </HomeShell>
  );
}
