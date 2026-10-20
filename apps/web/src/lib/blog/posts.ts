import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export const SITE_URL = "https://callcutoff.com";

export type BlogPost = {
  title: string;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  slug: string;
  draft: boolean;
  body: string;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Drafts stay in the repo so they can be previewed with `next dev`.
 * A production build (`next build` / the Cloudflare deploy) omits them
 * from the index, post routes, sitemap, and RSS feed.
 */
export function isPublished(
  post: { draft: boolean },
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (!post.draft) return true;
  return nodeEnv !== "production";
}

export function blogContentDir(): string {
  const candidates = [
    path.join(process.cwd(), "content", "blog"),
    path.join(process.cwd(), "apps", "web", "content", "blog"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

function requireString(value: unknown, field: string, file: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${file}: frontmatter "${field}" must be a non-empty string`);
  }
  return value.trim();
}

function normalizeDate(value: unknown, file: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    return value.trim().slice(0, 10);
  }
  throw new Error(`${file}: frontmatter "date" must be YYYY-MM-DD`);
}

function normalizeDraft(value: unknown, file: string): boolean {
  if (value == null) return false;
  if (value === true || value === false) return value;
  throw new Error(`${file}: frontmatter "draft" must be true or false`);
}

function readPostFile(dir: string, name: string): BlogPost {
  const raw = fs.readFileSync(path.join(dir, name), "utf8");
  const parsed = matter(raw);
  const data: Record<string, unknown> = parsed.data;
  const title = requireString(data.title, "title", name);
  const description = requireString(data.description, "description", name);
  const date = normalizeDate(data.date, name);
  const slug = requireString(data.slug, "slug", name);
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `${name}: slug must be lowercase words separated by hyphens`,
    );
  }
  const body = parsed.content.trim();
  if (!body) {
    throw new Error(`${name}: post body is empty`);
  }
  return {
    title,
    description,
    date,
    slug,
    draft: normalizeDraft(data.draft, name),
    body,
  };
}

export function readAllPosts(): BlogPost[] {
  const dir = blogContentDir();
  if (!fs.existsSync(dir)) return [];
  const names = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md") || name.endsWith(".mdx"));
  const posts = names.map((name) => readPostFile(dir, name));
  const seen = new Set<string>();
  for (const post of posts) {
    if (seen.has(post.slug)) {
      throw new Error(`duplicate blog slug: ${post.slug}`);
    }
    seen.add(post.slug);
  }
  posts.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.slug.localeCompare(b.slug);
  });
  return posts;
}

export function listPosts(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): BlogPost[] {
  return readAllPosts().filter((post) => isPublished(post, nodeEnv));
}

export function getPost(
  slug: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): BlogPost | null {
  const post = readAllPosts().find((item) => item.slug === slug);
  if (!post || !isPublished(post, nodeEnv)) return null;
  return post;
}

export function formatPostDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function postUrl(slug: string): string {
  return `${SITE_URL}/blog/${slug}`;
}

export function articleJsonLd(post: BlogPost): Record<string, unknown> {
  const url = postUrl(post.slug);
  const published = `${post.date}T00:00:00.000Z`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: published,
    dateModified: published,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    url,
    author: {
      "@type": "Organization",
      name: "Cutoff",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Cutoff",
      url: SITE_URL,
    },
  };
}
