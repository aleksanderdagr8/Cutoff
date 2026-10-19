"use client";

import { useState } from "react";

const PANELS = [
  {
    id: "shelf",
    label: "JSON shelf",
    title: "A shelf, not a storefront",
    body: "Agents call Bearer /v1 with a canonical item id. No HTML scrape, no cart DOM, no image blobs on the hot path — just ranked offers as typed JSON.",
    sample: `{
  "canonical_item_id": "coffee-beans-12oz",
  "offers": [
    { "landed_cents": 1847, "days": 2, "score": 0 },
    { "landed_cents": 1910, "days": 1, "score": 0 }
  ]
}`,
  },
  {
    id: "quote",
    label: "Landed quote",
    title: "One immutable quote",
    body: "Rank is landed price, then delivery, then merchant score. The quote expires fast; commit honors it or returns a typed failure — never a silent price drift.",
    sample: `{
  "quote_id": "01J8…",
  "landed_cents": 1847,
  "fulfiller_id": "agg_…",
  "expires_at": "…+8m",
  "rank": ["price", "delivery", "score"]
}`,
  },
  {
    id: "evidence",
    label: "Evidence",
    title: "Evidence on every commit",
    body: "Same transaction as capture: actor chain, mandate, quote hash, address, amount. Households keep a receipt even if the agent key is later revoked.",
    sample: `{
  "actor_chain": ["agent:ck_…", "mandate:md_…"],
  "quote_hash": "sha256:…",
  "amount_cents": 1847,
  "address_id": "addr_…"
}`,
  },
] as const;

type PanelId = (typeof PANELS)[number]["id"];

export function BuildersPanel() {
  const [active, setActive] = useState<PanelId>("shelf");
  const panel = PANELS.find((p) => p.id === active)!;

  return (
    <div>
      <div
        className="flex flex-wrap gap-x-6 gap-y-2 border-b border-hairline"
        role="tablist"
        aria-label="Builder value"
      >
        {PANELS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active === p.id}
            onClick={() => setActive(p.id)}
            className={`border-b-2 pb-3 text-[14px] transition-colors duration-[160ms] ease-out ${
              active === p.id
                ? "border-accent font-medium text-accent"
                : "border-transparent text-secondary hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-2 md:items-start" role="tabpanel">
        <div className="marketing-enter">
          <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
            {panel.title}
          </h3>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-secondary">
            {panel.body}
          </p>
        </div>
        <pre className="marketing-enter overflow-x-auto rounded-control border border-hairline bg-[#0F1418] p-4 font-mono text-[12px] leading-relaxed text-[#A8C5B5] sm:text-[13px]">
          {panel.sample}
        </pre>
      </div>
    </div>
  );
}
