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

  it("loads the first post as a draft with the required frontmatter", () => {
    const all = readAllPosts();
    const post = all.find(
      (item) => item.slug === "subscribe-and-save-price-increase",
    );
    expect(post).toBeTruthy();
    expect(post?.draft).toBe(true);
    expect(post?.title).toBe(
      "Subscribe & Save Prices Went Up? Here's What's Happening and What You Can Do",
    );
    expect(post?.date).toBe("2026-10-20");
    expect(post?.description.length).toBeGreaterThan(40);
    expect(formatPostDate(post!.date)).toBe("October 20, 2026");
  });

  it("marks the unsourced FTC line with a visible TODO and does not invent a citation", () => {
    const post = readAllPosts().find(
      (item) => item.slug === "subscribe-and-save-price-increase",
    );
    expect(post).toBeTruthy();
    const sentence =
      "The FTC's case against Amazon over Prime enrollment and cancellation is the best-known example, and it's a separate issue from Subscribe & Save.";
    expect(post!.body).toContain(sentence);
    expect(post!.body).toContain(
      "> **TODO:** The line above references the FTC case against Amazon over Prime enrollment and cancellation and has no source. Add a citation before publishing.",
    );
    const withoutTodo = post!.body.replace(
      /\n> \*\*TODO:\*\* The line above references the FTC case against Amazon over Prime enrollment and cancellation and has no source\. Add a citation before publishing\.\n/,
      "\n",
    );
    expect(withoutTodo).not.toContain("TODO");
    expect(withoutTodo).toContain(sentence);
    expect(post!.body).not.toMatch(/ftc\.gov/i);
    expect(post!.body).toContain("## What Amazon says about Subscribe & Save pricing");
    expect(post!.body).toContain("## The bottom line");
  });

  it("omits the draft from production listings, sitemap, and RSS", () => {
    expect(
      listPosts("production").some(
        (post) => post.slug === "subscribe-and-save-price-increase",
      ),
    ).toBe(false);
    expect(
      listPosts("development").some(
        (post) => post.slug === "subscribe-and-save-price-increase",
      ),
    ).toBe(true);
    expect(
      getPost("subscribe-and-save-price-increase", "production"),
    ).toBeNull();
    expect(
      getPost("subscribe-and-save-price-increase", "development")?.draft,
    ).toBe(true);

    const published = listPosts("production");
    const rss = renderRss(published);
    expect(rss).not.toContain("subscribe-and-save-price-increase");
    expect(rss).toContain("<channel>");
    expect(blogSitemapEntries(published)).toEqual([]);

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
