import Link from "next/link";
import { AuthIntro } from "@/components/home/auth/auth-intro";
import { ResetPasswordForm } from "@/components/home/auth/reset-password-form";
import { HomeShell } from "@/components/home/shell";
import { homeDevBypassEnabled } from "@/lib/home/config";
import { readSignedInEmail } from "@/lib/home/session";

export const metadata = { title: "New password — Cutoff" };

export default async function ResetPasswordPage() {
  const email = await readSignedInEmail();
  const bypass = homeDevBypassEnabled();

  return (
    <HomeShell session={null} active="sign-in" bypass={bypass}>
      <AuthIntro
        title="New password"
        lede="Choose a password of at least 8 characters. You'll sign in again, then enter a code."
      />
      {email ? (
        <ResetPasswordForm />
      ) : (
        <p className="mt-8 max-w-md text-[15px] text-secondary">
          This reset link is invalid or expired.{" "}
          <Link
            href="/home/forgot-password"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Request a new one
          </Link>
        </p>
      )}
    </HomeShell>
  );
}
