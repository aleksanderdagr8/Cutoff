import { redirect } from "next/navigation";
import { AuthIntro } from "@/components/home/auth/auth-intro";
import { SignUpForm } from "@/components/home/auth/sign-up-form";
import { HomeShell } from "@/components/home/shell";
import { homeDevBypassEnabled, supabaseConfigured } from "@/lib/home/config";
import { readHomeAuthGate } from "@/lib/home/session";

export const metadata = { title: "Create account — Cutoff" };

export default async function SignUpPage() {
  const gate = await readHomeAuthGate();
  if (gate.state === "member") redirect("/home");
  if (gate.state === "needs_email_code") redirect("/home/verify");

  const bypass = homeDevBypassEnabled();
  const configured = supabaseConfigured();

  return (
    <HomeShell session={null} active="sign-in" bypass={bypass}>
      <AuthIntro
        title="Create an account"
        lede="We'll email a confirmation link. The next sign-in also asks for a short code."
      />
      {configured && !bypass ? (
        <SignUpForm />
      ) : (
        <p className="mt-8 max-w-md text-[15px] text-secondary">
          Account creation needs Supabase Auth. Local demo sign-in is on the sign-in page.
        </p>
      )}
    </HomeShell>
  );
}
