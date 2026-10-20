"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import type { HomeAddressView } from "@/lib/home/types";

type Suggestion = {
  place_id: string;
  primary: string;
  secondary: string;
  description: string;
};

type Props = {
  addressId: string;
  initialAddress: HomeAddressView | null;
  placesConfigured: boolean;
  onAddressIdChange: (addressId: string) => void;
};

function newSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function AddressAutofill({
  addressId,
  initialAddress,
  placesConfigured,
  onAddressIdChange,
}: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(
    initialAddress?.formatted ?? "",
  );
  const [selected, setSelected] = useState<HomeAddressView | null>(
    initialAddress,
  );
  const [unit, setUnit] = useState(initialAddress?.line2 ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [configured, setConfigured] = useState(placesConfigured);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState(newSessionToken);
  const [pendingSuggest, startSuggest] = useTransition();
  const [pendingResolve, startResolve] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSuggestRef = useRef(false);

  useEffect(() => {
    setConfigured(placesConfigured);
  }, [placesConfigured]);

  const fetchSuggestions = useCallback(
    (value: string, token: string) => {
      if (!configured || value.trim().length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      startSuggest(async () => {
        const res = await fetch(
          `/api/home/address/suggest?q=${encodeURIComponent(value.trim())}&session_token=${encodeURIComponent(token)}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const body = (await res.json()) as {
          configured?: boolean;
          suggestions?: Suggestion[];
        };
        if (body.configured === false) {
          setConfigured(false);
          setSuggestions([]);
          setOpen(false);
          return;
        }
        const next = body.suggestions ?? [];
        setSuggestions(next);
        setOpen(next.length > 0);
        setActiveIndex(next.length > 0 ? 0 : -1);
      });
    },
    [configured],
  );

  function onQueryChange(value: string) {
    setQuery(value);
    setError(null);
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      return;
    }
    // Typing again clears the prior precise selection until a new pick.
    if (selected) {
      setSelected(null);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value, sessionToken);
    }, 220);
  }

  function pickSuggestion(s: Suggestion) {
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    setError(null);
    startResolve(async () => {
      const res = await fetch("/api/home/address/resolve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          place_id: s.place_id,
          session_token: sessionToken,
          line2: unit.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        address?: HomeAddressView;
        error?: string;
        configured?: boolean;
      } | null;
      if (res.status === 503 || body?.configured === false) {
        setConfigured(false);
        setError("Address search is not configured yet.");
        return;
      }
      if (!res.ok || !body?.address) {
        setError(
          body?.error === "incomplete_address"
            ? "Pick a full street address (not just a city or place name)."
            : "Could not resolve that address. Try another suggestion.",
        );
        return;
      }
      skipSuggestRef.current = true;
      setSelected(body.address);
      setQuery(body.address.formatted);
      setUnit(body.address.line2 ?? "");
      onAddressIdChange(body.address.address_id);
      setSessionToken(newSessionToken());
    });
  }

  async function persistUnit(nextUnit: string) {
    if (!selected) return;
    const res = await fetch("/api/home/address", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address_id: selected.address_id,
        line2: nextUnit.trim() || null,
      }),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { address: HomeAddressView };
    setSelected(body.address);
    skipSuggestRef.current = true;
    setQuery(body.address.formatted);
    onAddressIdChange(body.address.address_id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(
        (i) => (i - 1 + suggestions.length) % suggestions.length,
      );
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const s = suggestions[activeIndex];
      if (s) pickSuggestion(s);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  const disabled = !configured;
  const showList = open && suggestions.length > 0 && !disabled;

  return (
    <div className="space-y-3">
      <div className="relative">
        <label className="block" htmlFor={`${listId}-input`}>
          <span className="text-[13px] text-secondary">Shipping address</span>
          <input
            ref={inputRef}
            id={`${listId}-input`}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              showList && activeIndex >= 0
                ? `${listId}-opt-${activeIndex}`
                : undefined
            }
            autoComplete="off"
            disabled={disabled || pendingResolve}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              // Delay so option click registers before list closes.
              window.setTimeout(() => setOpen(false), 120);
            }}
            onFocus={() => {
              if (suggestions.length > 0 && !selected) setOpen(true);
            }}
            placeholder={
              disabled
                ? "Address search unavailable"
                : "Start typing a street address"
            }
            className="mt-2 w-full border-b border-hairline bg-transparent py-2 text-[17px] text-ink outline-none focus:border-accent disabled:opacity-50"
          />
        </label>
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto border border-hairline bg-[var(--surface)] shadow-[0_8px_24px_rgba(29,29,31,0.08)]"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.place_id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={`cursor-pointer px-3 py-2.5 text-left transition-colors duration-160 ease-out ${
                  i === activeIndex ? "bg-accent/[0.08]" : "hover:bg-black/[0.03]"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickSuggestion(s);
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <p className="text-[15px] text-ink">{s.primary}</p>
                {s.secondary ? (
                  <p className="mt-0.5 text-[13px] text-secondary">
                    {s.secondary}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {disabled ? (
        <p className="text-[13px] leading-relaxed text-secondary">
          Address autocomplete needs the server secret{" "}
          <span className="font-mono text-[12px] text-ink">
            GOOGLE_PLACES_API_KEY
          </span>{" "}
          on the web Worker (and GitHub if you deploy via Actions). Until then,
          mandate save still works with the current{" "}
          <span className="font-mono text-[12px]">{addressId}</span>.
        </p>
      ) : null}

      {pendingSuggest || pendingResolve ? (
        <p className="text-[13px] text-secondary" aria-live="polite">
          {pendingResolve ? "Resolving address…" : "Searching…"}
        </p>
      ) : null}

      {error ? (
        <p className="text-[14px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {selected ? (
        <div className="border-t border-hairline pt-3">
          <p className="text-[13px] text-secondary">Selected for shipping</p>
          <p className="mt-1 text-[15px] leading-snug text-ink">
            {selected.line1}
            {selected.line2 ? (
              <>
                <br />
                {selected.line2}
              </>
            ) : null}
            <br />
            {selected.city}, {selected.region} {selected.postal}
            <br />
            {selected.country}
          </p>
          <label className="mt-3 block">
            <span className="text-[13px] text-secondary">
              Apt / unit (optional)
            </span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              onBlur={() => void persistUnit(unit)}
              className="mt-2 w-full border-b border-hairline bg-transparent py-2 text-[15px] text-ink outline-none focus:border-accent"
              placeholder="e.g. Apt 4B"
            />
          </label>
          <p className="mt-2 font-mono text-[11px] text-secondary">
            {selected.address_id}
          </p>
        </div>
      ) : !disabled && addressId ? (
        <p className="text-[13px] text-secondary">
          Current mandate address id{" "}
          <span className="font-mono text-[12px] text-ink">{addressId}</span>
          — pick a suggestion above to bind a precise shipping address.
        </p>
      ) : null}
    </div>
  );
}
