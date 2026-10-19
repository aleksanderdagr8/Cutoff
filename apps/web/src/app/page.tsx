import Link from "next/link";

export default function RootPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-[1120px] flex-col justify-center px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(80%_55%_at_20%_0%,rgba(27,58,75,0.09),transparent_55%)]" />
      <div className="home-enter relative">
        <p className="text-[40px] font-semibold tracking-[-0.04em] text-ink md:text-[52px]">
          CUTOFF
        </p>
        <p className="mt-3 max-w-md text-[17px] leading-relaxed text-secondary">
          The shelf agents call when a person says buy.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/home"
            className="rounded-control bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition-opacity duration-[160ms] ease-out hover:opacity-90"
          >
            Household
          </Link>
          <Link
            href="/ops"
            className="rounded-control border border-hairline px-5 py-2.5 text-[15px] font-medium text-ink transition-colors duration-[160ms] ease-out hover:border-accent hover:text-accent"
          >
            Operator
          </Link>
        </div>
      </div>
    </main>
  );
}
