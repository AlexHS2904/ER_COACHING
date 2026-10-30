# Failed attempt recovery — completed E2E record

Status: RECOVERED PAYMENT FUNCTIONALLY VERIFIED (28-10-2026).

A temporary local fault mechanism was used for this manual test and has now been
removed from application code and the isolated launcher. The retired
`STRIPE_E2E_FORCE_CREATE_FAILURE` variable is neither required nor accepted.
Remove any obsolete STRIPE_E2E_ entries from local test configuration before
starting the launcher. No runtime permit, marker or alternate Stripe client remains.

## Observed results

For technical reference ER-48A5DE22:

- Initial creation rejection traversed the normal POST route, SDK classification
  and failure RPC. Attempt #1 was failed/rejected, without Session or PaymentIntent.
- Recovery reused the exact booking ID/reference, created_at and 30-minute deadline.
- A new UUID/key produced attempt #2, open/succeeded with a Checkout Session.
- The complete fingerprint of attempt #1 remained unchanged; exactly one attempt
  was active before payment.
- Payment changed attempt #2 to paid and left zero active attempts. The booking
  became paid/confirmed, with Calendar ID, Meet, delivered customer/coach emails,
  one intake and its sent email, and finalization completed without error.
- Attempt #1 remained failed/rejected with its complete evidence unchanged.
- The payment event matched attempt #2's current Session and PaymentIntent.

## Documentary limitations

The exact pre-payment Session ID/fingerprint was not captured. Its precise equality
across payment therefore was not demonstrated by an exact baseline comparison.
Supabase confirmed a Calendar ID and Meet; no direct count of Google Calendar
events was performed. These are evidence limitations, not observed functional
failures. The E2E is accepted as functionally verified and will not be repeated
solely for these limitations.

## Automated coverage retained

`tests/helpers/stripe-checkout-transport.mjs` supplies a network-free SDK transport
only to tests. It can return a deterministic 400 before creating a simulated
Session, then allow a successor. The real POST handler, classifier, service and
local SQL RPCs run in the integration test. The application has no import from
this helper and no environment switch for injection.

The remaining classifier, ambiguity preservation, successor/lease protection,
immutable deadline, Dynamic Payment Methods, webhook idempotency and worker
backoff/review policies remain enabled as before. No applied migration changed.
