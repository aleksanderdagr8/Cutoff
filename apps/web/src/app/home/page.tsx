import { redirect } from "next/navigation";
import { readHomeSession } from "@/lib/home/session";

export default async function HomeIndexPage() {
  const session = await readHomeSession();
  redirect(session ? "/home/list" : "/home/sign-in");
}
