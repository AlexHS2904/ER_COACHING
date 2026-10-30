import "server-only";
import type Stripe from "stripe";
import { getStripeBookingAdmin, getStripeTestClient } from "@/lib/stripe/server";
import { hasBookingAccess, hashBookingAccess, isBookingId } from "@/lib/stripe/access";
import { StripeBookingError } from "@/lib/stripe/errors";
import { toStripeMinorUnits } from "@/lib/stripe/money";
import { applyStripeCheckoutEvent } from "@/lib/stripe/webhook";
import { finalizePaidBooking } from "@/lib/bookings/finalize-paid-booking";
import { bookingIntakeDestination } from "@/lib/bookings/intake-destination";

const BOOKING_COLUMNS = "id,booking_reference,created_at,status,payment_status,payment_flow,finalization_status,next_finalization_at,expired_at,payment_expires_at,booking_access_token_hash,price_snapshot,currency_snapshot,legal_terms_accepted_at,legal_terms_version,legal_privacy_notice_version,legal_adult_confirmed_at";
const MAX_EVENT_PAGES = 3;

export type OwnedStripeBooking = {
  id: string;
  booking_reference: string;
  created_at: string;
  status: string;
  payment_status: string;
  payment_flow: string;
  finalization_status: string | null;
  next_finalization_at: string | null;
  expired_at: string | null;
  payment_expires_at: string;
  booking_access_token_hash: string;
  price_snapshot: string | number;
  currency_snapshot: string;
  legal_terms_accepted_at: string | null;
  legal_terms_version: string | null;
  legal_privacy_notice_version: string | null;
  legal_adult_confirmed_at: string | null;
};

type ReturnAttempt = {
  id: string;
  booking_id: string;
  created_at: string;
  amount_minor: string | number;
  currency: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
};

export type CheckoutReturnObservation = "paid" | "processing" | "unpaid" | "unknown";

// This lookup is shared by the return and retry routes. A booking reference or
// Stripe Session ID is never an access credential, even for an already paid row.
export async function getOwnedStripeBooking(bookingId: string, accessToken: unknown): Promise<OwnedStripeBooking> {
  if (!isBookingId(bookingId)) throw new StripeBookingError("invalid_access");
  let accessHash: string;
  try { accessHash = hashBookingAccess(accessToken); }
  catch { throw new StripeBookingError("invalid_access"); }
  const result = await getStripeBookingAdmin().from("bookings").select(BOOKING_COLUMNS)
    .eq("id", bookingId).eq("booking_access_token_hash", accessHash).maybeSingle();
  if (result.error) throw new StripeBookingError("checkout_unavailable");
  if (!result.data || result.data.id !== bookingId || result.data.payment_flow !== "stripe" ||
      !hasBookingAccess(accessToken, result.data.booking_access_token_hash)) {
    throw new StripeBookingError("invalid_access");
  }
  return result.data as OwnedStripeBooking;
}

function paymentIntentId(session: Stripe.Checkout.Session) {
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
}

function assertSessionIdentity(session: Stripe.Checkout.Session, booking: OwnedStripeBooking, attempt: ReturnAttempt) {
  let amount: number;
  try { amount = toStripeMinorUnits(booking.price_snapshot, booking.currency_snapshot); }
  catch { throw new StripeBookingError("review_required"); }
  const intent = paymentIntentId(session);
  if (session.object !== "checkout.session" || session.livemode !== false || session.mode !== "payment" ||
      session.id !== attempt.stripe_checkout_session_id || attempt.booking_id !== booking.id ||
      session.client_reference_id !== booking.id || session.metadata?.booking_id !== booking.id ||
      session.metadata?.payment_attempt_id !== attempt.id ||
      session.metadata?.booking_reference !== booking.booking_reference ||
      String(attempt.amount_minor) !== String(amount) || session.amount_total !== amount ||
      attempt.currency !== booking.currency_snapshot.toLowerCase() || session.currency !== attempt.currency ||
      (attempt.stripe_payment_intent_id !== null && intent !== attempt.stripe_payment_intent_id)) {
    throw new StripeBookingError("invalid_access");
  }
}

