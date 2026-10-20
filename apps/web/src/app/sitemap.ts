import type { MetadataRoute } from "next";
import { blogSitemapEntries } from "@/lib/blog/feed";
import { listPosts, SITE_URL } from "@/lib/blog/posts";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/docs/why-agents-fail`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...blogSitemapEntries(listPosts()),
  ];
}
