import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';
const legalAcceptance = testModules().load('src/lib/legal/acceptance.ts').currentBookingAcceptance;

const site = 'http://localhost:3000';
const bookingA = '11111111-1111-4111-8111-111111111111';
const bookingB = '22222222-2222-4222-8222-222222222222';
const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64), intakeTokenB = 'c'.repeat(64);
const cookieA = `booking_access_${bookingA}`, cookieB = `booking_access_${bookingB}`;
const hash = value => testModules().load('src/lib/stripe/access.ts').hashBookingAccess(value);
const response = { json: (data, init = {}) => ({ data, status: init.status ?? 200, cookies: { set() {} } }) };

function ownershipFixture(entries) {
  const jar = new Map(entries), cookieReads = [], legalRecords = [], claims = [], stripeCalls = [], tableReads = [];
  const bookings = new Map([
    [bookingA, { id: bookingA, booking_reference: 'PRIVATE-A', booking_access_token_hash: hash(tokenA) }],
    [bookingB, { id: bookingB, booking_reference: 'PRIVATE-B', booking_access_token_hash: hash(tokenB) }],
  ].map(([id, value]) => [id, { ...value, status: 'confirmed', payment_status: 'paid', payment_flow: 'stripe',
    finalization_status: 'completed', price_snapshot: '500.00', currency_snapshot: 'MXN' }]));
  let form;
  const db = {
    async rpc(name, args) {
      if (name === 'record_booking_legal_acceptance_v1') {
        legalRecords.push({ name, args });
        const booking = bookings.get(args.p_booking_id);
        if (!booking || booking.booking_access_token_hash !== args.p_access_token_hash) {
          return { data: null, error: { message: 'invalid_access' } };
        }
        return { data: true, error: null };
      }
      claims.push({ name, args });
      assert.equal(name, 'claim_stripe_checkout_v1');
      const booking = bookings.get(args.p_booking_id);
      if (!booking || booking.booking_access_token_hash !== args.p_access_token_hash) {
        return { data: null, error: { message: 'invalid_access' } };
      }
      return { data: { booking, attempt: { id: 'fixture-attempt', amount_minor: '50000', currency: 'mxn',
        stripe_checkout_session_id: 'cs_test_fixture_only', checkout_payload: {} } }, error: null };
    },
    from(table) {
      const filters = new Map();
      const query = {
        select() { return query; },
        eq(key, value) { filters.set(key, value); return query; },
        not() { return query; }, order() { return query; }, limit() { return query; },
        async maybeSingle() {
          tableReads.push(table);
          if (table === 'bookings') {
            const data = [...bookings.values()].find(row => [...filters].every(([key, value]) => row[key] === value));
            return { data: data ?? null, error: null };
          }
          if (table === 'booking_intake_forms') return { data: filters.get('booking_id') === bookingB ? form : null, error: null };
          if (table === 'booking_payment_attempts') return { data: null, error: null };
          throw new Error('Unexpected fixture table');
        },
      };
      return query;
    },
  };
  const cookies = { get(name) { cookieReads.push(name); return jar.has(name) ? { value: jar.get(name) } : undefined; } };
  const stripe = { checkout: { sessions: {
    async create() { stripeCalls.push('create'); throw new Error('Denied request reached Stripe'); },
    async retrieve() { stripeCalls.push('retrieve'); throw new Error('Denied request reached Stripe'); },
  } } };
  const StatusActions = () => null;
  const modules = testModules({
    'next/server': { NextResponse: response },
    'next/headers': { cookies: async () => cookies },
    'next/link': { default: () => null },
    'next/navigation': { redirect: url => { throw Object.assign(new Error('NEXT_REDIRECT'), { location: url }); } },
    '@/components/publico/Header': { default: () => null },
    '@/components/publico/Footer': { default: () => null },
    '@/components/publico/reservar/BookingStatusActions': { default: StatusActions },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => db },
    '@/lib/stripe/server': { getStripeTestSiteUrl: () => site, getStripeTestClient: () => stripe, getStripeBookingAdmin: () => db },
    '@/lib/bookings/finalize-paid-booking': { finalizePaidBooking: async () => { throw new Error('Completed booking must not finalize again'); } },
    '@/lib/stripe/expire-hold': {
      expireDueStripeHolds: async () => { throw new Error('Recovery must not create or expire bookings'); },
      expireStripeBookingHold: async () => { throw new Error('Denied request must not expire a booking'); },
    },
  }, { INTAKE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64') });
  form = { booking_id: bookingB, source_type: 'booking', status: 'active', submitted_at: null,
    expires_at: '2099-01-01T00:00:00Z', access_token_hash: hash(intakeTokenB),
    access_token_encrypted: modules.load('src/lib/intake/intake-token-crypto.ts').encryptIntakeToken(intakeTokenB) };
  return { modules, jar, cookies, cookieReads, legalRecords, claims, stripeCalls, tableReads, bookings, StatusActions };
}

const deniedCookies = [
  ['cookie A only', [[cookieA, tokenA]], false],
  ['cookie B replaced with token A', [[cookieB, tokenA]], true],
  ['malformed cookie B', [[cookieB, 'invalid-cookie']], false],
  ['incognito without cookies', [], false],
];

for (const [label, entries, reachesOwnershipLookup] of deniedCookies) {
  test(`Checkout recovery denies booking B with ${label}`, async () => {
    const f = ownershipFixture(entries);
    const POST = f.modules.load('src/app/api/bookings/stripe/checkout/route.ts').POST;
    const result = await POST({ headers: new Headers({ origin: site }), cookies: f.cookies,
      json: async () => ({ bookingId: bookingB, legalAcceptance }) });

    assert.equal(result.status, 403);
    assert.equal(result.data.checkoutUrl, undefined);
    assert.equal(result.data.statusUrl, undefined);
    assert.equal(result.data.redirectIntakeUrl, undefined);
    assert.equal(JSON.stringify(result.data).includes('PRIVATE-B'), false);
    assert.deepEqual(f.cookieReads, [cookieB]);
    assert.deepEqual(f.claims, []);
    assert.deepEqual(f.legalRecords, []);
    assert.deepEqual(f.stripeCalls, []);
    assert.deepEqual(f.tableReads, reachesOwnershipLookup ? ['bookings'] : [],
      'ownership lookup uses both booking ID and token hash; denied access never reads an Intake');
  });

  test(`Confirmation reference B never reveals its Intake with ${label}`, async () => {
    const f = ownershipFixture(entries);
    const page = f.modules.load('src/app/reservar/confirmada/page.tsx').default;
    const tree = await page({ searchParams: Promise.resolve({ ref: 'PRIVATE-B' }) });
    const serialized = JSON.stringify(tree);
    assert.deepEqual(f.cookieReads, [cookieB]);
    assert.equal(serialized.includes('PRIVATE-B'), false);
    assert.equal(serialized.includes(intakeTokenB), false);
    assert.equal(serialized.includes('redirectIntakeUrl'), false);
    assert.equal(f.tableReads.includes('booking_intake_forms'), false);
    assert.deepEqual(f.claims, []);
    assert.deepEqual(f.legalRecords, []);
    assert.deepEqual(f.stripeCalls, []);
  });
}

test('authorized cookie B obtains only the existing B Intake through real token recovery', async () => {
  const f = ownershipFixture([[cookieA, tokenA], [cookieB, tokenB]]);
  const page = f.modules.load('src/app/reservar/confirmada/page.tsx').default;
  await assert.rejects(() => page({ searchParams: Promise.resolve({ ref: 'PRIVATE-B' }) }), error => {
    assert.equal(error.message, 'NEXT_REDIRECT');
    assert.equal(error.location, `${site}/formulario/${intakeTokenB}`);
    assert.equal(error.location.includes(tokenA), false);
    assert.equal(error.location.includes(tokenB), false);
    assert.equal(error.location.includes(hash(tokenB)), false);
    return true;
  });
  assert.deepEqual(f.cookieReads, [cookieB]);
  assert.equal(f.tableReads.filter(table => table === 'booking_intake_forms').length, 1);
  assert.deepEqual(f.claims, []);
  assert.deepEqual(f.stripeCalls, []);
});

test('the Intake destination itself rejects token A against booking B before reading a form', async () => {
  const f = ownershipFixture([[cookieA, tokenA]]);
  const destination = f.modules.load('src/lib/bookings/intake-destination.ts').bookingIntakeDestination;
  assert.deepEqual(await destination(f.bookings.get(bookingB), tokenA), { status: 'waiting', redirectIntakeUrl: null });
  assert.equal(f.tableReads.includes('booking_intake_forms'), false);
});

function deniedAdminFixture(identity) {
  let serviceCalls = 0, calendarCalls = 0, emailCalls = 0;
  const adminQueries = [], cookieReads = [];
  const auth = {
    auth: { getClaims: async () => ({ data: { claims: identity === 'anonymous' ? null : { sub: 'fixture-user' } }, error: null }) },
    from(table) {
      assert.equal(table, 'admin_users');
      const query = { select() { return query; }, eq(key, value) {
        adminQueries.push({ key, value }); return query;
      }, async maybeSingle() { return { data: identity === 'inactive' ? { user_id: 'fixture-user', active: false } : null, error: null }; } };
      return query;
    },
  };
  const modules = testModules({
    'next/server': { NextResponse: response },
    '@/lib/supabase/server': { createClient: async () => auth },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => { serviceCalls++; throw new Error('Denied user reached service role'); } },
    '@/lib/google/calendar': {
      deleteGoogleCalendarEvent: async () => { calendarCalls++; },
      updateGoogleCalendarEvent: async () => { calendarCalls++; },
    },
    '@/lib/email/send-booking-change-email': { sendBookingChangeEmail: async () => { emailCalls++; } },
  });
  const jar = new Map([[cookieA, tokenA]]);
  const request = { headers: new Headers({ origin: site }), nextUrl: new URL(`${site}/api/bookings/${bookingB}/reschedule?date=2035-01-01`),
    cookies: { get(name) { cookieReads.push(name); return jar.has(name) ? { value: jar.get(name) } : undefined; } },
    json: async () => ({ startsAt: '2035-01-01T12:00:00Z' }) };
  return { modules, request, adminQueries, cookieReads, counts: () => ({ serviceCalls, calendarCalls, emailCalls }) };
}

for (const identity of ['anonymous', 'normal-user', 'inactive']) {
  for (const [route, method] of [['cancel', 'POST'], ['reschedule', 'POST'], ['reschedule', 'GET']]) {
    test(`${identity} with booking A cookie cannot ${method} ${route} booking B`, async () => {
      const f = deniedAdminFixture(identity);
      const endpoint = f.modules.load(`src/app/api/bookings/[id]/${route}/route.ts`)[method];
      const result = await endpoint(f.request, { params: Promise.resolve({ id: bookingB }) });
      assert.equal(result.status, identity === 'anonymous' ? 401 : 403);
      assert.deepEqual(f.counts(), { serviceCalls: 0, calendarCalls: 0, emailCalls: 0 });
      assert.deepEqual(f.cookieReads, []);
      assert.equal(f.adminQueries.length, identity === 'anonymous' ? 0 : 1);
      if (identity !== 'anonymous') assert.deepEqual(f.adminQueries[0], { key: 'user_id', value: 'fixture-user' });
      assert.equal(JSON.stringify(result.data).includes(bookingB), false);
    });
  }
}
