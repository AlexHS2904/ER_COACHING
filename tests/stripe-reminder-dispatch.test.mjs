import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { localPostgres } from './helpers/local-postgres.mjs';

// Every write is confined to the disposable cluster created by localPostgres.
// Neither connection strings nor application credentials are inherited.
const pg = localPostgres();
const migration = new URL('../supabase/migrations/20261029012540_decouple_intake_email_from_finalization.sql', import.meta.url);
const markSignature = 'mark_stripe_intake_reminder_dispatch_started_v1(uuid,uuid,timestamp with time zone,timestamp with time zone)';
const value = input => input == null ? 'NULL' : `'${String(input).replaceAll("'", "''")}'`;
const rows = query => JSON.parse(pg.sql(query) || 'null');
const claim = () => rows('SELECT public.claim_stripe_intake_reminder_v1()');
const markSql = (item, overrides = {}) => {
  const args = { ...item, ...overrides };
  return `SELECT public.mark_stripe_intake_reminder_dispatch_started_v1(
    ${value(args.booking_id)},${value(args.form_id)},
    ${value(args.claim_started_at)},${value(args.expected_starts_at)})`;
};
const mark = (item, overrides) => pg.sql(markSql(item, overrides)) === 't';
const release = (item, overrides = {}) => {
  const args = { ...item, ...overrides };
  return pg.sql(`SELECT public.release_unstarted_stripe_intake_reminder_v1(
    ${value(args.booking_id)},${value(args.claim_started_at)})`) === 't';
};

before(() => pg.start(new URL('./fixtures/stripe-local-schema.sql', import.meta.url), [
  new URL('../supabase/migrations/20261027000100_activate_booking_intake_v2.sql', import.meta.url),
  new URL('../supabase/migrations/20261028000100_stripe_test_booking_lifecycle.sql', import.meta.url),
  new URL('../supabase/migrations/20261028000200_intake_v2_stable_service_identity.sql', import.meta.url),
  new URL('../supabase/migrations/20261028201527_stripe_failed_attempt_recovery.sql', import.meta.url),
  migration,
]));
after(() => pg.stop());
// Free session occupancy between tests, without deleting any fixture evidence.
afterEach(() => pg.sql("UPDATE public.bookings SET status='cancelled' WHERE status IN ('pending','confirmed')"));

function eligible({ minutes = 30 } = {}) {
  const bookingId = randomUUID();
  const formId = randomUUID();
  pg.sql(`
    INSERT INTO public.bookings(id,service_id,service_name_snapshot,duration_minutes_snapshot,
      session_count_snapshot,price_snapshot,currency_snapshot,customer_name,customer_email,
      starts_at,ends_at,status,payment_flow,payment_status,payment_provider,payment_reference,
      paid_at,finalization_status,finalized_at,payment_expires_at,booking_access_token_hash,
      google_event_id,google_meet_url,customer_email_id,customer_email_sent_at,
      coach_email_id,coach_email_sent_at)
    SELECT '${bookingId}',s.id,s.name,90,1,500,'MXN','Fixture','customer@example.test',
      date_trunc('second',clock_timestamp())+interval '${minutes} minutes 0.123456 seconds',
      date_trunc('second',clock_timestamp())+interval '${minutes + 90} minutes 0.123456 seconds',
      'confirmed','stripe','paid','stripe','pi_fixture',
      '2026-01-01T01:02:03.123456Z','completed','2026-01-01T01:03:04.234567Z',
      clock_timestamp()+interval '1 day',md5(random()::text)||md5(random()::text),
      'event-fixture','https://meet.google.com/test-only','customer-receipt',
      '2026-01-01T01:04:05.345678Z','coach-receipt','2026-01-01T01:05:06.456789Z'
    FROM public.services s WHERE s.slug='sesion-1-1';
    INSERT INTO public.booking_intake_forms(id,booking_id,source_type,invitee_name,invitee_email,
      access_token_hash,access_token_encrypted,status,expires_at)
    VALUES ('${formId}','${bookingId}','booking','Fixture','customer@example.test',
      md5(random()::text)||md5(random()::text),'fixture-only-encrypted-value','active',
      clock_timestamp()+interval '2 days');
  `);
  return { booking_id: bookingId, form_id: formId };
}

