"use client";

import { useEffect, useState } from "react";
import {
  markHomeWordmarkEnterPlayed,
  peekHomeWordmarkEnter,
} from "@/lib/home/motion";

type Props = {
  className?: string;
};

/**
 * Shell header CUTOFF — one short enter per session/load (not every nav).
 * Persistence lives in lib/home/motion (not browser secret storage).
 */
export function HomeWordmark({ className = "" }: Props) {
  const [enter, setEnter] = useState(false);

  useEffect(() => {
    if (!peekHomeWordmarkEnter()) return;
    setEnter(true);
    const t = window.setTimeout(() => {
      markHomeWordmarkEnterPlayed();
    }, 420);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <p
      className={`font-display font-semibold tracking-[-0.04em] text-ink ${
        enter ? "home-wordmark-enter" : ""
      } ${className}`}
    >
      CUTOFF
    </p>
  );
}
