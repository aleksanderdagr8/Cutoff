import { SITE_URL, postUrl, type BlogPost } from "./posts";

export type FeedPost = Pick<
  BlogPost,
  "title" | "description" | "date" | "slug"
>;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function rfc822(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day)).toUTCString();
}

export function renderRss(posts: FeedPost[]): string {
  const items = posts
    .map((post) => {
      const url = postUrl(post.slug);
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <pubDate>${escapeXml(rfc822(post.date))}</pubDate>`,
        `      <description>${escapeXml(post.description)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>Cutoff Blog</title>",
    `    <link>${SITE_URL}/blog</link>`,
    "    <description>Notes from Cutoff on subscriptions, household buying, and agents that work for you.</description>",
    `    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function blogSitemapEntries(posts: FeedPost[]): {
  url: string;
  lastModified: string;
  changeFrequency: "monthly";
  priority: number;
}[] {
  return posts.map((post) => ({
    url: postUrl(post.slug),
    lastModified: post.date,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
}
