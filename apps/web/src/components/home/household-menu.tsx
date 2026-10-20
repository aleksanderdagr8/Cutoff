"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { SignOutButton } from "./sign-out-button";
import { useHomeTheme } from "./theme-provider";

type Props = {
  helpActive?: boolean;
  /** Desktop side-rail embeds controls inline; mobile uses hamburger panel. */
  variant: "desktop" | "mobile";
};

function AppearanceControls() {
  const { preference, resolved, setPreference, toggleDark } = useHomeTheme();
  const darkOn = resolved === "dark";

  return (
    <div className="home-menu-block space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-ink">Dark mode</p>
          <p className="mt-0.5 text-[12px] text-secondary">
            {preference === "system"
              ? "Following system"
              : preference === "dark"
                ? "On for this household"
                : "Off for this household"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={darkOn}
          aria-label="Dark mode"
          className={`home-press relative h-7 w-12 shrink-0 rounded-full transition-colors duration-160 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            darkOn ? "bg-accent" : "bg-hairline"
          }`}
          onClick={() => toggleDark()}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 left-0.5 block h-6 w-6 rounded-full bg-surface shadow-sm transition-transform duration-160 ease-out ${
              darkOn ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {preference !== "system" ? (
        <button
          type="button"
          className="text-[12px] text-secondary underline-offset-2 transition-colors duration-160 ease-out hover:text-ink hover:underline"
          onClick={() => setPreference("system")}
        >
          Match system
        </button>
      ) : null}
    </div>
  );
}

export function HouseholdMenu({ helpActive, variant }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (variant === "desktop") {
    return (
      <div className="mt-6 space-y-5 border-t border-hairline pt-5">
        <Link
          href="/home/help"
          className={`home-press block rounded-control px-3 py-2 text-[14px] transition-colors duration-160 ease-out ${
            helpActive
              ? "font-medium text-accent"
              : "text-secondary hover:text-ink"
          }`}
        >
          Help
        </Link>
        <div className="px-3">
          <AppearanceControls />
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="home-press inline-flex h-10 w-10 items-center justify-center rounded-control text-ink hover:bg-accent/[0.06]"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">{open ? "Close" : "Menu"}</span>
        <span aria-hidden className="relative block h-3.5 w-[18px]">
          <span
            className={`absolute left-0 top-0 block h-[1.5px] w-full origin-center bg-ink transition-transform duration-200 ease-out ${
              open ? "translate-y-[6.5px] rotate-45" : ""
            }`}
          />
          <span
            className={`absolute left-0 top-[6.5px] block h-[1.5px] w-full bg-ink transition-opacity duration-150 ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`absolute left-0 top-[13px] block h-[1.5px] w-full origin-center bg-ink transition-transform duration-200 ease-out ${
              open ? "-translate-y-[6.5px] -rotate-45" : ""
            }`}
          />
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default bg-ink/20"
            aria-label="Dismiss menu"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Household menu"
            className="home-menu-panel absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(100vw-2rem,17.5rem)] rounded-control border border-hairline bg-surface p-4 shadow-sm"
          >
            <nav className="flex flex-col gap-1" aria-label="Household extras">
              <Link
                href="/home/help"
                className={`home-press rounded-control px-2 py-2.5 text-[15px] ${
                  helpActive
                    ? "font-medium text-accent"
                    : "text-ink hover:bg-accent/[0.06]"
                }`}
                onClick={() => setOpen(false)}
              >
                Help
              </Link>
            </nav>
            <div className="my-3 border-t border-hairline" />
            <AppearanceControls />
            <div className="my-3 border-t border-hairline" />
            <div className="px-2 py-1">
              <SignOutButton />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
