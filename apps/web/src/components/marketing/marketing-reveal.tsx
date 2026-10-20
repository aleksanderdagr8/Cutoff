"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Stagger index for sibling reveals (0-based). */
  delay?: number;
  as?: "div" | "li";
};

/**
 * Scroll-triggered enter for marketing sections.
 * CSS owns the motion; reduced-motion disables via globals.
 */
export function MarketingReveal({
  children,
  className = "",
  delay = 0,
  as = "div",
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      /* Fire once the block is meaningfully in view so the rise is watched, not already done */
      { rootMargin: "0px 0px -18% 0px", threshold: 0.18 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const classNames = `marketing-reveal ${visible ? "marketing-reveal-in" : ""} ${className}`;
  const style: CSSProperties | undefined =
    delay > 0
      ? ({ "--marketing-reveal-delay": `${delay * 140}ms` } as CSSProperties)
      : undefined;

  if (as === "li") {
    return (
      <li
        ref={(node) => {
          ref.current = node;
        }}
        className={classNames}
        style={style}
      >
        {children}
      </li>
    );
  }

  return (
    <div
      ref={(node) => {
        ref.current = node;
      }}
      className={classNames}
      style={style}
    >
      {children}
    </div>
  );
}
