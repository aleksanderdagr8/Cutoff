import { redirect } from "next/navigation";
import { readOpsSession } from "@/lib/ops/session";

export default async function OpsIndexPage() {
  const session = await readOpsSession();
  redirect(session ? "/ops/live" : "/ops/sign-in");
}
