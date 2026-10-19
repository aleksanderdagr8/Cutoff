"use client";

import { formatUtcClock } from "@/lib/ops/format";
import type { OpsAuditView } from "@/lib/ops/types";

type Props = {
  audits: OpsAuditView[];
};

export function AuditClient({ audits }: Props) {
  if (audits.length === 0) {
    return (
      <p className="mt-8 text-[15px] text-secondary">No audit rows yet.</p>
    );
  }

  return (
    <ul className="mt-8 border-t border-hairline">
      {audits.map((a, i) => (
        <li
          key={a.audit_id}
          className="ops-row border-b border-hairline py-4"
          style={{ animationDelay: `${i * 30}ms` }}
        >
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
            {formatUtcClock(a.at_utc)} · {a.actor_id}
            {a.order_id ? ` · order ${a.order_id}` : ""} · {a.reason}
          </p>
        </li>
      ))}
    </ul>
  );
}
