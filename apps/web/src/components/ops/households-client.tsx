"use client";

import { formatUtcClock } from "@/lib/ops/format";
import type { OpsHouseholdView } from "@/lib/ops/types";

type Props = {
  households: OpsHouseholdView[];
};

export function HouseholdsClient({ households }: Props) {
  if (households.length === 0) {
    return (
      <p className="mt-10 text-[15px] leading-relaxed text-secondary">
        No households yet. When a household signs up, it shows here.
      </p>
    );
  }

  return (
    <ul className="mt-10 border-t border-hairline">
      {households.map((h, i) => (
        <li
          key={h.household_id}
          className="ops-row border-b border-hairline py-5"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <p className="text-[17px] text-ink">{h.name}</p>
          <p className="mt-1 text-[13px] text-secondary">
            {h.member_emails.join(", ") || "No members"} · {h.order_count}{" "}
            order{h.order_count === 1 ? "" : "s"} · created{" "}
            {formatUtcClock(h.created_at)}
          </p>
          <p className="mt-1 font-mono text-[12px] text-secondary">
            {h.household_id}
          </p>
        </li>
      ))}
    </ul>
  );
}
