import "server-only";
import type Stripe from "stripe";
import { getStripeBookingAdmin } from "@/lib/stripe/server";

export async function applyStripeCheckoutEvent(event: Stripe.Event) {
  if (event.livemode) throw new Error("live_event_rejected");
  if (!["checkout.session.completed", "checkout.session.expired"].includes(event.type)) return null;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.object !== "checkout.session" || session.livemode) throw new Error("invalid_session");
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const db = getStripeBookingAdmin();
  const { data, error } = await db.rpc("apply_stripe_checkout_event_v1", {
    p_event_id: event.id, p_event_type: event.type,
    p_session: {
      id: session.id, mode: session.mode, livemode: session.livemode,
      client_reference_id: session.client_reference_id, metadata: session.metadata,
      status: session.status, payment_status: session.payment_status,
      payment_intent: intent, amount_total: session.amount_total, currency: session.currency,
    },
  });
  if (error) {
    console.error("Stripe event persistence deferred", { eventId: event.id });
    throw new Error("stripe_event_persistence_failed");
  }
  return data as { booking_id: string; accepted?: boolean; duplicate?: boolean; review_required?: boolean };
}
