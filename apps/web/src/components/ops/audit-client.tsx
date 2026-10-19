"use client";

import { formatUtcClock } from "@/lib/ops/format";
import type { OpsAuditView } from "@/lib/ops/types";

type Props = {
  audits: OpsAuditView[];
};

export function AuditClient({ audits }: Props) {
  if (audits.length === 0) {
    return (
      <p className="mt-10 text-[15px] leading-relaxed text-secondary">
        No audit rows yet. Operator actions appear here with their reasons.
      </p>
    );
  }

  return (
    <ul className="mt-10 border-t border-hairline">
      {audits.map((a, i) => (
        <li
          key={a.audit_id}
          className="ops-row grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 border-b border-hairline py-4"
          style={{ animationDelay: `${i * 30}ms` }}
        >
          <time
            dateTime={a.at_utc}
            className="font-mono text-[12px] tabular-nums text-secondary"
          >
            {formatUtcClock(a.at_utc).slice(11, 19)}
          </time>
          <div className="min-w-0">
            <p className="text-[15px] text-ink">
              {a.action}
              {a.target_id ? (
                <span className="font-mono text-[13px] text-secondary">
                  {" "}
                  · {a.target_id}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-[13px] text-secondary">
              {a.actor_id}
              {a.order_id ? ` · order ${a.order_id}` : ""} · {a.reason}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
