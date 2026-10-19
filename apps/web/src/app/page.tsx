import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Cutoff — your agent should work for you",
  description:
    "Household replenishment under a mandate you control. Locked quotes, skip anytime, receipts you keep. Early access for households, agent builders, and brand interest.",
};

export default function RootPage() {
  return <MarketingPage />;
}
