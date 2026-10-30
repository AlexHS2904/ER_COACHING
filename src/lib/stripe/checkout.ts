import "server-only";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { getStripeBookingAdmin, getStripeTestClient, getStripeTestSiteUrl } from "@/lib/stripe/server";
import { rpcError, StripeBookingError } from "@/lib/stripe/errors";
import { toStripeMinorUnits } from "@/lib/stripe/money";
import { expireStripeBookingHold } from "@/lib/stripe/expire-hold";
import { classifyCheckoutCreationError } from "@/lib/stripe/checkout-creation-error";

export async function createOrRecoverCheckout(bookingId: string, accessHash: string) {
  const stripe = getStripeTestClient();
  const db = getStripeBookingAdmin();
  const owner = randomUUID();
  const { data, error } = await db.rpc("claim_stripe_checkout_v1", {
    p_booking_id: bookingId, p_access_token_hash: accessHash, p_owner: owner,
    p_site_url: getStripeTestSiteUrl(),
  });
  rpcError(error);
  const { booking, attempt } = data;
  const amount = toStripeMinorUnits(String(booking.price_snapshot), booking.currency_snapshot);
  if (BigInt(attempt.amount_minor) !== BigInt(amount)) throw new StripeBookingError("review_required");
  let session: Stripe.Checkout.Session;
  // Persisted RPC payloads may contain the pre-Endive option. Checkout now
  // selects Dynamic Payment Methods from Dashboard. Keep stored retries intact.
  const checkoutPayload = { ...attempt.checkout_payload };
  delete checkoutPayload.payment_method_types;
  const recordFailure = async (result: ReturnType<typeof classifyCheckoutCreationError>) => {
    const recorded = await db.rpc("record_stripe_checkout_failure_v1", {
      p_booking_id: booking.id, p_attempt_id: attempt.id, p_owner: owner,
      p_status: result.status, p_error: result.last_error,
    });
    // A stale lease or an already bound Session is a safe no-op. Database errors
    // must not be mistaken for a recorded rejection: dispatch remains ambiguous.
    rpcError(recorded.error);
  };
  const unknown = { status: "unknown", last_error: "stripe_request_unknown" } as const;
  if (attempt.stripe_checkout_session_id) {
    try {
      session = await stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id);
    } catch {
      // A retrieval error cannot establish failed creation. Keep the known ID.
      throw new StripeBookingError("checkout_unavailable");
    }
  } else {
    const dispatch = await db.rpc("begin_stripe_checkout_creation_v1", {
      p_booking_id: booking.id, p_attempt_id: attempt.id, p_owner: owner,
    });
    rpcError(dispatch.error);
    if (typeof dispatch.data !== "boolean") throw new StripeBookingError("checkout_unavailable");
    const key = `booking-checkout/${attempt.id}`;
    let requests = 0;
    // Public SDK events count physical sends, including internal retries. Even
    // maxNetworkRetries=0 may retry closed sockets, so retain the current config.
    const onRequest = (event: Stripe.RequestEvent) => {
      if (event.idempotency_key === key && event.method === "POST" &&
          event.path === "/v1/checkout/sessions") requests++;
    };
    stripe.on("request", onRequest);
    try {
      session = await stripe.checkout.sessions.create(checkoutPayload, { idempotencyKey: key });
    } catch (error) {
      await recordFailure(classifyCheckoutCreationError(error, {
        operation: "create",
        priorOutcome: dispatch.data && requests === 1 ? "no_session" : "unknown",
      }));
      throw new StripeBookingError("checkout_unavailable");
    } finally {
      stripe.off("request", onRequest);
    }
  }
  const matches = !session.livemode && session.mode === "payment" &&
    session.client_reference_id === booking.id &&
    session.metadata?.booking_id === booking.id &&
    session.metadata?.payment_attempt_id === attempt.id &&
    session.metadata?.booking_reference === booking.booking_reference &&
    session.amount_total === amount && session.currency === attempt.currency;
  if (!matches) throw new StripeBookingError("review_required");
  // A recovered, completed Session must enter the shared payment-return path;
  // never persist it as open or create a replacement charge.
  if (attempt.stripe_checkout_session_id) {
    if (session.payment_status === "paid") throw new StripeBookingError("already_paid");
    if (session.status !== "open" || !session.url) throw new StripeBookingError("checkout_unavailable");
  }
  let saved;
  try {
    saved = await db.rpc("save_stripe_checkout_v1", {
      p_booking_id: booking.id, p_attempt_id: attempt.id, p_owner: owner,
      p_session_id: session.id, p_expires_at: new Date(session.expires_at * 1000).toISOString(),
    });
    rpcError(saved.error);
  } catch {
    // Stripe already returned a real Session. Even an InvalidRequestError here
    // belongs to persistence, not creation. Recover with the same attempt/key.
    await recordFailure(unknown);
    throw new StripeBookingError("checkout_unavailable");
  }
  if (!saved.data) {
    await expireStripeBookingHold(booking.id, attempt.id);
    throw new StripeBookingError("hold_expired");
  }
  // An idempotency replay may recover a previously unbound Session that is
  // already complete. Bind its identity first so the real event can reconcile.
  if (session.payment_status === "paid") throw new StripeBookingError("already_paid");
  if (session.status !== "open" || !session.url) throw new StripeBookingError("checkout_unavailable");
  const url = new URL(session.url);
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new StripeBookingError("checkout_unavailable");
  return { url: session.url };
}