// Redact access material at the SQL boundary so failed assertions cannot print it.
const state = item => rows(`SELECT jsonb_build_object(
  'booking',to_jsonb(b)-'booking_access_token_hash',
  'form',to_jsonb(f)-'access_token_hash'-'access_token_encrypted')
  FROM public.bookings b JOIN public.booking_intake_forms f ON f.booking_id=b.id
  WHERE b.id=${value(item.booking_id)}`);
const updateBooking = (item, change) => pg.sql(`UPDATE public.bookings SET ${change} WHERE id=${value(item.booking_id)}`);
const updateForm = (item, change) => pg.sql(`UPDATE public.booking_intake_forms SET ${change} WHERE id=${value(item.form_id)}`);
const reschedule = (item, minutes) => updateBooking(item,
  `starts_at=clock_timestamp()+interval '${minutes} minutes',ends_at=clock_timestamp()+interval '${minutes + 90} minutes'`);

function claimed() {
  const item = eligible();
  const result = claim();
  assert.ok(result, 'eligible reminder is claimed');
  assert.equal(result.booking_id, item.booking_id);
  assert.equal(result.form_id, item.form_id);
  assert.equal(result.claim_started_at, state(item).booking.stripe_intake_email_started_at);
  assert.equal(result.expected_starts_at, state(item).booking.starts_at);
  return result;
}

test('a crash after claim and before dispatch preserves a durable, unstarted claim across connections', () => {
  const item = claimed();
  const before = state(item);
  assert.equal(before.form.ready_email_error, 'reminder_claimed_not_started');
  assert.equal(before.form.ready_email_id, null);
  assert.equal(before.form.ready_email_sent_at, null);
  // Each pg.sql uses a new psql connection, like a restarted worker.
  assert.equal(claim(), null);
  assert.deepEqual(state(item), before);
});

test('mark durably closes release before provider acceptance, including a crash and later reschedule', () => {
  const item = claimed();
  const before = state(item);
  assert.equal(mark(item), true);
  const dispatched = state(item);
  assert.deepEqual(dispatched, {
    booking: before.booking,
    form: { ...before.form, ready_email_error: 'reminder_delivery_pending_or_unknown' },
  });
  // The provider may have accepted the email; its response was never persisted.
  reschedule(item, 120);
  const afterReschedule = state(item);
  assert.equal(release(item), false);
  assert.equal(mark(item), false);
  assert.equal(claim(), null);
  assert.deepEqual(state(item), afterReschedule);
  assert.equal(afterReschedule.booking.stripe_intake_email_started_at, item.claim_started_at);
  assert.equal(afterReschedule.form.ready_email_error, 'reminder_delivery_pending_or_unknown');
});

test('a pre-dispatch reschedule within one hour invalidates the expected timestamp and permits a fresh claim', () => {
  const item = claimed();
  reschedule(item, 45);
  const before = state(item);
  assert.equal(mark(item), false);
  assert.deepEqual(state(item), before);
  assert.equal(release(item), true);
  assert.deepEqual(state(item), {
    booking: { ...before.booking, stripe_intake_email_started_at: null },
    form: { ...before.form, ready_email_error: null },
  });
  const successor = claim();
  assert.ok(successor);
  assert.equal(successor.form_id, item.form_id);
  assert.equal(successor.booking_id, item.booking_id);
  assert.equal(successor.expected_starts_at, before.booking.starts_at);
  assert.notEqual(successor.claim_started_at, item.claim_started_at);
  const successorState = state(item);
  assert.equal(mark(item), false);
  assert.equal(release(item), false);
  assert.deepEqual(state(item), successorState);
  assert.equal(mark(successor), true);
});

