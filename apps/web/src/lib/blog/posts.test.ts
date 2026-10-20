import { describe, expect, it } from "vitest";
import { blogSitemapEntries, renderRss } from "./feed";
import {
  articleJsonLd,
  formatPostDate,
  getPost,
  isPublished,
  listPosts,
  readAllPosts,
} from "./posts";

describe("blog posts", () => {
  it("hides drafts in production and shows them otherwise", () => {
    expect(isPublished({ draft: true }, "production")).toBe(false);
    expect(isPublished({ draft: false }, "production")).toBe(true);
    expect(isPublished({ draft: true }, "development")).toBe(true);
    expect(isPublished({ draft: true }, "test")).toBe(true);
    expect(isPublished({ draft: false }, "test")).toBe(true);
  });

  it("loads the first post as published with the required frontmatter", () => {
    const all = readAllPosts();
    const post = all.find(
      (item) => item.slug === "subscribe-and-save-price-increase",
    );
    expect(post).toBeTruthy();
    expect(post?.draft).toBe(false);
    expect(post?.title).toBe(
      "Subscribe & Save Prices Went Up? Here's What's Happening and What You Can Do",
    );
    expect(post?.date).toBe("2026-10-20");
    expect(post?.description.length).toBeGreaterThan(40);
    expect(formatPostDate(post!.date)).toBe("October 20, 2026");
  });

  it("cites the FTC Prime line and does not leave a TODO", () => {
    const post = readAllPosts().find(
      (item) => item.slug === "subscribe-and-save-price-increase",
    );
    expect(post).toBeTruthy();
    const ftc =
      "https://www.ftc.gov/news-events/news/press-releases/2025/09/ftc-secures-historic-25-billion-settlement-against-amazon";
    expect(post!.body).toContain(
      `The [FTC's case against Amazon over Prime enrollment and cancellation](${ftc}) is the best-known example, and it's a separate issue from Subscribe & Save.`,
    );
    expect(post!.body).not.toContain("TODO");
    expect(post!.body).toContain(ftc);
    expect(post!.body).toContain("## What Amazon says about Subscribe & Save pricing");
    expect(post!.body).toContain("## The bottom line");
  });

  it("includes the published post in production listings, sitemap, and RSS", () => {
    expect(
      listPosts("production").some(
        (post) => post.slug === "subscribe-and-save-price-increase",
      ),
    ).toBe(true);
    expect(
      listPosts("development").some(
        (post) => post.slug === "subscribe-and-save-price-increase",
      ),
    ).toBe(true);
    expect(
      getPost("subscribe-and-save-price-increase", "production")?.draft,
    ).toBe(false);
    expect(
      getPost("subscribe-and-save-price-increase", "development")?.draft,
    ).toBe(false);

    const published = listPosts("production");
    const rss = renderRss(published);
    expect(rss).toContain("subscribe-and-save-price-increase");
    expect(rss).toContain("<channel>");
    expect(blogSitemapEntries(published).map((entry) => entry.url)).toContain(
      "https://callcutoff.com/blog/subscribe-and-save-price-increase",
    );

    const preview = listPosts("development");
    const previewRss = renderRss(preview);
    expect(previewRss).toContain(
      "https://callcutoff.com/blog/subscribe-and-save-price-increase",
    );
    expect(previewRss).toContain("&amp;");
    expect(previewRss).not.toContain("Subscribe & Save Prices");
    expect(previewRss).toContain("Subscribe &amp; Save Prices");
  });

  it("builds Article JSON-LD for a post", () => {
    const post = getPost("subscribe-and-save-price-increase", "development");
    expect(post).toBeTruthy();
    const json = articleJsonLd(post!);
    expect(json["@type"]).toBe("Article");
    expect(json.headline).toBe(post!.title);
    expect(json.description).toBe(post!.description);
    expect(json.datePublished).toBe("2026-10-20T00:00:00.000Z");
    expect(json.url).toBe(
      "https://callcutoff.com/blog/subscribe-and-save-price-increase",
    );
  });
});
