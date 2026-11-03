import "server-only";
import { after, NextRequest, NextResponse } from "next/server";
import { getStripeClient, getStripeConfig } from "@/lib/stripe/server";
import { applyStripeCheckoutEvent } from "@/lib/stripe/webhook";
import { finalizePaidBooking } from "@/lib/bookings/finalize-paid-booking";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let stripe;
  try { stripe = getStripeClient(); } catch {
    return NextResponse.json({ error: "El servicio de pagos no está disponible." }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret?.startsWith("whsec_")) return NextResponse.json({ error: "Firma no válida." }, { status: 400 });
  let event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
    const config = getStripeConfig();
    if (event.livemode !== (config.mode === "live") || (event.account && event.account !== config.accountId)) throw new Error("stripe_event_scope_mismatch");
  } catch {
    return NextResponse.json({ error: "Firma o evento no válido." }, { status: 400 });
  }
  try {
    const result = await applyStripeCheckoutEvent(event);
    if (result?.accepted || (result?.duplicate && result.booking_id)) after(async () => {
      // Re-delivery may recover a previous finalizer failure. Its database lease
      // and recorded effects make this safe even for completed/expired events.
      try { await finalizePaidBooking(result.booking_id); } catch {
        console.error("Stripe finalization remains queued", { bookingId: result.booking_id });
      }
    });
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "No fue posible registrar el evento. Se requiere reintento." }, { status: 500 });
  }
}