test('a pre-dispatch reschedule beyond one hour releases only its claim and waits for renewed eligibility', () => {
  const item = claimed();
  reschedule(item, 120);
  const before = state(item);
  assert.equal(mark(item), false);
  assert.equal(release(item), true);
  assert.equal(claim(), null);
  const released = state(item);
  assert.deepEqual(released, {
    booking: { ...before.booking, stripe_intake_email_started_at: null },
    form: { ...before.form, ready_email_error: null },
  });
  reschedule(item, 20);
  const successor = claim();
  assert.ok(successor);
  assert.equal(successor.form_id, item.form_id);
  assert.equal(mark(successor), true);
});

for (const [label, change] of [
  ['submitted form', item => updateForm(item, "status='submitted',submitted_at=clock_timestamp()")],
  ['submission timestamp alone', item => updateForm(item, 'submitted_at=clock_timestamp()')],
  ['cancelled booking', item => updateBooking(item, "status='cancelled'")],
  ['session already started', item => reschedule(item, -5)],
  ['expired form', item => updateForm(item, "expires_at=clock_timestamp()-interval '1 second'")],
  ['revoked form', item => updateForm(item, "status='revoked'")],
  ['refunded booking', item => updateBooking(item, "payment_status='refunded'")],
  ['non-Stripe payment provider', item => updateBooking(item, "payment_provider='manual'")],
  ['incomplete finalization', item => updateBooking(item, "finalization_status='review_required'")],
]) test(`${label} before dispatch cannot mark but its unstarted claim can be safely released`, () => {
  const item = claimed();
  change(item);
  const before = state(item);
  assert.equal(mark(item), false);
  assert.deepEqual(state(item), before);
  assert.equal(release(item), true);
  assert.deepEqual(state(item), {
    booking: { ...before.booking, stripe_intake_email_started_at: null },
    form: { ...before.form, ready_email_error: null },
  });
  assert.equal(release(item), false);
  assert.equal(claim(), null);
});

test('a claim cannot mark or release a booking that no longer belongs to the Stripe payment flow', () => {
  const item = claimed();
  updateBooking(item, "payment_flow='manual'");
  const before = state(item);
  assert.equal(mark(item), false);
  assert.equal(release(item), false);
  assert.equal(claim(), null);
  assert.deepEqual(state(item), before);
});

test('two concurrent marks serialize and authorize exactly one provider dispatch', async () => {
  const item = claimed();
  const before = state(item);
  const results = await Promise.all([
    pg.run(`BEGIN;${markSql(item)};SELECT pg_sleep(0.15);COMMIT;`),
    pg.run(markSql(item)),
  ]);
  for (const result of results) assert.equal(result.code, 0, result.errors);
  assert.deepEqual(results.map(result => result.output).sort(), ['f', 't']);
  assert.deepEqual(state(item), {
    booking: before.booking,
    form: { ...before.form, ready_email_error: 'reminder_delivery_pending_or_unknown' },
  });
  assert.equal(release(item), false);
  assert.equal(claim(), null);
});

test('claim nonce, exact form ownership and expected start are checked without losing PostgreSQL microseconds', () => {
  const item = claimed();
  const other = eligible({ minutes: 1440 });
  const before = state(item);
  const otherBefore = state(other);
  const shiftedNonce = rows(`SELECT to_jsonb(${value(item.claim_started_at)}::timestamptz+interval '1 microsecond')`);
  const shiftedStart = rows(`SELECT to_jsonb(${value(item.expected_starts_at)}::timestamptz+interval '1 microsecond')`);
  assert.notEqual(shiftedNonce, item.claim_started_at);
  assert.notEqual(shiftedStart, item.expected_starts_at);
  assert.equal(Date.parse(shiftedStart), Date.parse(item.expected_starts_at));
  for (const overrides of [
    { claim_started_at: shiftedNonce },
    { expected_starts_at: shiftedStart },
    { form_id: other.form_id },
    { form_id: randomUUID() },
    { booking_id: other.booking_id },
    { booking_id: randomUUID() },
    { claim_started_at: null },
    { expected_starts_at: null },
    { form_id: null },
    { booking_id: null },
  ]) {
    assert.equal(mark(item, overrides), false);
    assert.deepEqual(state(item), before);
    assert.deepEqual(state(other), otherBefore);
  }
  assert.equal(release(item, { claim_started_at: shiftedNonce }), false);
  assert.equal(release(item, { claim_started_at: null }), false);
  assert.equal(mark(item), true);
  assert.equal(state(item).booking.stripe_intake_email_started_at, item.claim_started_at);
});

