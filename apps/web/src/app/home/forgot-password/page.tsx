import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthIntro } from "@/components/home/auth/auth-intro";
import { ForgotPasswordForm } from "@/components/home/auth/forgot-password-form";
import { HomeShell } from "@/components/home/shell";
import { homeDevBypassEnabled, supabaseConfigured } from "@/lib/home/config";
import { readHomeAuthGate } from "@/lib/home/session";

export const metadata = { title: "Reset password — Cutoff" };

export default async function ForgotPasswordPage() {
  const gate = await readHomeAuthGate();
  if (gate.state === "member") redirect("/home");

  const bypass = homeDevBypassEnabled();
  const configured = supabaseConfigured();

  return (
    <HomeShell session={null} active="sign-in" bypass={bypass}>
      <AuthIntro
        title="Reset password"
        lede="We'll email a link if an account exists for that address."
      />
      {configured && !bypass ? (
        <ForgotPasswordForm />
      ) : (
        <p className="mt-8 max-w-md text-[15px] text-secondary">
          Password reset needs Supabase Auth.{" "}
          <Link href="/home/sign-in" className="font-medium text-accent underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      )}
    </HomeShell>
  );
}
