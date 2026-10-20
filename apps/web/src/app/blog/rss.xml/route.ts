import { renderRss } from "@/lib/blog/feed";
import { listPosts } from "@/lib/blog/posts";

export const dynamic = "force-static";

export function GET() {
  const xml = renderRss(listPosts());
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
