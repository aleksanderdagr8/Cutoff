import { redirect } from "next/navigation";
import { AuthIntro } from "@/components/home/auth/auth-intro";
import { HomeShell } from "@/components/home/shell";
import { SignInForm } from "@/components/home/sign-in-form";
import { homeDevBypassEnabled, supabaseConfigured } from "@/lib/home/config";
import { readHomeAuthGate } from "@/lib/home/session";

export const metadata = { title: "Sign in — Cutoff" };

function noticeText(notice: string | undefined): string | null {
  if (notice === "confirmed") {
    return "Email confirmed. Sign in with your password. We'll send a code next.";
  }
  if (notice === "password_updated") {
    return "Password updated. Sign in with the new one.";
  }
  return null;
}

function errorText(error: string | undefined): string | null {
  if (error === "auth_callback") {
    return "That link didn't work. Request a new one.";
  }
  return null;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const gate = await readHomeAuthGate();
  if (gate.state === "member") redirect("/home");
  if (gate.state === "needs_email_code") redirect("/home/verify");

  const query = await searchParams;
  const bypass = homeDevBypassEnabled();

  return (
    <HomeShell session={null} active="sign-in" bypass={bypass}>
      <AuthIntro
        title="Sign in"
        lede="Sign in to set your mandate, issue an agent key, and watch the list — not the day-to-day reorder path."
      />
      <SignInForm
        bypass={bypass}
        supabaseConfigured={supabaseConfigured()}
        notice={noticeText(query.notice)}
        initialError={errorText(query.error)}
      />
    </HomeShell>
  );
}
