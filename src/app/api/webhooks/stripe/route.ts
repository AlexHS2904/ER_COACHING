import "server-only";
import { after, NextRequest, NextResponse } from "next/server";
import { getStripeTestClient } from "@/lib/stripe/server";
import { applyStripeCheckoutEvent } from "@/lib/stripe/webhook";
import { finalizePaidBooking } from "@/lib/bookings/finalize-paid-booking";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let stripe;
  try { stripe = getStripeTestClient(); } catch {
    return NextResponse.json({ error: "Stripe Test Mode no está configurado." }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret?.startsWith("whsec_")) return NextResponse.json({ error: "Firma no válida." }, { status: 400 });
  let event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
    if (event.livemode) throw new Error("live_event_rejected");
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
