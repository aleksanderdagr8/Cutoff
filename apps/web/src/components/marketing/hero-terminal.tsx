"use client";

import { useEffect, useState } from "react";

const EXAMPLES = [
  { sku: "coffee-beans-12oz", label: "coffee beans" },
  { sku: "hvac-filter-16x25", label: "HVAC filters" },
  { sku: "paper-towels-12pk", label: "paper towels" },
] as const;

type Mode = "scrape" | "cutoff";

export function HeroTerminal() {
  const [mode, setMode] = useState<Mode>("cutoff");
  const [exampleIdx, setExampleIdx] = useState(0);
  const [step, setStep] = useState(0);

  const example = EXAMPLES[exampleIdx]!;

  useEffect(() => {
    setStep(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (mode === "scrape") {
      timers.push(setTimeout(() => setStep(1), 400));
      timers.push(setTimeout(() => setStep(2), 1100));
    } else {
      timers.push(setTimeout(() => setStep(1), 350));
      timers.push(setTimeout(() => setStep(2), 900));
      timers.push(setTimeout(() => setStep(3), 1500));
    }
    return () => timers.forEach(clearTimeout);
  }, [mode, exampleIdx]);

  return (
    <div className="w-full max-w-xl">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        <button
          type="button"
          onClick={() => setMode("scrape")}
          className={`transition-colors duration-[160ms] ease-out ${
            mode === "scrape"
              ? "font-medium text-ink"
              : "text-secondary hover:text-ink"
          }`}
        >
          Scrape the storefront
        </button>
        <span className="text-hairline" aria-hidden>
          /
        </span>
        <button
          type="button"
          onClick={() => setMode("cutoff")}
          className={`transition-colors duration-[160ms] ease-out ${
            mode === "cutoff"
              ? "font-medium text-accent"
              : "text-secondary hover:text-ink"
          }`}
        >
          Call the shelf
        </button>
        <span className="ml-auto hidden text-secondary sm:inline">
          Try:{" "}
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.sku}
              type="button"
              onClick={() => setExampleIdx(i)}
              className={`ml-2 underline-offset-2 transition-colors duration-[160ms] ease-out hover:text-ink ${
                i === exampleIdx ? "text-ink underline" : ""
              }`}
            >
              {ex.label}
            </button>
          ))}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-control border border-hairline bg-[#0F1418] font-mono text-[12px] leading-relaxed text-[#C8CDD2] shadow-[0_24px_48px_-28px_rgba(27,58,75,0.45)] sm:text-[13px]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-[11px] text-white/45">
          <span className="inline-block h-2 w-2 rounded-full bg-white/20" />
          <span className="inline-block h-2 w-2 rounded-full bg-white/20" />
          <span className="inline-block h-2 w-2 rounded-full bg-white/20" />
          <span className="ml-2 truncate">
            {mode === "scrape" ? "curl · merchant HTML" : "POST /v1/quotes"}
          </span>
        </div>
        <div className="min-h-[220px] space-y-2 px-4 py-4" aria-live="polite">
          {mode === "scrape" ? (
            <>
              <p className="text-white/55">
                $ curl https://shop.example/{example.sku}
              </p>
              {step >= 1 ? (
                <p className="marketing-line text-[#E8A0A0]">
                  HTTP/1.1 403 Forbidden
                </p>
              ) : null}
              {step >= 2 ? (
                <pre className="marketing-line whitespace-pre-wrap text-white/40">{`{
  "error": "bot_detected",
  "hint": "render JS, rotate IP, pray"
}`}</pre>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-white/55">
                $ cutoff quote --item {example.sku}
              </p>
              {step >= 1 ? (
                <pre className="marketing-line whitespace-pre-wrap text-[#A8C5B5]">{`{
  "quote_id": "01J8…",
  "item": "${example.label}",
  "landed_cents": 1847,
  "delivery_days": 2,
  "expires_at": "…T+8m"
}`}</pre>
              ) : null}
              {step >= 2 ? (
                <p className="marketing-line text-white/55">
                  $ cutoff commit --quote 01J8… --idempotency …
                </p>
              ) : null}
              {step >= 3 ? (
                <pre className="marketing-line whitespace-pre-wrap text-[#A8C5B5]">{`{
  "order_id": "01J9…",
  "status": "captured",
  "receipt_token": "rt_…"
}`}</pre>
              ) : null}
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-secondary sm:hidden">
        Examples:{" "}
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex.sku}
            type="button"
            onClick={() => setExampleIdx(i)}
            className={`mr-2 underline-offset-2 ${
              i === exampleIdx ? "text-ink underline" : "hover:text-ink"
            }`}
          >
            {ex.label}
          </button>
        ))}
      </p>
    </div>
  );
}
