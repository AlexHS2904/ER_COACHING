import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const ruleId = 'er-public-abuse-v1';
const secret = 'fixture-only-rate-limit-secret-'.repeat(2);
const ip = '203.0.113.20';
const host = 'www.ednarojocoaching.com';
const generatedHost = 'coaching-fixture.vercel.app';
const env = { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production',
  VERCEL_URL: generatedHost, RATE_LIMIT_SECRET: secret };

function request(address = ip, extra = {}) {
  return { headers: new Headers({ 'x-vercel-forwarded-for': address, ...extra }) };
}

function fixture({ environment = {}, check } = {}) {
  const calls = [], counters = new Map();
  const modules = testModules({
    '@vercel/firewall': {
      async checkRateLimit(id, options) {
        calls.push({ id, options });
        if (check) return check(id, options);
        const count = (counters.get(options.rateLimitKey) ?? 0) + 1;
        counters.set(options.rateLimitKey, count);
        return { rateLimited: count > 10 };
      },
    },
  }, { ...env, ...environment });
  return { enforce: modules.load('src/lib/security/public-abuse.ts').enforcePublicAbuse,
    calls, counters, logs: modules.logs };
}

test('normal production traffic passes; the eleventh request receives a private 429', async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) assert.equal(await f.enforce(request(), 'contact'), null);
  const result = await f.enforce(request(), 'contact');
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('retry-after'), '60');
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' });
  assert.equal(f.calls.length, 11);
});

test('different endpoint groups have independent buckets in the one configured rule', async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) await f.enforce(request(), 'contact');
  assert.equal((await f.enforce(request(), 'contact')).status, 429);
  assert.equal(await f.enforce(request(), 'booking-create'), null);
  assert.equal(await f.enforce(request(), 'intake-submit'), null);
  assert.equal(f.counters.size, 3);
  assert.ok(f.calls.every(call => call.id === ruleId));
});

test('changing booking references or identities cannot evade the mandatory IP bucket', async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) assert.equal(await f.enforce(request(), 'checkout-create', `booking-${i}`), null);
  assert.equal((await f.enforce(request(), 'checkout-create', 'another-booking')).status, 429);
  // The exhausted IP bucket rejects before touching a new identity bucket.
  assert.equal(f.counters.size, 11);
});

test('exhausting new Checkout creation does not block a legitimate existing-booking retry', async () => {
  const f = fixture();
  for (let i = 0; i < 11; i++) await f.enforce(request(), 'checkout-create');
  for (let i = 0; i < 3; i++) assert.equal(await f.enforce(request(), 'checkout-recover', 'same-owned-booking'), null);
  const keys = [...f.counters.values()];
  assert.deepEqual(keys, [11, 3, 3]);
});

test('identity quota also applies across different source IPs', async () => {
  const f = fixture();
  for (let i = 1; i <= 10; i++) assert.equal(await f.enforce(request(`203.0.113.${i}`), 'contact', 'recipient@example.invalid'), null);
  assert.equal((await f.enforce(request('203.0.113.11'), 'contact', 'recipient@example.invalid')).status, 429);
  assert.equal([...f.counters.values()].filter(count => count === 11).length, 1);
});

test('provider receives HMAC keys and only the minimal host/IP headers', async () => {
  const f = fixture();
  const token = 'private-fixture-token';
  const req = request(ip, { cookie: 'booking_access=private-cookie', authorization: 'Bearer private-auth',
    host: 'attacker.example', 'x-forwarded-for': '192.0.2.1' });
  Object.defineProperty(req, 'url', { get() { throw new Error('The guard must not inspect a private URL'); } });
  assert.equal(await f.enforce(req, 'intake-submit', token), null);
  assert.equal(f.calls.length, 2);
  const expected = scope => createHmac('sha256', secret)
    .update(JSON.stringify([ruleId, 'intake-submit', scope, scope === 'ip' ? ip : token])).digest('hex');
  assert.deepEqual(f.calls.map(call => call.options.rateLimitKey), [expected('ip'), expected('identity')]);
  for (const { id, options } of f.calls) {
    assert.equal(id, ruleId);
    assert.match(options.rateLimitKey, /^[a-f0-9]{64}$/);
    assert.equal(options.timeout, 1000);
    assert.deepEqual([...options.headers.entries()], [['host', host], ['x-real-ip', ip]]);
    assert.equal('request' in options, false);
    assert.equal(options.headers.has('cookie'), false);
    assert.equal(options.headers.has('authorization'), false);
    assert.equal(options.rateLimitKey.includes(token), false);
    assert.equal(options.rateLimitKey.includes(ip), false);
    assert.equal(options.rateLimitKey.includes(secret), false);
  }
  assert.deepEqual(f.logs, []);
});

for (const [label, check] of [
  ['missing rule', async () => ({ rateLimited: false, error: 'not-found' })],
  ['timeout', async () => { throw Object.assign(new Error('private provider metadata'), { name: 'TimeoutError' }); }],
  ['network failure', async () => { throw new Error('private provider metadata'); }],
  ['unexpected provider result', async () => ({})],
]) {
  test(`${label} fails closed with a generic non-cacheable 503`, async () => {
    const f = fixture({ check });
    const result = await f.enforce(request(), 'intake-read', 'private-token');
    assert.equal(result.status, 503);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await result.json(), { error: 'No fue posible procesar la solicitud. Intenta de nuevo más tarde.' });
    assert.deepEqual(f.logs, []);
  });
}

