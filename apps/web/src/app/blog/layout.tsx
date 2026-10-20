import type { Metadata } from "next";
import { BlogFooter, BlogHeader } from "@/components/blog/blog-chrome";
import { SITE_URL } from "@/lib/blog/posts";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Blog — Cutoff",
    template: "%s — Cutoff",
  },
  description:
    "Notes from Cutoff on subscriptions, household buying, and agents that work for you.",
  alternates: {
    types: {
      "application/rss+xml": `${SITE_URL}/blog/rss.xml`,
    },
  },
  openGraph: {
    siteName: "Cutoff",
    type: "website",
  },
  twitter: {
    card: "summary",
  },
};

export default function BlogLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="marketing-shell relative flex min-h-screen flex-col">
      <div className="marketing-atmosphere pointer-events-none absolute inset-x-0 top-0 h-[420px]" />
      <BlogHeader />
      <div className="relative flex flex-1 flex-col">{children}</div>
      <BlogFooter />
    </div>
  );
}
