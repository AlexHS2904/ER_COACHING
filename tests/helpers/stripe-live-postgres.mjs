// Shared isolated fixture setup for Live/Test lifecycle tests. Never remote.
export const liveFixture = new URL('../fixtures/stripe-local-schema.sql', import.meta.url);
export const liveMigrations = [
  '20261027000100_activate_booking_intake_v2.sql',
  '20261028000100_stripe_test_booking_lifecycle.sql',
  '20261028000200_intake_v2_stable_service_identity.sql',
  '20261028201527_stripe_failed_attempt_recovery.sql',
  '20261029012540_decouple_intake_email_from_finalization.sql',
  '20261029204535_legal_consent_evidence.sql',
].map(name=>new URL(`../../supabase/migrations/${name}`,import.meta.url));
liveMigrations.push(new URL('../fixtures/stripe-live-package-schema.sql',import.meta.url));
liveMigrations.push(new URL('../../supabase/migrations/20261103035102_stripe_live_single_and_package_lifecycle.sql',import.meta.url));
