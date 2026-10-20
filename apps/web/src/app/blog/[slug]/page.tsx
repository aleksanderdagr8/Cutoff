import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogPostBody } from "@/components/blog/blog-post-body";
import {
  articleJsonLd,
  formatPostDate,
  getPost,
  listPosts,
  postUrl,
} from "@/lib/blog/posts";

export const dynamic = "force-static";
export const dynamicParams = false;

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return listPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  const url = postUrl(post.slug);
  const title = `${post.title} — Cutoff`;
  return {
    title: { absolute: title },
    description: post.description,
    alternates: {
      canonical: url,
      types: {
        "application/rss+xml": "https://callcutoff.com/blog/rss.xml",
      },
    },
    authors: [{ name: "Cutoff", url: "https://callcutoff.com" }],
    openGraph: {
      title,
      description: post.description,
      url,
      type: "article",
      publishedTime: `${post.date}T00:00:00.000Z`,
      modifiedTime: `${post.date}T00:00:00.000Z`,
      siteName: "Cutoff",
    },
    twitter: {
      card: "summary",
      title,
      description: post.description,
    },
    robots: post.draft ? { index: false, follow: false } : undefined,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const jsonLd = JSON.stringify(articleJsonLd(post)).replaceAll("<", "\\u003c");

  return (
    <main className="mx-auto w-full max-w-[42rem] px-6 py-12 md:px-8 md:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <p className="text-[14px]">
        <Link
          href="/blog"
          className="font-medium text-[#1B3A4B] underline decoration-[#E8743B] decoration-2 underline-offset-[3px]"
        >
          Blog
        </Link>
      </p>
      <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium tracking-[0.04em] text-[#9A3D12]">
        <time dateTime={post.date}>{formatPostDate(post.date)}</time>
        {post.draft ? (
          <span className="rounded-full border border-[#E8743B] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9A3D12]">
            Draft
          </span>
        ) : null}
      </p>
      <article className="mt-3">
        <BlogPostBody source={post.body} />
      </article>
    </main>
  );
}
