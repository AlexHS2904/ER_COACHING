import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';
const legalAcceptance = testModules().load('src/lib/legal/acceptance.ts').currentBookingAcceptance;

const site = 'http://localhost:3000';
const bookingId = '11111111-1111-4111-8111-111111111111';
const flowId = '22222222-2222-4222-8222-222222222222';
const token = 'a'.repeat(64);
const email = 'fixture-customer@example.test';
const throttleMessage = 'Demasiadas solicitudes. Intenta nuevamente más tarde.';
const bookingBody = { service: 'sesion-1-1', startsAt: '2099-01-01T18:00:00Z',
  name: 'Fixture name', email: `  ${email.toUpperCase()}  `, legalAcceptance };

class AppResponse extends Response {
  cookies = { set() {} };
  static json(body, init = {}) {
    return new AppResponse(JSON.stringify(body), { ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers } });
  }
}

function fixture({ deny = () => 429 } = {}) {
  const calls = [], effects = [];
  let parsed = 0;
  const response = status => AppResponse.json({ error: throttleMessage }, {
    status, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
  });
  const forbidden = name => (...args) => { effects.push({ name, args }); throw new Error(`Unexpected ${name}`); };
  const booking = { id: bookingId, booking_reference: 'FIXTURE', status: 'pending', payment_status: 'pending',
    payment_flow: 'stripe', finalization_status: 'not_started', payment_expires_at: '2099-01-01T18:30:00Z',
    booking_access_token_hash: testModules().load('src/lib/stripe/access.ts').hashBookingAccess(token),
    legal_terms_accepted_at: '2026-10-29T12:00:00Z', legal_adult_confirmed_at: '2026-10-29T12:00:00Z',
    legal_terms_version: legalAcceptance.termsVersion, legal_privacy_notice_version: legalAcceptance.privacyNoticeVersion };
  const db = {
    from(table) {
      const filters=[];
      const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},not(){return query;},
        order(){return query;},limit(){return query;},async maybeSingle(){
          effects.push({name:'database query',table});
          return {data:table==='bookings'&&filters.every(([k,v])=>booking[k]===v)?{...booking}:null,error:null};
        }};
      return query;
    },
    async rpc(name, args) {
      if (name !== 'record_booking_legal_acceptance_v1') return forbidden('database RPC')(name, args);
      effects.push({ name: 'legal acceptance', args });
      return { data: true, error: null };
    },
  };
  const modules = testModules({
    'next/server': { NextResponse: AppResponse, after: forbidden('background effect') },
    '@/lib/security/public-abuse': { enforcePublicAbuse: async (request, group, identity) => {
      calls.push({ request, group, identity });
      const status = deny(group);
      return status ? response(status) : null;
    } },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => db },
    '@/lib/supabase/proxy': { updateSession: async () => {
      effects.push({ name: 'session refresh' }); return new AppResponse(null, { status: 200 });
    } },
    '@/lib/stripe/server': {
      getStripeTestSiteUrl: () => site,
      getStripeTestClient: () => ({}),
      getStripeBookingAdmin: () => db,
      isStripeTestCheckoutEnabled: () => true,
    },
    '@/lib/stripe/checkout': { createOrRecoverCheckout: async (...args) => {
      effects.push({ name: 'checkout', args });
      return { url: 'https://checkout.stripe.com/c/pay/fixture-only' };
    } },
    '@/lib/bookings/finalize-paid-booking': { finalizePaidBooking: forbidden('paid finalization') },
    '@/lib/stripe/expire-hold': { expireDueStripeHolds: forbidden('hold expiration') },
    '@/lib/google/calendar': { createGoogleCalendarEvent: forbidden('Calendar') },
    '@/lib/email/send-booking-emails': { sendBookingEmails: forbidden('booking email') },
    '@/lib/email/send-intake-subimssion-mail': { sendIntakeSubmissionEmail: forbidden('intake email') },
    '@/lib/intake/get-intake-by-token': { getIntakeByToken: forbidden('intake lookup') },
    '@/lib/reviews/get-review-invitation': { getReviewInvitationByToken: forbidden('review lookup') },
    '@/lib/reviews/avatars': { isReviewAvatarKey: () => false },
    '@/lib/data/availability': { getAvailableSlots: async () => {
      effects.push({ name: 'availability lookup' }); return [];
    } },
    '@/lib/email/resend': { getResend: () => ({ emails: { send: async () => {
      effects.push({ name: 'contact email' }); return { data: { id: 'fixture-email' }, error: null };
    } } }) },
    '@/emails/ContactMessageEmail': { __esModule: true, default: () => null },
    '@/emails/ContactConfirmationEmail': { __esModule: true, default: () => null },
    sharp: forbidden('image parsing'),
  }, { NODE_ENV: 'production', RESEND_FROM_EMAIL: 'fixture-sender@example.test',
    CONTACT_TO_EMAIL: 'fixture-coach@example.test' });
  const request = (path, body = {}, method = 'POST') => ({
    method,
    url: `${site}${path}`,
    nextUrl: new URL(`${site}${path}`),
    headers: new Headers({ origin: site }),
    cookies: { get: () => ({ value: token }) },
    json: async () => { parsed++; return body; },
    formData: forbidden('multipart parsing'),
  });
  return { modules, calls, effects, request, parsed: () => parsed };
}

