import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Cutoff — the shelf agents call",
  description:
    "Deterministic quotes and commits for replenishment. Early access for agent builders and brand interest.",
};

export default function RootPage() {
  return <MarketingPage />;
}
