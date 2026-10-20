type Props = {
  children: React.ReactNode;
  className?: string;
};

/** Sparse / first-run headline — one kinetic line, not looping body copy. */
export function HomeEmptyHeadline({ children, className = "" }: Props) {
  return (
    <p
      className={`home-empty-kinetic font-display text-[22px] font-semibold tracking-[-0.02em] text-ink md:text-[26px] ${className}`}
    >
      {children}
    </p>
  );
}
