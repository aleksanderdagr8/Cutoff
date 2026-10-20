type Props = {
  children: React.ReactNode;
  as?: "h1" | "h2";
  /** page = List/Mandate peers; today = compact Today heading */
  size?: "page" | "today";
  className?: string;
};

/** Section titles — light blur→sharp on enter. Not for body, rows, or prices. */
export function HomeSectionTitle({
  children,
  as = "h1",
  size = "page",
  className = "",
}: Props) {
  const Tag = as;
  const sizeClass =
    size === "today"
      ? "text-[22px] tracking-[-0.02em]"
      : "text-[34px] md:text-[40px] tracking-[-0.03em]";
  return (
    <Tag
      className={`home-title-kinetic font-display font-semibold text-ink ${sizeClass} ${className}`}
    >
      {children}
    </Tag>
  );
}
