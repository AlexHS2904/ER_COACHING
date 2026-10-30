# Expiration reconciliation: local worker policy

Manual worker backoff was verified against ER_COACHING with exact timestamp
comparisons before/after multiple cycles. Finite escalation and race cases are
covered in isolated automated tests. No schema or applied RPC migration is changed. The global worker may continue cycling every
five seconds; individual bookings are gated by persisted eligibility.

## Previous loop

`stripe-local-worker.mjs` calls `processPendingStripeBookings`, which first runs
`expireDueStripeHolds`. Unpaid overdue pending/cancelled bookings with a NULL
`stripe_expiration_reconciled_at` remain candidates. Previously every pass wrote
`stripe_expiration_last_attempt_at` and invoked the expiry RPC. With no proven
remote expiry, that RPC repeatedly wrote unknown/error/updated_at even if equal.
An unknown attempt with no Session never met its reconciliation condition.

## Backoff using existing fields

Age is measured from the original `payment_expires_at`; it never changes.

| Age after deadline | Minimum interval between reconciliation starts |
| --- | --- |
| Less than 5 minutes | 30 seconds |
| 5 to less than 30 minutes | 2 minutes |
| 30 minutes to less than 2 hours | 10 minutes |
| 2 hours onward | 1 hour |

The first pass is eligible immediately once overdue if no previous attempt was
recorded. Fast early intervals address transient network/webhook delays; the later
bands reduce repeated API work when ambiguity persists. Time-based bands survive
worker restarts without requiring a retry-count column. SQL filters implement the
same bands before the batch limit, so backoff rows cannot fill the batch.

An eligible pass claims its audit timestamp with a conditional update requiring
the previous timestamp, unpaid state, overdue deadline, no reconciliation and no
review. Concurrent losers perform no Stripe call. Immediate cycles do not write.
The audit timestamp is written once per actual eligible pass, not once per global
worker cycle. Its normal booking timestamp trigger remains useful audit evidence.

For cancelled unknown attempts already carrying
`expiration_requires_reconciliation`, another ambiguous result does not invoke
the expiry RPC: attempt status, error and updated_at remain untouched. Initial
cancellation, a changed attempt outcome or a proven remote expiry still uses the
existing row-locked RPC.

## Finite escalation

At 24 hours after the deadline, the next eligible pass makes one last bounded
reconciliation attempt. If uncertainty remains, the booking receives the existing
`finalization_status=review_required` with
`finalization_error=expiration_reconciliation_review_required` and no next
finalization scheduled. This flag means technical/manual review, not payment or
evidence that no Session exists.

The maximum normal additional scheduling delay is the one-hour backoff interval,
plus worker/batch processing time. If the worker or database is unavailable, no
wall-clock completion is guaranteed. Once persisted, review excludes all further
automatic expiration passes. No automatic reset or reactivation is added.

The attempt stays unknown/ambiguous, evidence and identifiers remain intact, and
`stripe_expiration_reconciled_at` remains NULL. No successor is permitted. Paid
state winning a race cannot be overwritten by the conditional review update.

## Stripe evidence and bounds

Retrieve a known Session directly. Otherwise list within the attempt creation
window: attempt.created_at minus one second through at most the original deadline
plus the two-minute creation lease, capped at now. If a PaymentIntent is known,
also pass its supported filter. Scan at most three pages of 100 Sessions; match
exact booking/attempt metadata and validate client_reference_id, Test Mode,
mode, amount, currency and any known PaymentIntent before binding/expiring.

Checkout's list API has no metadata/idempotency-key filter. Missing results,
multiple matches, an incomplete scan, identity mismatches or API failures remain
ambiguous. Never call create to retrieve an idempotent result after the deadline:
that could create a new Session if the original request never arrived. Stripe
Workbench/manual review can use the original request key and metadata separately.

An actual expired Session still follows normal cancellation/reconciliation.
Webhooks remain payment authority; expired-event replay stays idempotent. No
Calendar, Meet, email or intake work is invoked by reconciliation.

References:
- https://docs.stripe.com/api/checkout/sessions/list
- https://docs.stripe.com/api/idempotent_requests

## Verification

Isolated PostgreSQL tests exercise the real service/RPCs with a test-only query
adapter and fake Stripe transport. They reproduce ER-3052FC70 without accessing
the real booking, and cover repeated cycles, backoff boundaries/SQL filtering,
finite review, concurrent workers, starvation, identity/search limits, payment
races, ordinary expiry, slot release and duplicate expiration events.
