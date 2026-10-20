import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { BlogFooter, BlogHeader } from "@/components/blog/blog-chrome";
import { SITE_URL } from "@/lib/blog/posts";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
});

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
    <div
      className={`${outfit.variable} blog-shell flex min-h-screen flex-col`}
    >
      <BlogHeader />
      {children}
      <BlogFooter />
    </div>
  );
}
