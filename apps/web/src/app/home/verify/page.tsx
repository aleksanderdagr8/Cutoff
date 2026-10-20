import { redirect } from "next/navigation";
import { AuthIntro } from "@/components/home/auth/auth-intro";
import { VerifyCodeForm } from "@/components/home/auth/verify-code-form";
import { HomeShell } from "@/components/home/shell";
import { homeDevBypassEnabled } from "@/lib/home/config";
import { readHomeAuthGate } from "@/lib/home/session";

export const metadata = { title: "Check your email — Cutoff" };

export default async function VerifyPage() {
  const gate = await readHomeAuthGate();
  if (gate.state === "anonymous") redirect("/home/sign-in");
  if (gate.state === "member") redirect("/home");

  return (
    <HomeShell session={null} active="sign-in" bypass={homeDevBypassEnabled()}>
      <AuthIntro
        title="Check your email"
        lede="A password is the first step. The code is the second."
      />
      <VerifyCodeForm email={gate.email} codeAlreadySent={gate.pending} />
    </HomeShell>
  );
}
