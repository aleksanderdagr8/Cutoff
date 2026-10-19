"use client";

import { useState, type FormEvent } from "react";

type Persona = "builder" | "brand";
type Status = "idle" | "submitting" | "success" | "error";

export function WaitlistForm() {
  const [persona, setPersona] = useState<Persona>("builder");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona,
          email,
          name: name || undefined,
          company: company || undefined,
          note: note || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error === "invalid_email"
            ? "Enter a valid email."
            : "Something went wrong. Try again.",
        );
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setError("Network error. Try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="marketing-enter max-w-lg border-t border-hairline pt-8">
        <p className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
          You&apos;re on the list
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-secondary">
          We&apos;ll reach out when early access opens
          {persona === "builder"
            ? " for agent builders"
            : " for brand / supply conversations"}
          . No API key was generated — this is lead capture only.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-6">
      <fieldset>
        <legend className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
          I am
        </legend>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-8">
          {(
            [
              {
                value: "builder" as const,
                label: "Agent builder",
                hint: "Need a deterministic shelf",
              },
              {
                value: "brand" as const,
                label: "Brand / supply",
                hint: "Interest only — no merchant login",
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3"
            >
              <input
                type="radio"
                name="persona"
                value={opt.value}
                checked={persona === opt.value}
                onChange={() => setPersona(opt.value)}
                className="mt-1 accent-accent"
              />
              <span>
                <span className="block text-[15px] font-medium text-ink">
                  {opt.label}
                </span>
                <span className="block text-[13px] text-secondary">
                  {opt.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="wl-email" className="text-[13px] text-secondary">
          Email
        </label>
        <input
          id="wl-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-control border border-hairline bg-surface px-3 py-2.5 text-[15px] text-ink outline-none transition-colors duration-[160ms] ease-out focus:border-accent"
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="wl-name" className="text-[13px] text-secondary">
            Name{" "}
            <span className="text-secondary/70">(optional)</span>
          </label>
          <input
            id="wl-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-control border border-hairline bg-surface px-3 py-2.5 text-[15px] text-ink outline-none transition-colors duration-[160ms] ease-out focus:border-accent"
          />
        </div>
        <div>
          <label htmlFor="wl-company" className="text-[13px] text-secondary">
            {persona === "builder" ? "Project" : "Company"}{" "}
            <span className="text-secondary/70">(optional)</span>
          </label>
          <input
            id="wl-company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="mt-1.5 w-full rounded-control border border-hairline bg-surface px-3 py-2.5 text-[15px] text-ink outline-none transition-colors duration-[160ms] ease-out focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label htmlFor="wl-note" className="text-[13px] text-secondary">
          What are you building?{" "}
          <span className="text-secondary/70">(optional)</span>
        </label>
        <textarea
          id="wl-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1.5 w-full resize-y rounded-control border border-hairline bg-surface px-3 py-2.5 text-[15px] text-ink outline-none transition-colors duration-[160ms] ease-out focus:border-accent"
        />
      </div>

      {error ? (
        <p className="text-[14px] text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="marketing-cta rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Request early access"}
      </button>
    </form>
  );
}