test('provider firewall denial returns the same public 429 without private details', async () => {
  const f = fixture({ check: async () => ({ rateLimited: true, error: 'blocked' }) });
  const result = await f.enforce(request(), 'checkout-recover', 'private-booking-id');
  assert.equal(result.status, 429);
  const body = JSON.stringify(await result.json());
  assert.equal(body.includes('private-booking-id'), false);
  assert.equal(body.includes('blocked'), false);
});

for (const [label, environment] of [
  ['not running on Vercel', { VERCEL: undefined }],
  ['missing secret', { RATE_LIMIT_SECRET: undefined }],
  ['short secret', { RATE_LIMIT_SECRET: 'short-fixture' }],
  ['whitespace in secret', { RATE_LIMIT_SECRET: `${secret} ` }],
]) {
  test(`production configuration rejects ${label} before any provider request`, async () => {
    const f = fixture({ environment });
    assert.equal((await f.enforce(request(), 'contact')).status, 503);
    assert.deepEqual(f.calls, []);
  });
}

for (const [label, site] of [['missing', undefined], ['localhost', 'http://localhost:3000'],
  ['external', 'https://attacker.example'], ['malformed', 'not-a-url']]) {
  test(`production destination is fixed even when the application URL is ${label}`, async () => {
    const f = fixture({ environment: { NEXT_PUBLIC_SITE_URL: site } });
    assert.equal(await f.enforce(request(), 'availability-read'), null);
    assert.equal(f.calls[0].options.headers.get('host'), host);
  });
}

test('production uses the trusted canonical domain instead of a protected or missing generated hostname', async () => {
  for (const deploymentHost of [generatedHost, undefined, 'attacker.example', 'https://attacker.example']) {
    const f = fixture({ environment: { VERCEL_URL: deploymentHost } });
    assert.equal(await f.enforce(request(ip, { host: 'attacker.example', 'x-forwarded-host': 'attacker.example' }), 'availability-read'), null);
    assert.equal(f.calls[0].options.headers.get('host'), host);
  }
});

test('preview retains its Vercel deployment hostname and never falls back to production', async () => {
  const f = fixture({ environment: { VERCEL_ENV: 'preview', NEXT_PUBLIC_SITE_URL: undefined } });
  assert.equal(await f.enforce(request(ip, { host }), 'availability-read'), null);
  assert.equal(f.calls[0].options.headers.get('host'), generatedHost);
});

for (const [label, previewHost] of [
  ['missing hostname', undefined], ['external hostname', 'attacker.example'],
  ['URL instead of hostname', `https://${generatedHost}`], ['credentials', `user@${generatedHost}`],
  ['port', `${generatedHost}:443`], ['suffix attack', `${generatedHost}.attacker.example`],
]) {
  test(`preview fails closed for ${label} without using the production domain`, async () => {
    const f = fixture({ environment: { VERCEL_ENV: 'preview', VERCEL_URL: previewHost } });
    assert.equal((await f.enforce(request(), 'availability-read')).status, 503);
    assert.deepEqual(f.calls, []);
  });
}

for (const deploymentEnvironment of [undefined, 'development', 'custom-production']) {
  test(`an unknown production runtime environment fails closed (${deploymentEnvironment})`, async () => {
    const f = fixture({ environment: { VERCEL_ENV: deploymentEnvironment } });
    assert.equal((await f.enforce(request(), 'availability-read')).status, 503);
    assert.deepEqual(f.calls, []);
  });
}

test('client-supplied forwarding headers do not change the provider-trusted IP bucket', async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) assert.equal(await f.enforce(request(ip, {
    'x-forwarded-for': `192.0.2.${i}`, 'x-real-ip': `192.0.2.${i}`,
  }), 'booking-create'), null);
  assert.equal((await f.enforce(request(ip, { 'x-forwarded-for': '192.0.2.99' }), 'booking-create')).status, 429);
  assert.equal(f.counters.size, 1);
});

for (const [label, headers] of [
  ['missing trusted IP', { 'x-forwarded-for': ip, 'x-real-ip': ip }],
  ['invalid trusted IP', { 'x-vercel-forwarded-for': 'forged' }],
  ['ambiguous IP list', { 'x-vercel-forwarded-for': `${ip}, 192.0.2.1` }],
]) {
  test(`${label} fails closed instead of trusting a client fallback`, async () => {
    const f = fixture();
    assert.equal((await f.enforce({ headers: new Headers(headers) }, 'contact')).status, 503);
    assert.deepEqual(f.calls, []);
  });
}

test('valid IPv6 provider addresses are accepted', async () => {
  const f = fixture();
  assert.equal(await f.enforce(request('2001:db8::20'), 'contact'), null);
  assert.equal(f.calls[0].options.headers.get('x-real-ip'), '2001:db8::20');
});

test('identity scope is bounded before any provider request', async () => {
  const f = fixture();
  assert.equal((await f.enforce(request(), 'intake-submit', 'x'.repeat(2049))).status, 503);
  assert.equal((await f.enforce(request(), 'intake-submit', '')).status, 503);
  assert.deepEqual(f.calls, []);
});

test('local development skips the provider without a hidden in-memory production fallback', async () => {
  const f = fixture({ environment: { NODE_ENV: 'development', VERCEL: undefined, RATE_LIMIT_SECRET: undefined } });
  for (let i = 0; i < 12; i++) assert.equal(await f.enforce({ headers: new Headers() }, 'checkout-create'), null);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.logs, []);
});
