# Edna Rojo Coaching

Production coaching platform built with Next.js App Router, TypeScript and Tailwind.

Backend and integrations:
- Supabase Postgres
- Supabase Auth for admin access
- Resend for transactional email
- Google Calendar + Google Meet
- Stripe integration in progress
- Vercel deployment

## Repository rules

- Never expose, print, copy or commit secrets from `.env.local`.
- Never commit `.env.local`.
- Never push to Git unless explicitly requested.
- Do not deploy unless explicitly requested.
- Run `npm run build` after significant code changes.
- Fix TypeScript/build errors introduced by your changes before considering a task complete.
- Prefer existing helpers and architecture over duplicate logic.
- Inspect related existing code before introducing new abstractions.
- Keep public APIs and existing user flows backward compatible unless the task explicitly requires a breaking change and explain why is explicitly required.
- Do not make unrelated refactors while implementing a scoped feature.

## Security

- Sensitive operations must be validated server-side.
- Never trust payment state, prices, booking ownership or authorization supplied by the browser.
- Never expose Supabase service-role credentials or Stripe secret keys to client components.
- Admin routes must use the existing admin authorization helpers.
- Public token-based flows must use cryptographically secure tokens.
- Store token hashes for validation; do not store raw access tokens unless encrypted specifically for admin recovery.

## Payments

Stripe webhooks are the source of truth for payment confirmation.

- Never mark a booking as paid from a success page or client request.
- Payment amounts must be determined server-side from trusted service/booking data.
- Webhook handlers must verify Stripe signatures.
- Webhook processing must be idempotent.
- A duplicated Stripe event must not create duplicate payments, intakes, emails or side effects.
- Store Stripe identifiers needed for reconciliation and debugging.

For a paid 1:1 booking:
- reuse the existing booking;
- reuse or create exactly one intake for that booking;
- use the same intake token for the post-payment redirect, email link and admin access;
- never create duplicate intake tokens for the same booking.

## Intake system

`booking_intake_forms` supports:
- booking-based forms;
- manual invitations;
- private token access;
- encrypted token recovery for admin;
- progress saving;
- expiration/revocation;
- one final submission.

An intake may be opened multiple times while active so the user can continue progress.

After submission:
- `status` must be `submitted`;
- `submitted_at` must be set;
- it must not accept another final submission.

Manual invitations do not require a booking or payment.

Booking-based intakes require the associated booking to be eligible and paid.

## Email

- Use the existing Resend helpers and email-component conventions.
- Saving business-critical data must not depend on email delivery succeeding.
- If an email fails after data has been saved, preserve the data and record/report the email failure.
- Use the invitee/customer email as `replyTo` when appropriate, but never as the sender identity.

## Google Calendar

- Reuse the existing Google Calendar integration.
- Do not create duplicate Calendar events for the same booking.
- Preserve existing Meet links and event IDs when updating bookings.

## Database

- Use the existing Supabase admin helper for trusted server-side operations.
- Respect existing RLS policies.
- Schema changes should be additive and backward compatible when possible.
- Do not silently delete production data.
- Prefer idempotent migrations (`if not exists`, safe constraint handling) when appropriate.

## Git

Before suggesting a commit:
- run `npm run build`;
- inspect `git status`;
- ensure `.env.local` and secrets are not staged.

Do not commit or push unless explicitly requested.