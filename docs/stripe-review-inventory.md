# Stripe final review inventory

Status: historical cleanup inventory, superseded by the applied UX changes in [stripe-public-ux.md](stripe-public-ux.md). All four migrations are applied in ER_COACHING and their canonical LOCAL/REMOTE history is aligned. The final UX E2E passed; reminder delivery was covered by 77 isolated tests. Do not reapply migrations. No commit, push or deploy performed.

## Previous cleanup validation (before the UX iteration)

- Full suite: 222/222 passed.
- TypeScript and sanitized npm build passed; expected localhost database warnings during prerender only.
- git diff --check passed.
- Three applied migrations are byte-identical to the authorized application copies.
- Runtime fault injection removed. The retired STRIPE_E2E_ configuration is rejected.
- Deterministic classifier and failed-to-successor POST/SQL tests retained with a tests-only SDK transport.
- No remote database writes or business tests were executed during cleanup.

## Previous cleanup candidate files

14 tracked modifications and 44 new files, 58 total candidates.

### Modified tracked files

- `.gitignore`
- `src/app/api/admin/payments/mark-paid/route.ts`
- `src/app/api/bookings/[id]/cancel/route.ts`
- `src/app/api/bookings/[id]/reschedule/route.ts`
- `src/app/api/bookings/route.ts`
- `src/app/api/google/callback/route.ts`
- `src/app/api/processes/[token]/sessions/route.ts`
- `src/app/reservar/confirmada/page.tsx`
- `src/app/reservar/page.tsx`
- `src/components/publico/reservar/BookingFlow.tsx`
- `src/lib/email/send-booking-emails.tsx`
- `src/lib/google/calendar.ts`
- `tests/activate-booking-intake-v2.test.mjs`
- `tests/activate-booking-intake.test.mjs`

### New files

- `.env.example`
- `docs/stripe-deterministic-errors.md`
- `docs/stripe-expiration-reconciliation.md`
- `docs/stripe-failed-retry-e2e.md`
- `docs/stripe-local-test.md`
- `docs/stripe-review-inventory.md`
- `scripts/build-stripe-test.mjs`
- `scripts/dev-stripe-test.mjs`
- `scripts/replay-stripe-test-event.mjs`
- `scripts/stripe-local-worker.mjs`
- `src/app/api/bookings/stripe/checkout/route.ts`
- `src/app/api/internal/stripe/process-pending/route.ts`
- `src/app/api/webhooks/stripe/route.ts`
- `src/components/publico/reservar/BookingStatusActions.tsx`
- `src/lib/bookings/confirmation-state.ts`
- `src/lib/bookings/finalize-paid-booking.ts`
- `src/lib/stripe/access.ts`
- `src/lib/stripe/browser-flow.ts`
- `src/lib/stripe/checkout-creation-error.ts`
- `src/lib/stripe/checkout.ts`
- `src/lib/stripe/errors.ts`
- `src/lib/stripe/expiration-reconciliation-policy.ts`
- `src/lib/stripe/expire-hold.ts`
- `src/lib/stripe/money.ts`
- `src/lib/stripe/process-pending.ts`
- `src/lib/stripe/server.ts`
- `src/lib/stripe/webhook.ts`
- `supabase/migrations/20261028000100_stripe_test_booking_lifecycle.sql`
- `supabase/migrations/20261028000200_intake_v2_stable_service_identity.sql`
- `supabase/migrations/20261028201527_stripe_failed_attempt_recovery.sql`
- `tests/fixtures/stripe-local-schema.sql`
- `tests/helpers/load-typescript.mjs`
- `tests/helpers/local-postgres.mjs`
- `tests/helpers/local-supabase-query.mjs`
- `tests/helpers/stripe-checkout-transport.mjs`
- `tests/stripe-checkout-creation-error.test.mjs`
- `tests/stripe-checkout-transport.test.mjs`
- `tests/stripe-expiration-reconciliation.test.mjs`
- `tests/stripe-failed-recovery.test.mjs`
- `tests/stripe-isolated-dev.test.mjs`
- `tests/stripe-postgres.test.mjs`
- `tests/stripe-preflight.test.mjs`
- `tests/stripe-public-flow.test.mjs`
- `tests/stripe-services.test.mjs`

### New-to-Git migrations (already applied; do not reapply)

- `supabase/migrations/20261028000100_stripe_test_booking_lifecycle.sql`
- `supabase/migrations/20261028000200_intake_v2_stable_service_identity.sql`
- `supabase/migrations/20261028201527_stripe_failed_attempt_recovery.sql`

### New scripts

- `scripts/build-stripe-test.mjs`
- `scripts/dev-stripe-test.mjs`
- `scripts/replay-stripe-test-event.mjs`
- `scripts/stripe-local-worker.mjs`

### New documentation

- `docs/stripe-deterministic-errors.md`
- `docs/stripe-expiration-reconciliation.md`
- `docs/stripe-failed-retry-e2e.md`
- `docs/stripe-local-test.md`
- `docs/stripe-review-inventory.md`

## Include/exclude

Include the reviewed candidate files above, including the empty/sanitized .env.example and applied migration source files. No private configuration is included.

Exclude .env.local, .env.stripe-test, all private .env files, .next/, node_modules/, generated next-env.d.ts, .DS_Store, logs and temporary isolated build/dev copies. No debug logs or one-shot permit artifacts were found in the candidate set. The retired runtime helper and its gate tests were removed, not retained as application code.

## Security review

208 text files reviewed. 0 suspected real secret/direct-sensitive-log findings. Exact test-secret values were compared internally without output or copying. One dummy username-only URL remains in a negative test; it is not a credential. Google API/OAuth raw error objects were removed from the identified logging boundaries. .env.local was never opened. .env.stripe-test remains ignored and untracked. Staged file count: 0.

## Manual Test Mode outcomes

Happy path, exact replay/idempotency, declined card, 30-minute expiry, worker backoff and deterministic failure-to-successor: verified. Recovered successor payment/finalization: RECOVERED PAYMENT FUNCTIONALLY VERIFIED.

Documentary limits: no exact pre-payment Session ID fingerprint; no direct Google Calendar event-count query. These are not functional failures.

## Suggested commit

Prefer one atomic commit because runtime, migrations, tests and tools depend on each other:

feat: integrate Stripe Test Checkout with safe recovery and reconciliation

Group the review into financial lifecycle/RPCs, paid finalization and access controls, reconciliation/backoff, then tools/tests/security/documentation. Do not apply the already installed migrations again as part of committing.
