import { redirect } from "next/navigation";
import { HomeSectionTitle } from "@/components/home/home-section-title";
import { HomeShell } from "@/components/home/shell";
import { SignInForm } from "@/components/home/sign-in-form";
import { homeDevBypassEnabled, supabaseConfigured } from "@/lib/home/config";
import { readHomeSession } from "@/lib/home/session";

export default async function SignInPage() {
  const session = await readHomeSession();
  if (session) redirect("/home");

  const bypass = homeDevBypassEnabled();
  const configured = supabaseConfigured();

  return (
    <HomeShell session={null} active="sign-in" bypass={bypass}>
      <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-secondary">
        Household
      </p>
      <HomeSectionTitle className="mt-3">Sign in</HomeSectionTitle>
      <p className="mt-4 max-w-md text-[17px] leading-relaxed text-secondary">
        Sign in to set your mandate, issue an agent key, and watch the list —
        not the day-to-day reorder path.
      </p>
      <SignInForm bypass={bypass} supabaseConfigured={configured} />
    </HomeShell>
  );
}
