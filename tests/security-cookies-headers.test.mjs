import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const publicConfig = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.example.test',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-placeholder',
};
const sessionCookie = { name: 'sb-fixture-session', value: 'synthetic-session-only' };

for (const environment of ['production', 'development']) {
  const expectedSecure = environment === 'production';

  test(`Supabase browser cookies are Secure only over the production HTTPS deployment (${environment})`, () => {
    const calls = [];
    const client = { kind: 'browser-fixture' };
    const modules = testModules({
      '@supabase/ssr': { createBrowserClient: (...args) => { calls.push(args); return client; } },
    }, { ...publicConfig, NODE_ENV: environment });

    assert.equal(modules.load('src/lib/supabase/client.ts').createClient(), client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], publicConfig.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(calls[0][1], publicConfig.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    assert.equal(calls[0][2].cookieOptions.secure, expectedSecure);
    assert.equal(calls[0][2].cookieOptions.sameSite, 'lax');
    // The existing browser SDK owns this session; forcing HttpOnly would break it.
    assert.notEqual(calls[0][2].cookieOptions.httpOnly, true);
  });

  test(`Supabase server cookie writes preserve the production security options (${environment})`, async () => {
    let options;
    const writes = [];
    const modules = testModules({
      '@supabase/ssr': { createServerClient: (_url, _key, value) => { options = value; return {}; } },
      'next/headers': { cookies: async () => ({ getAll: () => [sessionCookie], set: (...args) => writes.push(args) }) },
    }, { ...publicConfig, NODE_ENV: environment });

    await modules.load('src/lib/supabase/server.ts').createClient();
    assert.equal(options.cookieOptions.secure, expectedSecure);
    assert.equal(options.cookieOptions.sameSite, 'lax');
    assert.deepEqual(options.cookies.getAll(), [sessionCookie]);
    options.cookies.setAll([{ ...sessionCookie, options: options.cookieOptions }]);
    assert.deepEqual(writes, [[sessionCookie.name, sessionCookie.value, options.cookieOptions]]);
  });

  test(`Supabase proxy refresh keeps Secure and SameSite on the returned response (${environment})`, async () => {
    let options, claimsCalls = 0;
    const requestWrites = [];
    const request = { cookies: { getAll: () => [sessionCookie], set: (...args) => requestWrites.push(args) } };
    const responses = [];
    const modules = testModules({
      '@supabase/ssr': { createServerClient: (_url, _key, value) => {
        options = value;
        return { auth: { getClaims: async () => {
          claimsCalls++;
          options.cookies.setAll([{ ...sessionCookie, options: options.cookieOptions }]);
          return { data: { claims: { sub: 'fixture-user' } } };
        } } };
      } },
      'next/server': { NextResponse: { next: () => {
        const writes = [];
        const response = { writes, cookies: { set: (...args) => writes.push(args) } };
        responses.push(response);
        return response;
      } } },
    }, { ...publicConfig, NODE_ENV: environment });

    const response = await modules.load('src/lib/supabase/proxy.ts').updateSession(request);
    assert.equal(claimsCalls, 1);
    assert.equal(options.cookieOptions.secure, expectedSecure);
    assert.equal(options.cookieOptions.sameSite, 'lax');
    assert.equal(response, responses.at(-1));
    assert.deepEqual(requestWrites, [[sessionCookie.name, sessionCookie.value]]);
    assert.deepEqual(response.writes, [[sessionCookie.name, sessionCookie.value, options.cookieOptions]]);
  });
}

test('Supabase client factories do not initialize with missing public configuration', async () => {
  for (const missing of Object.keys(publicConfig)) {
    const env = { ...publicConfig, NODE_ENV: 'production' };
    delete env[missing];
    let calls = 0;
    const modules = testModules({
      '@supabase/ssr': {
        createBrowserClient: () => { calls++; },
        createServerClient: () => { calls++; },
      },
      'next/headers': { cookies: async () => ({ getAll: () => [] }) },
    }, env);
    assert.throws(() => modules.load('src/lib/supabase/client.ts').createClient(), new RegExp(`Missing ${missing}`));
    await assert.rejects(modules.load('src/lib/supabase/server.ts').createClient(), new RegExp(`Missing ${missing}`));
    assert.equal(calls, 0);
  }
});

for (const [environment, site, expectedSecure] of [
  ['development', 'http://localhost:3000', false],
  ['development', 'https://coaching.example.test', true],
  ['production', 'http://localhost:3000', true],
  ['production', 'https://coaching.example.test', true],
  ['production', undefined, true],
]) test(`booking cookies preserve HttpOnly and expiry while enforcing Secure (${environment}, ${site ? new URL(site).protocol : 'missing site'})`, () => {
  const access = testModules({}, { NODE_ENV: environment, NEXT_PUBLIC_SITE_URL: site }).load('src/lib/stripe/access.ts');
  const expires = new Date(Date.now() + 60_000);
  const hold = access.holdCookieOptions(site ?? 'http://localhost:3000', expires);
  for (const options of [hold, access.bookingCookieOptions]) {
    assert.equal(options.secure, expectedSecure);
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.path, '/');
  }
  assert.equal(hold.expires, expires);
  assert.ok(hold.maxAge >= 59 && hold.maxAge <= 60);
  assert.equal(access.bookingCookieOptions.maxAge, 7 * 24 * 60 * 60);
});

