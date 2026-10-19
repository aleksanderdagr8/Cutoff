import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderSheetClient } from "@/components/ops/order-sheet-client";
import { OpsShell } from "@/components/ops/shell";
import { opsDevBypassEnabled } from "@/lib/ops/config";
import { readOpsSession } from "@/lib/ops/session";
import { getOrderSheet } from "@/lib/ops/store";

type Props = {
  params: Promise<{ orderId: string }>;
};

export default async function OpsOrderSheetPage({ params }: Props) {
  const session = await readOpsSession();
  if (!session) redirect("/ops/sign-in");

  const { orderId } = await params;
  const sheet = await getOrderSheet(orderId);
  if (!sheet) notFound();

  return (
    <OpsShell
      session={session}
      active="order"
      bypass={opsDevBypassEnabled()}
    >
      <p className="mb-8 text-[13px]">
        <Link
          href="/ops/live"
          className="text-secondary underline-offset-2 transition-colors duration-160 ease-out hover:text-ink hover:underline"
        >
          ← Live
        </Link>
      </p>
      <OrderSheetClient initial={sheet} />
    </OpsShell>
  );
}
