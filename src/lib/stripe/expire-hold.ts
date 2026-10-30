import "server-only";
import type Stripe from "stripe";
import { getStripeBookingAdmin, getStripeTestClient } from "@/lib/stripe/server";
import { rpcError } from "@/lib/stripe/errors";
import { expirationReconciliationFilter, expirationReconciliationPolicy } from "@/lib/stripe/expiration-reconciliation-policy";

const MAX_RECONCILIATION_PAGES = 3;
const CREATION_LEASE_MS = 2 * 60_000;

export async function expireStripeBookingHold(bookingId: string, expectedAttemptId?: string, now = Date.now()) {
  const db = getStripeBookingAdmin();
  const { data: booking, error } = await db.from("bookings")
    .select("id,payment_flow,payment_status,status,payment_expires_at,finalization_status,stripe_expiration_last_attempt_at,stripe_expiration_reconciled_at")
    .eq("id", bookingId).maybeSingle();
  rpcError(error);
  if (!booking || booking.payment_flow !== "stripe" || booking.payment_status !== "pending" ||
      !["pending", "cancelled"].includes(booking.status) || booking.finalization_status === "review_required" ||
      booking.stripe_expiration_reconciled_at !== null) return false;
  const policy = expirationReconciliationPolicy(booking.payment_expires_at, booking.stripe_expiration_last_attempt_at, now);
  if (!policy.due) return false;
  const { data: attempt, error: attemptError } = await db.from("booking_payment_attempts")
    .select("*").eq("booking_id", bookingId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  rpcError(attemptError);
  if (expectedAttemptId && attempt?.id !== expectedAttemptId) return false;
  // Claim this eligible pass with a compare-and-set on the persisted timestamp.
  // Another worker, webhook, paid booking or completed reconciliation wins safely.
  const stamp = new Date(now).toISOString();
  let auditQuery = db.from("bookings").update({ stripe_expiration_last_attempt_at: stamp })
    .eq("id", bookingId).eq("payment_flow", "stripe").eq("payment_status", "pending")
    .in("status", ["pending", "cancelled"]).neq("finalization_status", "review_required")
    .is("stripe_expiration_reconciled_at", null).lte("payment_expires_at", stamp);
  auditQuery = booking.stripe_expiration_last_attempt_at === null
    ? auditQuery.is("stripe_expiration_last_attempt_at", null)
    : auditQuery.eq("stripe_expiration_last_attempt_at", booking.stripe_expiration_last_attempt_at);
  const audit = await auditQuery.select("id").maybeSingle();
  rpcError(audit.error);
  if (!audit.data) return false;
  let remoteExpired = false;
  try {
    if (attempt) {
      const stripe = getStripeTestClient();
      let session: Stripe.Checkout.Session | null = attempt.stripe_checkout_session_id
        ? await stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id) : null;
      if (!session) {
        // Never call create after the deadline: even the original key could
        // create a Session if the timed-out request never reached Stripe.
        // No metadata/idempotency-key search exists for Checkout Sessions. Bound
        // the date range and page count; no matches is NOT proof of noncreation.
        let cursor: string | undefined;
        for (let pageNumber = 0; pageNumber < MAX_RECONCILIATION_PAGES; pageNumber++) {
          const page: Stripe.ApiList<Stripe.Checkout.Session> = await stripe.checkout.sessions.list({
            created: {
              gte: Math.floor(Date.parse(attempt.created_at) / 1000) - 1,
              lte: Math.floor(Math.min(now, Date.parse(booking.payment_expires_at) + CREATION_LEASE_MS) / 1000),
            },
            ...(attempt.stripe_payment_intent_id ? { payment_intent: attempt.stripe_payment_intent_id } : {}),
            limit: 100, ...(cursor ? { starting_after: cursor } : {}),
          });
          for (const candidate of page.data) {
            if (candidate.metadata?.booking_id === bookingId && candidate.metadata?.payment_attempt_id === attempt.id) {
              if (session) throw new Error("ambiguous_sessions");
              session = candidate;
            }
          }
          if (!page.has_more) break;
          if (pageNumber === MAX_RECONCILIATION_PAGES - 1 || !page.data.length) throw new Error("reconciliation_search_incomplete");
          cursor = page.data[page.data.length - 1].id;
        }
      }
      if (session) {
        const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
        if (session.livemode || session.mode !== "payment" || session.client_reference_id !== bookingId ||
            session.metadata?.booking_id !== bookingId || session.metadata?.payment_attempt_id !== attempt.id ||
            (attempt.stripe_payment_intent_id && intentId !== attempt.stripe_payment_intent_id) ||
            BigInt(session.amount_total ?? -1) !== BigInt(attempt.amount_minor) || session.currency !== attempt.currency) throw new Error("reconciliation_identity_mismatch");
        if (!attempt.stripe_checkout_session_id) {
          const { error: bindError } = await db.from("booking_payment_attempts")
            .update({ stripe_checkout_session_id: session.id, stripe_expires_at: new Date(session.expires_at * 1000).toISOString() })
            .eq("id", attempt.id).is("stripe_checkout_session_id", null);
          rpcError(bindError);
        }
        if (session.status === "open") session = await stripe.checkout.sessions.expire(session.id);
        remoteExpired = session.status === "expired" && session.payment_status !== "paid";
      }
      // A completed session is NOT financial authority here: await its signed
      // webhook. Expiration may win locally; a late receipt is kept for review.
    }
  } catch {
    console.error("Stripe hold expiration needs reconciliation", { bookingId, attemptId: attempt?.id });
  }
  // The unchanged RPC rewrites unknown/error/updated_at even when equal. Call it
  // only for a real local cancellation, changed attempt outcome or reconciliation.
  const attemptNeedsChange = attempt && ["creating", "unknown", "open"].includes(attempt.status) &&
    (attempt.status !== "unknown" || attempt.last_error !== "expiration_requires_reconciliation");
  let changed = false;
  if (booking.status === "pending" || remoteExpired || !attempt || attemptNeedsChange) {
    const result = await db.rpc("expire_stripe_booking_hold_v1", {
      p_booking_id: bookingId, p_attempt_id: attempt?.id ?? null, p_remote_expired: remoteExpired,
    });
    rpcError(result.error);
    changed = Boolean(result.data);
  }
  if (attempt && !remoteExpired && policy.reviewDue) {
    // Technical review is already supported by the schema and excluded by both
    // the worker and Checkout claim. It does not assert nonpayment/noncreation.
    const review = await db.from("bookings").update({
      finalization_status: "review_required", finalization_error: "expiration_reconciliation_review_required",
      next_finalization_at: null,
    }).eq("id", bookingId).eq("payment_flow", "stripe").eq("payment_status", "pending")
      .in("status", ["pending", "cancelled"]).neq("finalization_status", "review_required")
      .is("stripe_expiration_reconciled_at", null).eq("stripe_expiration_last_attempt_at", stamp)
      .select("id").maybeSingle();
    rpcError(review.error);
    changed = changed || Boolean(review.data);
  }
  return changed;
}

export async function expireDueStripeHolds(now = Date.now()) {
  const db = getStripeBookingAdmin();
  const { data, error } = await db.from("bookings").select("id")
    .eq("payment_flow", "stripe").eq("payment_status", "pending")
    .is("stripe_expiration_reconciled_at", null)
    .neq("finalization_status", "review_required")
    .in("status", ["pending", "cancelled"]).lte("payment_expires_at", new Date(now).toISOString())
    .or(expirationReconciliationFilter(now))
    .order("stripe_expiration_last_attempt_at", { ascending: true, nullsFirst: true })
    .order("payment_expires_at").limit(10);
  rpcError(error);
  for (const booking of data ?? []) await expireStripeBookingHold(booking.id, undefined, now);
}
