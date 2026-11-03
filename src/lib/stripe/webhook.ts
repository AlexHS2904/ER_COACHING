import "server-only";
import type Stripe from "stripe";
import { getStripeBookingAdmin, getVerifiedStripeContext } from "@/lib/stripe/server";

export async function applyStripeCheckoutEvent(event: Stripe.Event) {
  const { config, stripe } = await getVerifiedStripeContext();
  if (event.livemode !== (config.mode === "live") || (event.account && event.account !== config.accountId)) {
    throw new Error("stripe_event_scope_mismatch");
  }
  if (!["checkout.session.completed", "checkout.session.expired"].includes(event.type)) return null;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.object !== "checkout.session" || session.livemode !== event.livemode ||
      session.metadata?.stripe_mode !== config.mode || session.metadata?.stripe_account_id !== config.accountId ||
      !session.payment_method_types?.length || session.payment_method_types.some((method) => !["card", "link"].includes(method))) {
    throw new Error("invalid_session");
  }
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  let receipt = null;
  if (event.type === "checkout.session.completed") {
    if (session.status !== "complete" || session.payment_status !== "paid" || !intent) throw new Error("stripe_payment_not_settled");
    const payment = await stripe.paymentIntents.retrieve(intent, { expand: ["latest_charge"] });
    const charge = payment.latest_charge;
    if (payment.id !== intent || payment.status !== "succeeded" || payment.livemode !== event.livemode ||
        payment.amount !== session.amount_total || payment.amount_received !== session.amount_total || payment.currency !== session.currency ||
        payment.metadata.booking_id !== session.metadata.booking_id ||
        payment.metadata.payment_attempt_id !== session.metadata.payment_attempt_id ||
        payment.metadata.booking_reference !== session.metadata.booking_reference ||
        payment.metadata.stripe_mode !== config.mode || payment.metadata.stripe_account_id !== config.accountId ||
        !charge || typeof charge === "string" || !["card", "link"].includes(charge.payment_method_details?.type ?? "")) {
      throw new Error("stripe_payment_receipt_mismatch");
    }
    receipt = { id: payment.id, status: payment.status, amount: payment.amount, amount_received: payment.amount_received,
      currency: payment.currency, livemode: payment.livemode, metadata: payment.metadata };
  }
  const db = getStripeBookingAdmin();
  const { data, error } = await db.rpc("apply_stripe_checkout_event_v2", {
    p_event_id: event.id, p_event_type: event.type,
    p_stripe_mode: config.mode, p_stripe_account_id: config.accountId,
    p_session: {
      id: session.id, mode: session.mode, livemode: session.livemode,
      client_reference_id: session.client_reference_id, metadata: session.metadata,
      status: session.status, payment_status: session.payment_status,
      payment_intent: intent, amount_total: session.amount_total, currency: session.currency,
      payment_method_types: session.payment_method_types, verified_payment_intent: receipt,
    },
  });
  if (error) {
    console.error("Stripe event persistence deferred", { eventId: event.id });
    throw new Error("stripe_event_persistence_failed");
  }
  return data as { booking_id: string; accepted?: boolean; duplicate?: boolean; review_required?: boolean };
}
