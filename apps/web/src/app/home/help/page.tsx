import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeShell } from "@/components/home/shell";
import { homeDevBypassEnabled } from "@/lib/home/config";
import { readHomeSession } from "@/lib/home/session";

export default async function HelpPage() {
  const session = await readHomeSession();
  if (!session) redirect("/home/sign-in");

  return (
    <HomeShell
      session={session}
      active="help"
      bypass={homeDevBypassEnabled()}
    >
      <h1 className="font-display text-[34px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
        Help
      </h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-secondary">
        What Cutoff is doing for your household — in plain language.
      </p>

      <section className="mt-12 max-w-xl space-y-10 border-t border-hairline pt-8">
        <div>
          <h2 className="text-[18px] font-medium text-ink">The shelf</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-secondary">
            Cutoff is the shelf your buyer agent calls when you say buy.
            Replenishment items (pet, household, coffee, filters) stay on your{" "}
            <Link
              href="/home/list"
              className="text-accent underline-offset-2 hover:underline"
            >
              List
            </Link>
            . You are not meant to browse or click checkout every time.
          </p>
        </div>
        <div>
          <h2 className="text-[18px] font-medium text-ink">Mandate</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-secondary">
            A mandate is your spending permission: ceiling, address,
            never-substitute, and expiry. Without it, an agent cannot commit.
          </p>
        </div>
        <div>
          <h2 className="text-[18px] font-medium text-ink">Keys</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-secondary">
            An agent key is shown once when you issue it. Cutoff stores a hash,
            not the secret. Revoke anytime — receipts still work.
          </p>
        </div>
        <div>
          <h2 className="text-[18px] font-medium text-ink">Skip</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-secondary">
            Skip on the list pauses that line so nothing is placed. On a
            receipt, Skip cancels or starts a return when that is still
            allowed.
          </p>
        </div>
      </section>
    </HomeShell>
  );
}
