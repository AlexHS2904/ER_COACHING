import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';
import { stripeFixtureCatalog } from './helpers/stripe-runtime-fixture.mjs';

const site = 'https://www.ednarojocoaching.com';
const bookingId = '11111111-1111-4111-8111-111111111111';
const flowId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const token = 'a'.repeat(64);
const liveEnv = {
  STRIPE_MODE: 'live', STRIPE_EXPECTED_ACCOUNT_ID: 'acct_fixture',
  STRIPE_SECRET_KEY: 'rk_live_fixture_only', PAID_BOOKINGS_ENABLED: 'false',
  VERCEL: '1', VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: site,
  NEXT_PUBLIC_SUPABASE_URL: 'https://rysgpojjhiljrrwtjguy.supabase.co',
  STRIPE_PAYMENT_METHOD_CONFIGURATION_ID: 'pmc_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_fixture_signature_not_real',
  STRIPE_WORKER_SECRET: 'fixture-private-worker-secret-not-real-123',
  INTAKE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString('base64'),
};

function fixture({ role = 'active', env = {}, account = {}, methods = {}, catalog = stripeFixtureCatalog,
  limited = false, checkoutFails = false } = {}) {
  const calls = { auth: 0, adminReads: 0, account: 0, methods: 0, holds: [], checkouts: [], limits: [], contexts: [] };
  const db = {
    from(table) {
      assert.equal(table, 'services');
      return { select: async () => ({ data: structuredClone(catalog), error: null }) };
    },
    async rpc(name, args) {
      assert.equal(name, 'create_stripe_booking_hold_with_legal_v2');
      calls.holds.push(args);
      return { data: { booking_id: bookingId, booking_reference: 'PRIVATE-FIXTURE', payment_expires_at: '2035-01-01T12:30:00Z' }, error: null };
    },
  };
  class FakeStripe {
    constructor() {
      this.accounts = { retrieve: async id => {
        assert.equal(id, null); calls.account++;
        return { id: 'acct_fixture', charges_enabled: true, payouts_enabled: true, ...account };
      } };
      this.paymentMethodConfigurations = { retrieve: async id => {
        assert.equal(id, 'pmc_fixture'); calls.methods++;
        return { active: true, livemode: true, card: { available: true, display_preference: { value: 'on' } }, ...methods };
      } };
    }
  }
  const modules = testModules({
    stripe: FakeStripe,
    'next/server': { NextResponse: { json: (data, init = {}) => {
      const saved = [];
      return { data, status: init.status ?? 200, headers: init.headers ?? {}, cookies: { saved, set: (...args) => saved.push(args) } };
    } } },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => db },
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getClaims: async () => {
        calls.auth++;
        return { data: { claims: role === 'anonymous' ? null : { sub: adminId } }, error: null };
      } },
      from(table) {
        assert.equal(table, 'admin_users');
        return { select() { return this; }, eq(key, value) { assert.equal(key, 'user_id'); assert.equal(value, adminId); return this; },
          async maybeSingle() {
            calls.adminReads++;
            return { data: role === 'common' ? null : { user_id: adminId, active: role === 'active' }, error: null };
          } };
      },
    }) },
    '@/lib/security/public-abuse': { enforcePublicAbuse: async (_request, group, identity) => {
      calls.limits.push({ group, identity });
      return limited ? { status: 429, data: { error: 'Intenta nuevamente más tarde.' } } : null;
    } },
    '@/lib/stripe/checkout': { createOrRecoverCheckout: async (...args) => {
      calls.checkouts.push(args);
      if (checkoutFails) throw new Error(`private provider error must not leak ${token}`);
      return { url: 'https://checkout.stripe.com/c/pay/cs_live_fixture' };
    } },
    '@/lib/stripe/checkout-return': { reconcileStripeCheckoutReturn: async () => assert.fail('A new hold must not enter recovery') },
  }, { ...liveEnv, ...env });
  const runtime = modules.load('src/lib/stripe/server.ts');
  const verifyContext = runtime.getVerifiedStripeContext;
  runtime.getVerifiedStripeContext = async options => {
    calls.contexts.push(options);
    return verifyContext(options);
  };
  const acceptance = modules.load('src/lib/legal/acceptance.ts').currentBookingAcceptance;
  const route = modules.load('src/app/api/bookings/stripe/checkout/route.ts');
  const body = (overrides = {}) => ({ service: 'sesion-1-1', startsAt: '2035-01-01T12:00:00Z',
    name: 'Fixture Customer', email: 'fixture@example.test', flowId, legalAcceptance: acceptance, ...overrides });
  const request = ({ headers = {}, privateIntent = '1', cookie = token, payload = body() } = {}) => ({
    headers: new Headers({ origin: (env.NEXT_PUBLIC_SITE_URL ?? site), ...(privateIntent === null ? {} : { 'X-ER-Admin-Live-Test': privateIntent }), ...headers }),
    json: async () => payload, cookies: { get: () => cookie ? { value: cookie } : undefined },
  });
  return { calls, runtime, body, request, run: options => route.POST(request(options)), logs: modules.logs };
}