for (const phase of [
  'reminder_delivery_pending_or_unknown',
  'reminder_delivery_requires_review',
  'reminder_no_longer_eligible',
  'reminder_terminal_unknown',
  null,
]) test(`phase ${String(phase)} cannot be marked, released or claimed again`, () => {
  const item = claimed();
  updateForm(item, `ready_email_error=${value(phase)}`);
  reschedule(item, 120);
  const before = state(item);
  assert.equal(mark(item), false);
  assert.equal(release(item), false);
  reschedule(item, 30);
  const eligibleAgain = state(item);
  assert.equal(claim(), null);
  assert.equal(release(item), false);
  assert.deepEqual(state(item), eligibleAgain);
  assert.equal(eligibleAgain.booking.stripe_intake_email_started_at, before.booking.stripe_intake_email_started_at);
});

for (const [label, change] of [
  ['provider ID alone', "ready_email_id='reminder-fixture'"],
  ['sent timestamp alone', "ready_email_sent_at=clock_timestamp()"],
  ['successful delivery', "ready_email_id='reminder-fixture',ready_email_sent_at=clock_timestamp(),ready_email_error=NULL"],
]) test(`${label} prevents dispatch and release even when the session is rescheduled`, () => {
  const item = claimed();
  updateForm(item, change);
  const before = state(item);
  assert.equal(mark(item), false);
  assert.equal(release(item), false);
  assert.equal(claim(), null);
  assert.deepEqual(state(item), before);
  reschedule(item, 120);
  const afterReschedule = state(item);
  assert.equal(release(item), false);
  assert.deepEqual(state(item), afterReschedule);
});

test('mark is a service-only SECURITY DEFINER RPC and reapplying the migration preserves durable evidence', () => {
  const item = claimed();
  assert.equal(mark(item), true);
  const before = state(item);
  const oid = pg.sql(`SELECT 'public.${markSignature}'::regprocedure::oid`);
  pg.sql(readFileSync(migration, 'utf8'));
  assert.equal(pg.sql(`SELECT 'public.${markSignature}'::regprocedure::oid`), oid);
  assert.deepEqual(state(item), before);
  assert.equal(pg.sql(`SELECT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
    FROM pg_proc WHERE oid='public.${markSignature}'::regprocedure`), 't');
  assert.equal(pg.sql(`SELECT prorettype='boolean'::regtype FROM pg_proc
    WHERE oid='public.${markSignature}'::regprocedure`), 't');
  assert.equal(pg.sql(`SELECT proargnames::text FROM pg_proc
    WHERE oid='public.${markSignature}'::regprocedure`),
  '{p_booking_id,p_form_id,p_claim_started_at,p_expected_starts_at}');
  for (const role of ['anon', 'authenticated']) {
    assert.equal(pg.sql(`SELECT has_function_privilege('${role}','public.${markSignature}','EXECUTE')`), 'f');
  }
  assert.equal(pg.sql(`SELECT NOT EXISTS (SELECT 1 FROM pg_proc p,
    LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    WHERE p.oid='public.${markSignature}'::regprocedure
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE')`), 't');
  assert.equal(pg.sql(`SELECT has_function_privilege('service_role','public.${markSignature}','EXECUTE')`), 't');
  const retry = pg.sql(`SET ROLE service_role;${markSql(item)}`);
  assert.equal(retry, 'f');
  assert.equal(release(item), false);
  assert.equal(claim(), null);
  assert.deepEqual(state(item), before);
});