async function assertThrottled(result, status = 429) {
  assert.equal(result.status, status);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('Retry-After'), '60');
  const body = await result.json();
  assert.deepEqual(body, { error: throttleMessage });
  const serialized = JSON.stringify(body);
  for (const privateValue of [bookingId, flowId, token, email, 'booking_reference', 'checkoutUrl', 'redirectIntakeUrl']) {
    assert.equal(serialized.includes(privateValue), false);
  }
}

for (const status of [429, 503]) {
  test(`contact returns ${status} before any email using its normalized identity`, async () => {
    const f = fixture({ deny: () => status });
    const req = f.request('/api/contact', { name: 'Fixture name', email: `  ${email.toUpperCase()}  `,
      subject: 'individual', message: 'Fixture message with enough characters' });
    const result = await f.modules.load('src/app/api/contact/route.ts').POST(req);
    await assertThrottled(result, status);
    assert.deepEqual(f.calls, [{ request: req, group: 'contact', identity: email }]);
    assert.deepEqual(f.effects, []);
  });
}

test('normal contact traffic still sends the coach and customer emails', async () => {
  const f = fixture({ deny: () => null });
  const req = f.request('/api/contact', { name: 'Fixture name', email,
    subject: 'individual', message: 'Fixture message with enough characters' });
  const result = await f.modules.load('src/app/api/contact/route.ts').POST(req);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { success: true });
  assert.deepEqual(f.effects.map(effect => effect.name), ['contact email', 'contact email']);
});

test('legacy booking creation is throttled before service queries, RPCs, Calendar or emails', async () => {
  const f = fixture();
  const req = f.request('/api/bookings', bookingBody);
  const result = await f.modules.load('src/app/api/bookings/route.ts').POST(req);
  await assertThrottled(result);
  assert.deepEqual(f.calls, [{ request: req, group: 'booking-create', identity: email }]);
  assert.deepEqual(f.effects, []);
});

for (const [label, body, group, identity] of [
  ['creation', { ...bookingBody, email, flowId }, 'checkout-create', email],
  ['recovery', { bookingId, legalAcceptance }, 'checkout-recover', `${bookingId}:${token}`],
]) test(`Checkout ${label} is throttled before hold creation or provider activity`, async () => {
  const f = fixture();
  const req = f.request('/api/bookings/stripe/checkout', body);
  const result = await f.modules.load('src/app/api/bookings/stripe/checkout/route.ts').POST(req);
  await assertThrottled(result);
  assert.deepEqual(f.calls, [{ request: req, group, identity }]);
  assert.deepEqual(f.effects, []);
});

test('exhausting Checkout creation does not consume the legitimate existing booking retry bucket', async () => {
  const f = fixture({ deny: group => group === 'checkout-create' ? 429 : null });
  const route = f.modules.load('src/app/api/bookings/stripe/checkout/route.ts');
  await assertThrottled(await route.POST(f.request('/api/bookings/stripe/checkout', { ...bookingBody, email, flowId })));
  const result = await route.POST(f.request('/api/bookings/stripe/checkout', { bookingId, legalAcceptance }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { checkoutUrl: 'https://checkout.stripe.com/c/pay/fixture-only', bookingId });
  assert.deepEqual(f.calls.map(call => call.group), ['checkout-create', 'checkout-recover']);
  assert.deepEqual(f.effects.map(effect => effect.name), ['database query', 'database query', 'checkout']);
  assert.deepEqual(f.effects.slice(0,2).map(effect=>effect.table), ['bookings','booking_payment_attempts']);
  assert.equal(f.effects[2].args[0], bookingId);
  assert.equal(f.effects[2].args[1], f.modules.load('src/lib/stripe/access.ts').hashBookingAccess(token));
  assert.equal(f.effects.some(effect=>effect.name==='legal acceptance'),false,'durable acceptance is not written again');
});

for (const [method, group] of [['PATCH', 'intake-draft'], ['POST', 'intake-submit']]) {
  test(`Intake ${method} throttles before token lookup, private answers parsing or email`, async () => {
    const f = fixture();
    const req = f.request(`/api/intake/${token}`, {}, method);
    const result = await f.modules.load('src/app/api/intake/[token]/route.ts')[method](req, { params: Promise.resolve({ token }) });
    await assertThrottled(result);
    assert.deepEqual(f.calls, [{ request: req, group, identity: token }]);
    assert.equal(f.parsed(), 0);
    assert.deepEqual(f.effects, []);
  });
}

for (const [path, file, group] of [
  [`/api/processes/${token}/sessions`, 'src/app/api/processes/[token]/sessions/route.ts', 'process-session'],
  [`/api/reviews/${token}`, 'src/app/api/reviews/[token]/route.ts', 'review-submit'],
]) test(`${group} throttles before database or costly body/image processing`, async () => {
  const f = fixture();
  const req = f.request(path);
  const result = await f.modules.load(file).POST(req, { params: Promise.resolve({ token }) });
  await assertThrottled(result);
  assert.deepEqual(f.calls, [{ request: req, group, identity: token }]);
  assert.equal(f.parsed(), 0);
  assert.deepEqual(f.effects, []);
});

test('availability throttles the expensive query and allows normal reads', async () => {
  for (const limited of [true, false]) {
    const f = fixture({ deny: () => limited ? 429 : null });
    const req = f.request('/api/availability?service=sesion-1-1&date=2099-01-01', {}, 'GET');
    const result = await f.modules.load('src/app/api/availability/route.ts').GET(req);
    assert.deepEqual(f.calls, [{ request: req, group: 'availability-read', identity: undefined }]);
    if (limited) {
      await assertThrottled(result);
      assert.deepEqual(f.effects, []);
    } else {
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), { service: 'sesion-1-1', date: '2099-01-01', slots: [] });
      assert.deepEqual(f.effects, [{ name: 'availability lookup' }]);
    }
  }
});

