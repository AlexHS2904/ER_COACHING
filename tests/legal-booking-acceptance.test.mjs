import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const legal = testModules().load('src/lib/legal/acceptance.ts');
const accepted = legal.currentBookingAcceptance;
const site = 'http://localhost:3000';
const bookingId = '11111111-1111-4111-8111-111111111111';
const flowId = '22222222-2222-4222-8222-222222222222';
const cookie = 'a'.repeat(64);
const input = { service: 'sesion-1-1', startsAt: '2099-01-01T12:00:00Z',
  name: 'Fixture customer', email: 'fixture@example.test', flowId };
const response = { json: (data, init = {}) => ({ data, status: init.status ?? 200, cookies: { set() {} } }) };

function fixture({ durable = false, priorVersion = false } = {}) {
  const calls = [];
  const hash = testModules().load('src/lib/stripe/access.ts').hashBookingAccess(cookie);
  const acceptedAt = '2026-10-29T22:00:00Z';
  const booking = { id: bookingId, booking_reference: 'FIXTURE', created_at: acceptedAt,
    booking_access_token_hash: hash, status: 'pending', payment_status: 'pending', payment_flow: 'stripe',
    finalization_status: 'not_started', payment_expires_at: '2099-01-01T12:30:00Z', expired_at: null,
    price_snapshot: '500.00', currency_snapshot: 'MXN',
    legal_terms_accepted_at: durable || priorVersion ? acceptedAt : null,
    legal_adult_confirmed_at: durable || priorVersion ? acceptedAt : null,
    legal_terms_version: priorVersion ? 'previous-version' : durable ? accepted.termsVersion : null,
    legal_privacy_notice_version: priorVersion ? 'previous-version' : durable ? accepted.privacyNoticeVersion : null };
  const db = {
    from(table) {
      const filters = [];
      const query = { select() { return query; }, eq(key,value) { filters.push([key,value]); return query; },
        not() { return query; }, order() { return query; }, limit() { return query; },
        async maybeSingle() {
          calls.push({ read: table });
          return { data: table === 'bookings' && filters.every(([key,value]) => booking[key] === value) ? { ...booking } : null, error: null };
        } };
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'record_booking_legal_acceptance_v1') return { data: true, error: null };
      return { data: { booking_id: bookingId, booking_reference: 'FIXTURE',
        payment_expires_at: '2099-01-01T12:30:00Z' }, error: null };
    },
  };
  const modules = testModules({
    'next/server': { NextResponse: response },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => db },
    '@/lib/stripe/server': { getStripeTestSiteUrl: () => site, getStripeTestClient: () => ({}),
      getStripeBookingAdmin: () => db },
    '@/lib/security/public-abuse': { enforcePublicAbuse: async () => null },
    '@/lib/bookings/finalize-paid-booking': { finalizePaidBooking: async () => { throw new Error('Unpaid legal flow must not finalize'); } },
    '@/lib/stripe/expire-hold': { expireDueStripeHolds: async () => { calls.push('expire'); } },
    '@/lib/stripe/checkout': { createOrRecoverCheckout: async (id, hash) => {
      calls.push({ checkout: id, hash }); return { url: 'https://checkout.stripe.com/c/pay/fixture-only' };
    } },
    '@/lib/google/calendar': { createGoogleCalendarEvent: () => { calls.push('Calendar'); } },
    '@/lib/email/send-booking-emails': { sendBookingEmails: () => { calls.push('email'); } },
  });
  const req = (body, credential = cookie) => ({ headers: new Headers({ origin: site }), json: async () => body,
    cookies: { get: () => credential ? { value: credential } : undefined } });
  return { calls, modules, req, booking };
}

const invalid = [
  ['missing', undefined], ['false', false], ['array', []],
  ['unchecked', { ...accepted, termsAccepted: false }],
  ['missing adult declaration', { termsAccepted: true, termsVersion: accepted.termsVersion,
    privacyNoticeVersion: accepted.privacyNoticeVersion }],
  ['underage declaration', { ...accepted, ageConfirmed: false }],
  ['truthy string', { ...accepted, termsAccepted: 'true' }],
  ['outdated terms', { ...accepted, termsVersion: 'outdated' }],
  ['outdated privacy', { ...accepted, privacyNoticeVersion: 'outdated' }],
  ['extra private evidence', { ...accepted, ip: '203.0.113.20' }],
];
for (const route of ['create', 'recover', 'legacy']) {
  for (const [label, legalAcceptance] of invalid) {
    test(`${route} rejects ${label} contractual acceptance before business effects`, async () => {
      const f = fixture();
      const path = route === 'legacy' ? 'src/app/api/bookings/route.ts' : 'src/app/api/bookings/stripe/checkout/route.ts';
      const result = await f.modules.load(path).POST(f.req({
        ...(route === 'recover' ? { bookingId } : input), legalAcceptance,
      }));
      assert.equal(result.status, 400);
      assert.match(result.data.error, /Términos y Condiciones/);
      assert.equal(result.data.bookingId, undefined);
      assert.equal(result.data.checkoutUrl, undefined);
      assert.deepEqual(f.calls.filter(call => !call.read), []);
      if (route !== 'recover') assert.deepEqual(f.calls, []);
    });
  }
}