const nextConfig = () => testModules().load('next.config.ts').default;

test('Next request logging omits private bearer routes and OAuth responses, retaining ordinary requests', () => {
  const patterns = nextConfig().logging.incomingRequests.ignore;
  const privateRequests = [
    '/formulario/synthetic-only',
    '/formulario/synthetic-only?_rsc=fixture',
    '/proceso/synthetic-only/agendar',
    '/resena/synthetic-only',
    '/api/intake/synthetic-only',
    '/api/processes/synthetic-only/sessions',
    '/api/reviews/synthetic-only',
    '/auth/confirm?token_hash=synthetic-only&type=invite',
    '/api/google/callback?code=synthetic-only&state=fixture',
  ];
  for (const request of privateRequests) {
    assert.ok(patterns.some(pattern => pattern.test(request)));
    assert.ok(patterns.some(pattern => pattern.test(request)), 'patterns must not have a stateful global flag');
  }
  for (const request of ['/', '/servicios', '/api/availability', '/api/webhooks/stripe', '/admin/reservas', '/reservar/confirmada?ref=FIXTURE']) {
    assert.equal(patterns.some(pattern => pattern.test(request)), false);
  }
});

test('private token routes receive no-referrer after global headers without weakening other security headers', async () => {
  const rules = await nextConfig().headers();
  const matchingHeaders = pathname => Object.fromEntries(rules.filter(rule => {
    if (rule.source === '/:path*') return true;
    if (rule.source.endsWith('/:path*')) {
      const prefix = rule.source.slice(0, -'/:path*'.length);
      return pathname === prefix || pathname.startsWith(`${prefix}/`);
    }
    return rule.source === pathname;
  }).flatMap(rule => rule.headers).map(header => [header.key, header.value]));

  for (const path of ['/formulario/fixture', '/proceso/fixture', '/proceso/fixture/agendar', '/resena/fixture', '/api/intake/fixture', '/api/processes/fixture/sessions', '/api/reviews/fixture', '/auth/confirm', '/api/google/callback']) {
    const headers = matchingHeaders(path);
    assert.equal(headers['Referrer-Policy'], 'no-referrer');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.match(headers['Strict-Transport-Security'], /max-age=/);
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.match(headers['Permissions-Policy'], /camera=\(\)/);
  }
  assert.equal(matchingHeaders('/servicios')['Referrer-Policy'], 'strict-origin-when-cross-origin');
});