for (const [path, group] of [
  [`/formulario/${token}`, 'intake-read'],
  [`/proceso/${token}`, 'process-read'],
  [`/proceso/${token}/agendar`, 'process-read'],
  [`/resena/${token}`, 'review-read'],
]) test(`proxy throttles private ${group} reads before lookup or session refresh`, async () => {
  const f = fixture();
  const req = f.request(path, {}, 'GET');
  const result = await f.modules.load('src/proxy.ts').proxy(req);
  await assertThrottled(result);
  assert.deepEqual(f.calls, [{ request: req, group, identity: token }]);
  assert.deepEqual(f.effects, []);
});

test('proxy never rate limits webhook, worker, confirmation or ordinary public routes', async () => {
  const f = fixture();
  const route = f.modules.load('src/proxy.ts');
  for (const [path, method] of [
    ['/api/webhooks/stripe', 'POST'], ['/api/webhooks/resend', 'POST'],
    ['/api/internal/stripe/process-pending', 'POST'], ['/reservar/confirmada?ref=FIXTURE', 'GET'], ['/', 'GET'],
  ]) assert.equal((await route.proxy(f.request(path, {}, method))).status, 200);
  assert.deepEqual(f.calls, []);
});

test('signed Stripe webhook remains functional without invoking public abuse limits', async () => {
  let applied = 0, abuseCalls = 0;
  const modules = testModules({
    'next/server': { NextResponse: AppResponse, after() { assert.fail('Unaccepted fixture must not finalize'); } },
    '@/lib/security/public-abuse': { enforcePublicAbuse: async () => { abuseCalls++; assert.fail('Webhook must bypass public limiter'); } },
    '@/lib/stripe/server': { getStripeTestClient: () => ({ webhooks: { constructEvent: () => ({ livemode: false }) } }) },
    '@/lib/stripe/webhook': { applyStripeCheckoutEvent: async () => { applied++; return { accepted: false }; } },
    '@/lib/bookings/finalize-paid-booking': { finalizePaidBooking: async () => assert.fail('No finalization') },
  }, { NODE_ENV: 'production', STRIPE_WEBHOOK_SECRET: 'whsec_fixture_not_a_real_secret' });
  const result = await modules.load('src/app/api/webhooks/stripe/route.ts').POST({
    headers: new Headers({ 'stripe-signature': 'fixture-signature' }), text: async () => 'fixture-event',
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { received: true });
  assert.equal(applied, 1);
  assert.equal(abuseCalls, 0);
});

test('internal worker keeps its Bearer authorization and bypasses public abuse limits', async () => {
  let processed = 0, abuseCalls = 0;
  const secret = 'synthetic-worker-secret-for-tests-only';
  const modules = testModules({
    'next/server': { NextResponse: AppResponse },
    '@/lib/security/public-abuse': { enforcePublicAbuse: async () => { abuseCalls++; assert.fail('Worker must bypass public limiter'); } },
    '@/lib/stripe/server': { getStripeTestClient: () => ({}) },
    '@/lib/stripe/process-pending': { processPendingStripeBookings: async () => { processed++; return { processed: 0 }; } },
  }, { NODE_ENV: 'production', STRIPE_LOCAL_WORKER_SECRET: secret });
  const route = modules.load('src/app/api/internal/stripe/process-pending/route.ts');
  assert.equal((await route.POST({ headers: new Headers() })).status, 401);
  assert.equal(processed, 0);
  const result = await route.POST({ headers: new Headers({ authorization: `Bearer ${secret}` }) });
  assert.equal(result.status, 200);
  assert.equal(processed, 1);
  assert.equal(abuseCalls, 0);
});
