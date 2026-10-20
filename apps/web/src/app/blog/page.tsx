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
    <main className="mx-auto w-full max-w-[42rem] px-6 py-14 md:px-8 md:py-20">
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#9A3D12]">
        Blog
      </p>
      <h1 className="mt-3 text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.03em] text-[#1B3A4B] md:text-[2.75rem]">
        Notes from Cutoff
      </h1>
      <p className="mt-4 text-[17px] leading-relaxed text-[#1B3A4B]/80">
        {description}{" "}
        <a
          href="/blog/rss.xml"
          className="font-medium text-[#1B3A4B] underline decoration-[#E8743B] decoration-2 underline-offset-[3px]"
        >
          RSS
        </a>
      </p>

      {posts.length === 0 ? (
        <p className="mt-12 rounded-card border border-[#1B3A4B]/10 bg-white px-6 py-8 text-[16px] leading-relaxed text-[#1B3A4B]/80">
          No posts yet.
        </p>
      ) : (
        <ul className="mt-12 flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <article>
                <Link
                  href={`/blog/${post.slug}`}
                  className="block rounded-card border border-[#1B3A4B]/10 bg-white px-6 py-5 transition-colors hover:border-[#E8743B]"
                >
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-[#9A3D12]">
                    <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                    {post.draft ? (
                      <span className="rounded-full border border-[#E8743B] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9A3D12]">
                        Draft
                      </span>
                    ) : null}
                  </p>
                  <h2 className="mt-2 text-[1.35rem] font-semibold leading-snug tracking-[-0.02em] text-[#1B3A4B]">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A4B]/75">
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
