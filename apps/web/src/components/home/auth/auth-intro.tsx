import { HomeSectionTitle } from "@/components/home/home-section-title";

type Props = {
  title: string;
  lede: string;
};

export function AuthIntro({ title, lede }: Props) {
  return (
    <div className="max-w-md">
      <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
        Household
      </p>
      <HomeSectionTitle className="mt-3">{title}</HomeSectionTitle>
      <p className="mt-4 text-[17px] leading-relaxed text-secondary">{lede}</p>
    </div>
  );
}