test('accepted request creates the hold with unchanged business fields and then obtains Checkout', async () => {
  const f = fixture();
  const result = await f.modules.load('src/app/api/bookings/stripe/checkout/route.ts')
    .POST(f.req({ ...input, legalAcceptance: accepted }));
  assert.equal(result.status, 200);
  assert.equal(result.data.bookingId, bookingId);
  assert.equal(f.calls[0], 'expire');
  assert.equal(f.calls[1].name, 'create_stripe_booking_hold_with_legal_v1');
  assert.equal(f.calls[1].args.p_starts_at, input.startsAt);
  assert.equal(f.calls[1].args.p_service_slug, input.service);
  assert.equal(f.calls[1].args.p_customer_email, input.email);
  assert.equal(f.calls[2].checkout, bookingId);
  assert.deepEqual(f.calls[1].args.p_legal_acceptance, accepted);
  // Acceptance is passed to the atomic RPC, never browser timestamps or Stripe metadata.
  assert.equal(f.calls[1].args.terms_accepted_at, undefined);
  assert.equal(f.calls[1].args.payment_expires_at, undefined);
});

test('recovery uses the existing booking/cookie without creating another hold or extending it', async () => {
  const f = fixture();
  const result = await f.modules.load('src/app/api/bookings/stripe/checkout/route.ts')
    .POST(f.req({ bookingId, legalAcceptance: accepted }));
  assert.equal(result.status, 200);
  const writes = f.calls.filter(call => !call.read);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].name, 'record_booking_legal_acceptance_v1');
  assert.equal(writes[0].args.p_booking_id, bookingId);
  assert.deepEqual(writes[0].args.p_legal_acceptance, accepted);
  assert.equal(writes[1].checkout, bookingId);
});

test('durable current acceptance permits retry without another declaration or legal write', async () => {
  const f = fixture({ durable: true }), baseline = JSON.stringify(f.booking);
  const result = await f.modules.load('src/app/api/bookings/stripe/checkout/route.ts')
    .POST(f.req({ bookingId }));
  assert.equal(result.status, 200);assert.ok(result.data.checkoutUrl);
  assert.equal(f.calls.some(call => call.name), false);
  assert.equal(f.calls.filter(call => call.checkout).length, 1);
  assert.equal(JSON.stringify(f.booking), baseline);
});

test('retry cannot replace evidence of a prior contract with current client declarations', async () => {
  const f = fixture({ priorVersion: true }), baseline = JSON.stringify(f.booking);
  const result = await f.modules.load('src/app/api/bookings/stripe/checkout/route.ts')
    .POST(f.req({ bookingId, legalAcceptance: accepted }));
  assert.equal(result.status, 409);assert.match(result.data.error, /revisión/);
  assert.equal(f.calls.some(call => call.name || call.checkout), false);
  assert.equal(JSON.stringify(f.booking), baseline);
});

test('retry with no cookie is denied before any booking read, regardless of legal declaration', async () => {
  const f = fixture({ durable: true });
  const result = await f.modules.load('src/app/api/bookings/stripe/checkout/route.ts')
    .POST(f.req({ bookingId }, null));
  assert.equal(result.status, 403);assert.equal(result.data.code, 'invalid_access');
  assert.equal(result.data.statusUrl, undefined);assert.deepEqual(f.calls, []);
});

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

test('contractual checkbox stays separate from privacy and marketing, with accessible new-tab document links', () => {
  const modules = testModules();
  const component = modules.load('src/components/legal/BookingLegalAcceptance.tsx').default;
  const changes = [];
  const tree = nodes(component({ checked: false, onChange: value => changes.push(value) }));
  const checkbox = tree.find(node => node.type === 'input');
  assert.equal(checkbox.props.type, 'checkbox');
  assert.equal(checkbox.props.checked, false);
  assert.equal(checkbox.props.required, true);
  assert.match(JSON.stringify(tree), /18 años o más/);
  checkbox.props.onChange({ target: { checked: true } });
  assert.deepEqual(changes, [true]);
  const links = tree.filter(node => node.type === 'a');
  assert.deepEqual(links.map(link => link.props.href), ['/terminos-y-condiciones', '/aviso-de-privacidad']);
  assert.ok(links.every(link => link.props.target === '_blank' && link.props.rel === 'noopener noreferrer'));
});
