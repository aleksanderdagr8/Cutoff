import Link from "next/link";

export default function BlogNotFound() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-20 md:px-8">
      <h1 className="font-display text-[32px] font-semibold tracking-[-0.03em] text-ink">
        Post not found
      </h1>
      <p className="mt-3 text-[16px] leading-relaxed text-secondary">
        That post isn’t published.
      </p>
      <p className="mt-6">
        <Link
          href="/blog"
          className="text-[15px] font-medium text-accent underline-offset-4 hover:underline"
        >
          Back to the blog
        </Link>
      </p>
    </main>
  );
}
