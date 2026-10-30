import Stripe from "stripe";

type CreationContext = {
  operation: "create" | "retrieve";
  // This must describe the entire attempt, not just the last HTTP request.
  // A stale lease or an earlier timeout is not evidence of no prior Session.
  priorOutcome: "no_session" | "unknown" | "session_exists";
};

type Classification = {
  status: "failed" | "unknown";
  last_error: "stripe_invalid_request" | "stripe_authentication_failed" |
    "stripe_permission_denied" | "stripe_request_unknown";
};

/** Requires durable dispatch provenance and exactly one SDK send for no_session. */
export function classifyCheckoutCreationError(
  error: unknown,
  context: CreationContext,
): Classification {
  const ambiguous = { status: "unknown", last_error: "stripe_request_unknown" } as const;
  if (context.operation !== "create" || context.priorOutcome !== "no_session" ||
      !(error instanceof Stripe.errors.StripeError)) return ambiguous;

  // An error carrying payment objects, contention, or retry advice cannot prove
  // that nothing was created. Never persist raw messages/keys/customer details.
  if (error.payment_intent || error.setup_intent || error.charge ||
      error.code === "idempotency_key_in_use" || error.code === "lock_timeout" ||
      error.headers?.["stripe-should-retry"] === "true") return ambiguous;

  if (error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.rawType === "invalid_request_error" && error.statusCode === 400) {
    return { status: "failed", last_error: "stripe_invalid_request" };
  }
  if (error instanceof Stripe.errors.StripeAuthenticationError && error.statusCode === 401) {
    return { status: "failed", last_error: "stripe_authentication_failed" };
  }
  if (error instanceof Stripe.errors.StripePermissionError && error.statusCode === 403) {
    return { status: "failed", last_error: "stripe_permission_denied" };
  }
  return ambiguous;
}