async function completedEventForSession(
  stripe: Stripe, session: Stripe.Checkout.Session, booking: OwnedStripeBooking, attempt: ReturnAttempt,
): Promise<Stripe.Event | null> {
  const createdAt = Date.parse(attempt.created_at);
  if (!Number.isFinite(createdAt)) return null;
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < MAX_EVENT_PAGES; pageNumber++) {
    const page = await stripe.events.list({
      type: "checkout.session.completed", limit: 100,
      created: { gte: Math.floor(createdAt / 1000) - 60, lte: Math.ceil(Date.now() / 1000) + 60 },
      ...(cursor ? { starting_after: cursor } : {}),
    });
    for (const event of page.data) {
      if (event.type !== "checkout.session.completed") continue;
      const eventSession = event.data.object as Stripe.Checkout.Session;
      if (eventSession.id !== session.id) continue;
      if (event.livemode !== false || !/^evt_[A-Za-z0-9]+$/.test(event.id)) {
        throw new StripeBookingError("invalid_access");
      }
      assertSessionIdentity(eventSession, booking, attempt);
      if (eventSession.status !== "complete" || eventSession.payment_status !== "paid" ||
          paymentIntentId(eventSession) !== paymentIntentId(session)) {
        throw new StripeBookingError("invalid_access");
      }
      return event;
    }
    if (!page.has_more || !page.data.length) break;
    cursor = page.data[page.data.length - 1].id;
  }
  return null;
}

// The return verifies Stripe server-side, then consumes the actual Stripe Event
// through the SAME financial ledger as the webhook. Never fabricate an event ID
// or mark a booking paid from browser data. The shared finalizer retains its
// lease, Calendar identity, Resend keys and existing intake/token recovery.
export async function reconcileStripeCheckoutReturn(bookingId: string, accessToken: unknown, sessionId?: string) {
  let booking = await getOwnedStripeBooking(bookingId, accessToken);
  const db = getStripeBookingAdmin();
  if (sessionId !== undefined && !/^cs_test_[A-Za-z0-9]+$/.test(sessionId)) {
    throw new StripeBookingError("invalid_access");
  }
  let query = db.from("booking_payment_attempts")
    .select("id,booking_id,created_at,amount_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id")
    .eq("booking_id", booking.id);
  query = sessionId !== undefined
    ? query.eq("stripe_checkout_session_id", sessionId)
    : query.not("stripe_checkout_session_id", "is", null).order("created_at", { ascending: false }).limit(1);
  const result = await query.maybeSingle();
  if (result.error) throw new StripeBookingError("checkout_unavailable");
  const attempt = result.data as ReturnAttempt | null;
  if (sessionId !== undefined && !attempt) throw new StripeBookingError("invalid_access");
  let observation: CheckoutReturnObservation = booking.payment_status === "paid" ? "paid" : "unpaid";

  if (booking.payment_status !== "paid" && attempt) {
    let stripe: Stripe;
    let session: Stripe.Checkout.Session;
    try {
      stripe = getStripeTestClient();
      session = await stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id);
    } catch {
      return { booking, intake: await bookingIntakeDestination(booking, accessToken), observation: "unknown" as const };
    }
    assertSessionIdentity(session, booking, attempt);
    if (session.status === "complete" && session.payment_status === "paid") {
      if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId(session) ?? "")) throw new StripeBookingError("invalid_access");
      // A paid observation suppresses another Checkout even if Stripe's Event
      // listing is momentarily unavailable. Polling may recover it safely.
      observation = "processing";
      try {
        const event = await completedEventForSession(stripe, session, booking, attempt);
        if (event) {
          const applied = await applyStripeCheckoutEvent(event);
          if (applied?.booking_id && applied.booking_id !== booking.id) throw new StripeBookingError("invalid_access");
          booking = await getOwnedStripeBooking(bookingId, accessToken);
        }
      } catch (error) {
        if (error instanceof StripeBookingError) throw error;
        // Temporary Stripe/ledger failures preserve uncertainty and never
        // expose the provider error or permit a fresh charge.
      }
      if (booking.payment_status === "paid") observation = "paid";
    } else if (session.status === "complete" || session.payment_status !== "unpaid") {
      observation = "processing";
    }
  }

  // Browser refreshes must respect the same persisted retry deadline as the
  // worker. A retryable row without a usable deadline remains for recovery;
  // polling must not acquire leases or contact providers every few seconds.
  const finalizationDue = booking.next_finalization_at == null
    ? booking.finalization_status !== "retryable"
    : Number.isFinite(Date.parse(booking.next_finalization_at)) && Date.parse(booking.next_finalization_at) <= Date.now();
  if (booking.payment_status === "paid" && booking.status !== "cancelled" && finalizationDue &&
      !["completed", "review_required"].includes(booking.finalization_status ?? "")) {
    try { await finalizePaidBooking(booking.id); } catch {
      // Finalizer leases and persisted outcomes support a later authorized
      // refresh/webhook/worker. A return must never create another payment.
    }
    booking = await getOwnedStripeBooking(bookingId, accessToken);
  }
  return { booking, intake: await bookingIntakeDestination(booking, accessToken), observation };
}
