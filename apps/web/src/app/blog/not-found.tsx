import Link from "next/link";

export default function BlogNotFound() {
  return (
    <main className="mx-auto w-full max-w-[42rem] px-6 py-20 md:px-8">
      <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-[#1B3A4B]">
        Post not found
      </h1>
      <p className="mt-3 text-[16px] leading-relaxed text-[#1B3A4B]/80">
        That post isn’t published.
      </p>
      <p className="mt-6">
        <Link
          href="/blog"
          className="font-medium text-[#1B3A4B] underline decoration-[#E8743B] decoration-2 underline-offset-[3px]"
        >
          Back to the blog
        </Link>
      </p>
    </main>
  );
}
