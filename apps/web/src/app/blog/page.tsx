import type { Metadata } from "next";
import Link from "next/link";
import { formatPostDate, listPosts, SITE_URL } from "@/lib/blog/posts";

export const dynamic = "force-static";

const description =
  "Notes from Cutoff on subscriptions, household buying, and agents that work for you.";

export const metadata: Metadata = {
  title: { absolute: "Blog — Cutoff" },
  description,
  alternates: {
    canonical: `${SITE_URL}/blog`,
    types: {
      "application/rss+xml": `${SITE_URL}/blog/rss.xml`,
    },
  },
  openGraph: {
    title: "Blog — Cutoff",
    description,
    url: `${SITE_URL}/blog`,
    siteName: "Cutoff",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Blog — Cutoff",
    description,
  },
};

export default function BlogIndexPage() {
  const posts = listPosts();

  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-14 md:px-8 md:py-20">
      <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
        Blog
      </p>
      <h1 className="mt-3 font-display text-[32px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
        Notes from Cutoff
      </h1>
      <p className="mt-4 text-[16px] leading-relaxed text-secondary">
        {description}{" "}
        <a
          href="/blog/rss.xml"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          RSS
        </a>
      </p>

      {posts.length === 0 ? (
        <p className="mt-12 rounded-card border border-hairline bg-surface px-6 py-8 text-[16px] leading-relaxed text-secondary">
          No posts yet.
        </p>
      ) : (
        <ul className="mt-12 flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <article>
                <Link
                  href={`/blog/${post.slug}`}
                  className="block rounded-card border border-hairline bg-surface px-6 py-5 hover:border-accent"
                >
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-secondary">
                    <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                    {post.draft ? (
                      <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
                        Draft
                      </span>
                    ) : null}
                  </p>
                  <h2 className="mt-2 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-secondary">
                    {post.description}
                  </p>
                </Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