for (const [role, status] of [['anonymous', 401], ['common', 403], ['inactive', 403]]) {
  test(`private Live Checkout rejects ${role} even with the intent header`, async () => {
    const f = fixture({ role });
    const response = await f.run();
    assert.equal(response.status, status);
    assert.equal(f.calls.holds.length, 0); assert.equal(f.calls.account, 0); assert.equal(f.calls.checkouts.length, 0);
  });
}

test('malformed private intent and foreign Origin are rejected before authorization or provider calls', async () => {
  for (const options of [{ privateIntent: 'true' }, { headers: { origin: 'https://foreign.example.test' } }]) {
    const f = fixture(); const response = await f.run(options);
    assert.equal(response.status, 403); assert.equal(f.calls.auth, 0); assert.equal(f.calls.account, 0);
    assert.equal(f.calls.holds.length, 0); assert.equal(f.calls.checkouts.length, 0);
  }
});

test('private intent cannot override Test mode', async () => {
  const f = fixture({ env: { STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_fixture_only', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' } });
  const response = await f.run();
  assert.equal(response.status, 403); assert.equal(f.calls.auth, 0); assert.equal(f.calls.account, 0);
});

for (const service of ['sesion-1-1', 'proceso']) {
  test(`public ${service} stays blocked with sales paused, even for a signed-in admin without private intent`, async () => {
    const f = fixture(); const response = await f.run({ privateIntent: null, payload: f.body({ service }) });
    assert.equal(response.status, 409); assert.equal(response.data.code, 'checkout_unavailable');
    assert.equal(f.calls.auth, 0); assert.equal(f.calls.holds.length, 0); assert.equal(f.calls.account, 0);
    assert.equal(f.calls.checkouts.length, 0); assert.equal(f.runtime.getStripeConfig().newSalesEnabled, false);
  });

  test(`active admin uses the existing cookie/hold/Checkout flow for ${service} while public sales stay paused`, async () => {
    const f = fixture();
    const bootstrap = await f.run({ cookie: null, payload: f.body({ service }) });
    assert.equal(bootstrap.status, 200); assert.deepEqual(bootstrap.data, { requiresCookie: true });
    assert.equal(f.calls.holds.length, 0); assert.equal(f.calls.checkouts.length, 0);
    const [name, secret, options] = bootstrap.cookies.saved[0];
    assert.equal(name, `booking_flow_${flowId}`); assert.equal(options.path, '/api/bookings/stripe/checkout');
    assert.equal(options.httpOnly, true); assert.equal(options.secure, true);
    const result = await f.run({ cookie: secret, payload: f.body({ service }) });
    assert.equal(result.status, 200); assert.equal(result.data.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_live_fixture');
    assert.equal(f.calls.auth, 2); assert.equal(f.calls.adminReads, 2);
    assert.equal(f.calls.holds.length, 1); assert.equal(f.calls.checkouts.length, 1);
    assert.equal(f.calls.contexts.length, 2);
    for (const context of f.calls.contexts) assert.deepEqual(context, { forNewSale: true, privateLiveTest: true });
    assert.equal(f.calls.account, 2); assert.equal(f.calls.methods, 2);
    const args = f.calls.holds[0];
    assert.equal(args.p_stripe_mode, 'live'); assert.equal(args.p_stripe_account_id, 'acct_fixture');
    assert.equal(args.p_service_slug, service); assert.deepEqual(args.p_legal_acceptance, f.body().legalAcceptance);
    assert.equal(Object.hasOwn(args, 'amount_minor'), false);
    assert.equal(Boolean(args.p_process_access_token_encrypted), service === 'proceso');
    assert.equal(f.calls.checkouts[0][0], bookingId);
    assert.equal(f.calls.checkouts[0][1], testModules().load('src/lib/stripe/access.ts').hashBookingAccess(secret));
    assert.equal(result.cookies.saved[0][2].expires.toISOString(), '2035-01-01T14:00:00.000Z');
    assert.equal(f.runtime.getStripeConfig().newSalesEnabled, false); assert.equal(f.runtime.isStripeCheckoutEnabled(), false);
    assert.equal(JSON.stringify({ response: result.data, logs: f.logs }).includes(secret), false);
  });
}

test('private readiness bypass is Live-only and the second account check still requires its explicit context', async () => {
  const f = fixture(); const config = f.runtime.getStripeConfig();
  assert.throws(() => f.runtime.assertStripeSalesReady(config), /stripe_new_sales_not_ready/);
  f.runtime.assertStripeSalesReady(config, { privateLiveTest: true });
  await assert.rejects(f.runtime.getVerifiedStripeContext({ forNewSale: true }), /stripe_new_sales_not_ready/);
  assert.throws(() => f.runtime.assertStripeSalesReady({ ...config, mode: 'test' }, { privateLiveTest: true }), /stripe_new_sales_not_ready/);
});

for (const [name, changes] of [
  ['missing webhook secret', { env: { STRIPE_WEBHOOK_SECRET: undefined } }],
  ['missing worker secret', { env: { STRIPE_WORKER_SECRET: undefined } }],
  ['missing PMC', { env: { STRIPE_PAYMENT_METHOD_CONFIGURATION_ID: undefined } }],
  ['foreign account', { account: { id: 'acct_foreign' } }],
  ['disabled charges', { account: { charges_enabled: false } }],
  ['disabled payouts', { account: { payouts_enabled: false } }],
  ['inactive payment configuration', { methods: { active: false } }],
  ['non-Live payment configuration', { methods: { livemode: false } }],
  ['delayed payment method', { methods: { oxxo: { display_preference: { value: 'on' } } } }],
  ['missing package catalog', { catalog: [stripeFixtureCatalog[0]] }],
]) test(`private admin access preserves ${name} rejection before any hold`, async () => {
  const f = fixture(changes); const response = await f.run();
  assert.equal(response.status, 409); assert.equal(f.calls.holds.length, 0); assert.equal(f.calls.checkouts.length, 0);
});

test('private admin access preserves legal acceptance and rejects browser financial overrides', async () => {
  for (const [overrides, expected] of [[{ legalAcceptance: undefined }, 400], [{ amount_minor: 1, payment_status: 'paid' }, 409]]) {
    const f = fixture(); const response = await f.run({ payload: f.body(overrides) });
    assert.equal(response.status, expected); assert.equal(f.calls.holds.length, 0); assert.equal(f.calls.checkouts.length, 0);
  }
});

test('private admin access uses the existing rate limit and returns its safe 429', async () => {
  const f = fixture({ limited: true }); const response = await f.run();
  assert.equal(response.status, 429); assert.equal(f.calls.limits[0].group, 'checkout-create');
  assert.equal(f.calls.limits[0].identity, 'fixture@example.test');
  assert.equal(f.calls.holds.length, 0); assert.equal(f.calls.account, 0); assert.equal(f.calls.checkouts.length, 0);
  assert.deepEqual(response.data, { error: 'Intenta nuevamente más tarde.' });
});

test('provider failures in private Checkout never expose credentials or provider objects', async () => {
  const f = fixture({ checkoutFails: true }); const response = await f.run();
  assert.equal(response.status, 409); assert.equal(response.data.code, 'checkout_unavailable');
  const output = JSON.stringify({ response: response.data, logs: f.logs });
  for (const value of [token, liveEnv.STRIPE_SECRET_KEY, liveEnv.STRIPE_WEBHOOK_SECRET, liveEnv.STRIPE_WORKER_SECRET, 'private provider error']) assert.equal(output.includes(value), false);
});
