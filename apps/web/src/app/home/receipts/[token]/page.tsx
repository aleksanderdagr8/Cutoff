import type { ReceiptResponse } from "@cutoff/contracts";

/**
 * Household receipt console (Unit 10).
 * Renders from a charge-descriptor link. No agent key required.
 * Skip is one control — no interstitial, no confirmation copy.
 *
 * In production this page would fetch `/v1/receipts/:token` with the
 * human session. Tests assert the receipt shape + server API separately.
 */
type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseReceipt(raw: string | undefined): ReceiptResponse | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const data = JSON.parse(raw) as ReceiptResponse;
    if (!data.receipt_token || !data.order_id || !data.why_this_seller) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export default async function ReceiptPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const demoRaw = typeof sp.demo === "string" ? sp.demo : undefined;
  const receipt = parseReceipt(
    demoRaw
      ? decodeURIComponent(demoRaw)
      : undefined,
  );

  return (
    <main className="mx-auto min-h-screen max-w-[640px] px-8 py-16">
      <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
        Cutoff
      </p>
      <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-ink">
        Receipt
      </h1>
      <p className="mt-2 text-[15px] text-secondary">
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
              ${(receipt.landed_cents / 100).toFixed(2)}
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
                  ${(receipt.why_this_seller.landed_cents / 100).toFixed(2)}
                </span>
              </li>
              <li>Delivery {receipt.why_this_seller.delivery_date}</li>
              <li>Score {receipt.why_this_seller.merchant_score}</li>
            </ul>
          </div>
          {receipt.skip_available ? (
            <form className="pt-2">
              <button
                type="submit"
                className="rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white"
              >
                Skip
              </button>
            </form>
          ) : null}
          <p className="text-[12px] text-secondary">Token {token}</p>
        </section>
      ) : (
        <section className="mt-10 border-t border-hairline pt-8">
          <p className="text-[15px] text-secondary">
            Open this link from your charge descriptor. Receipt token{" "}
            <span className="font-mono text-ink">{token}</span>.
          </p>
        </section>
      )}
    </main>
  );
}
