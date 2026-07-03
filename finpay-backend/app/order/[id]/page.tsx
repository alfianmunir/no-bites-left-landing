/**
 * GET /order/[id] — customer-facing order status page and the success/fail/back
 * redirect target from Finpay.
 *
 * CRITICAL (PRD §5.6 / §13.3): this page NEVER changes order state. It only
 * reads the current status from our DB. Payment truth comes from the webhook
 * (Phase 2). The `?from=success|fail|back` query param is presentational only.
 *
 * All interactive rendering (countdown, timeline, state-specific screens)
 * lives in the client component OrderStatusView; this stays a server
 * component so it can read the DB directly.
 */
import { getStore } from "@/lib/db";
import OrderStatusView from "./OrderStatusView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const store = getStore();
  const order = await store.get(id);

  if (!order) {
    return (
      <main style={{ maxWidth: 480, margin: "48px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 24 }}>Order not found</h1>
        <p style={{ color: "var(--soft)" }}>
          We couldn&apos;t find an order with id <code>{id}</code>.
        </p>
      </main>
    );
  }

  return <OrderStatusView order={order} from={from ?? null} />;
}
