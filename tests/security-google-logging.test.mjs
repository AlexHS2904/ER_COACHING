import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const markers = ['synthetic-client-secret', 'synthetic-access-token', 'synthetic-refresh-token', 'synthetic-oauth-code'];

function callbackFixture({ tokenError = null, storageError = null } = {}) {
  let stores = 0;
  const modules = testModules({
    'next/server': { NextResponse: { redirect: url => ({ location: url.toString() }) } },
    'next/headers': { cookies: async () => ({
      get: () => ({ value: 'fixture-admin:fixture-state' }),
      delete() {},
    }) },
    '@/lib/google/oauth': { getGoogleOAuthClient: () => ({ getToken: async () => {
      if (tokenError) throw tokenError;
      return { tokens: { refresh_token: markers[2] } };
    } }) },
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getClaims: async () => ({ data: { claims: { sub: 'fixture-admin' } }, error: null }) },
      from() {
        const query = { select() { return query; }, eq() { return query; },
          maybeSingle: async () => ({ data: { active: true }, error: null }) };
        return query;
      },
    }) },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ from() { return {
      upsert: async () => { stores++; return { error: storageError }; },
    }; } }) },
  });
  const url = new URL(`http://localhost:3000/api/google/callback?code=${markers[3]}&state=fixture-state`);
  const route = modules.load('src/app/api/google/callback/route.ts');
  return { run: () => route.GET({ url: url.toString(), nextUrl: url }), logs: modules.logs, get stores() { return stores; } };
}

test('OAuth failure logs only a safe status and never the Gaxios request or response', async () => {
  const fixture = callbackFixture({ tokenError: {
    message: markers.join(' '),
    config: { data: `client_secret=${markers[0]}&code=${markers[3]}`, headers: { Authorization: `Bearer ${markers[1]}` } },
    response: { status: 401, data: { refresh_token: markers[2] } },
  } });
  const result = await fixture.run();
  assert.equal(result.location, 'http://localhost:3000/admin?google=token_error');
  assert.equal(fixture.stores, 0);
  assert.deepEqual(fixture.logs, [['Google OAuth token error:', { status: 401, code: null }]]);
  for (const marker of markers) assert.equal(JSON.stringify(fixture.logs).includes(marker), false);
});

test('OAuth storage failure does not log the failing row containing a refresh token', async () => {
  const fixture = callbackFixture({ storageError: {
    code: '23502', message: markers[0], details: `Failing row contains (${markers[2]})`, hint: markers[1],
  } });
  const result = await fixture.run();
  assert.equal(result.location, 'http://localhost:3000/admin?google=database_error');
  assert.equal(fixture.stores, 1);
  assert.deepEqual(fixture.logs, [['Error saving Google token:', { status: null, code: '23502' }]]);
  for (const marker of markers) assert.equal(JSON.stringify(fixture.logs).includes(marker), false);
});

test('safe Google diagnostics discard arbitrary codes, messages and invalid HTTP statuses', () => {
  const metadata = testModules().load('src/lib/google/safe-error.ts').googleErrorLogMetadata;
  assert.deepEqual(metadata({ code: markers[0], status: 900, message: markers[1] }), { status: null, code: null });
  assert.deepEqual(metadata({ code: 'ECONNRESET', config: { data: markers[2] } }), { status: null, code: 'ECONNRESET' });
  assert.deepEqual(metadata({ code: 503 }), { status: 503, code: null });
  assert.deepEqual(metadata(null), { status: null, code: null });
});

test('Calendar finalization diagnostics allow only known provider reasons without OAuth response details', () => {
  const metadata = testModules().load('src/lib/google/safe-error.ts').googleErrorLogMetadata;
  const error = { message: markers.join(' '), config: { headers: { Authorization: markers[1] } },
    response: { status: 400, data: { error: 'invalid_grant', error_description: markers[2], client_secret: markers[0] } } };
  const result = metadata(error, { providerReason: true });
  assert.deepEqual(result, { status: 400, code: null, reason: 'invalid_grant' });
  for (const value of markers) assert.equal(JSON.stringify(result).includes(value), false);
  assert.deepEqual(metadata({ response: { status: 403, data: { error: { errors: [{ reason: 'insufficientPermissions' }] } } } },
    { providerReason: true }), { status: 403, code: null, reason: 'insufficientPermissions' });
  assert.deepEqual(metadata({ response: { status: 400, data: { error: markers[0] } } }, { providerReason: true }),
    { status: 400, code: null, reason: null });
});

function activeAdminClient() {
  return {
    auth: { getClaims: async () => ({ data: { claims: { sub: 'fixture-admin' } }, error: null }) },
    from() {
      const query = { select() { return query; }, eq() { return query; },
        maybeSingle: async () => ({ data: { active: true }, error: null }) };
      return query;
    },
  };
}

function cancellationFixture({ calendarError = null, databaseError = null } = {}) {
  let updates = 0;
  const booking = { id: 'fixture-booking', status: 'confirmed', payment_flow: null, google_event_id: 'fixture-event' };
  const modules = testModules({
    'next/server': { NextResponse: { json: (data, init = {}) => ({ data, status: init.status ?? 200 }) } },
    '@/lib/supabase/server': { createClient: async () => activeAdminClient() },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ from() {
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; },
        update() { updates++; return query; },
        maybeSingle: async () => updates ? { data: null, error: databaseError } : { data: booking, error: null },
      };
      return query;
    } }) },
    '@/lib/google/calendar': { deleteGoogleCalendarEvent: async () => { if (calendarError) throw calendarError; } },
    '@/lib/email/send-booking-change-email': { sendBookingChangeEmail: async () => { throw new Error('No email after failed cancellation'); } },
  });
  const route = modules.load('src/app/api/bookings/[id]/cancel/route.ts');
  return { run: () => route.POST({}, { params: Promise.resolve({ id: booking.id }) }), logs: modules.logs, get updates() { return updates; } };
}

test('Calendar cancellation caller logs safe diagnostics and keeps the failed operation unchanged', async () => {
  const fixture = cancellationFixture({ calendarError: {
    response: { status: 503, data: { token: markers[2] } },
    config: { headers: { Authorization: markers[1] }, data: markers[0] },
  } });
  const result = await fixture.run();
  assert.equal(result.status, 502);assert.equal(fixture.updates, 0);
  assert.deepEqual(fixture.logs, [['Google Calendar cancellation error:', { status: 503, code: null }]]);
  for (const marker of markers) assert.equal(JSON.stringify(fixture.logs).includes(marker), false);
});

test('booking cancellation database failure logs its SQLSTATE without private failing-row data', async () => {
  const fixture = cancellationFixture({ databaseError: { code: '23502', details: markers.join(' '), message: markers[2] } });
  const result = await fixture.run();
  assert.equal(result.status, 500);assert.equal(fixture.updates, 1);
  assert.deepEqual(fixture.logs, [['Booking cancellation database error:', { status: null, code: '23502' }]]);
  for (const marker of markers) assert.equal(JSON.stringify(fixture.logs).includes(marker), false);
});

test('mark-paid error preserves its business validation response without logging transport details', async () => {
  const error = Object.assign(new Error('Fixture business validation'), {
    code: '23514', config: { headers: { Authorization: markers[1] }, data: markers[0] },
  });
  const modules = testModules({
    'next/server': { NextResponse: { json: (data, init = {}) => ({ data, status: init.status ?? 200 }) } },
    'next/cache': { revalidatePath() {} },
    '@/lib/admin/is-active-admin': { isActiveAdmin: async () => true },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ from() {
      const query = { select() { return query; }, eq() { return query; },
        maybeSingle: async () => ({ data: { payment_flow: null }, error: null }) };
      return query;
    } }) },
    '@/lib/intake/activate-booking-intake': { activateBookingIntake: async () => { throw error; } },
  });
  const route = modules.load('src/app/api/admin/payments/mark-paid/route.ts');
  const result = await route.POST({ url: 'http://localhost:3000/api/admin/payments/mark-paid', json: async () => ({ bookingId: 'fixture-booking' }) });
  assert.equal(result.status, 400);assert.equal(result.data.error, 'Fixture business validation');
  assert.deepEqual(modules.logs, [['Mark paid error:', { status: null, code: '23514' }]]);
  for (const marker of markers) assert.equal(JSON.stringify(modules.logs).includes(marker), false);
});

for (const method of ['PATCH', 'POST']) {
  test(`Intake ${method} database failure never logs private answers or access material`, async () => {
    const privateValues = [...markers, 'synthetic-private-intake-answer', 'fixture@example.test'];
    const databaseError = { code: '23514', message: privateValues[4], details: privateValues.join(' '), hint: markers[2] };
    const rpcCalls = [];
    const modules = testModules({
      'next/server': { NextResponse: { json: (data, init = {}) => ({ data, status: init.status ?? 200 }) } },
      '@/lib/intake/get-intake-by-token': { getIntakeByToken: async () => ({
        form: { id: 'fixture-intake', source_type: 'manual', status: 'active', submitted_at: null,
          expires_at: '2099-01-01T00:00:00Z', invitee_name: 'Fixture', invitee_email: 'fixture@example.test' },
        booking: null,
      }) },
      '@/lib/supabase/admin': { getSupabaseAdmin: () => ({
        async rpc(name, args) {
          rpcCalls.push({ name, args });
          return { data: null, error: databaseError };
        },
        from() { assert.fail('A failed consent RPC must not fall back to unrecorded answer writes'); },
      }) },
      '@/lib/email/send-intake-subimssion-mail': { sendIntakeSubmissionEmail: async () => { throw new Error('Must not send mail after rejected save'); } },
    });
    const api = modules.load('src/app/api/intake/[token]/route.ts');
    const result = await api[method]({ json: async () => ({ age: 30, motivation: privateValues[4],
      sensitiveDataConsent: true,
      privacyNoticeVersion: modules.load('src/lib/legal/documents.ts').PRIVACY_NOTICE_VERSION,
    }) }, { params: Promise.resolve({ token: 'fixture-private-token' }) });
    assert.equal(result.status, 500);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].name, 'save_intake_with_legal_consent_v1');
    assert.equal(rpcCalls[0].args.p_form_id, 'fixture-intake');
    assert.equal(rpcCalls[0].args.p_access_token_hash,
      modules.load('src/lib/intake/intake-access.ts').hashIntakeToken('fixture-private-token'));
    assert.equal(rpcCalls[0].args.p_answers.age, 30);
    assert.equal(rpcCalls[0].args.p_answers.motivation, privateValues[4]);
    assert.equal(rpcCalls[0].args.p_submit, method === 'POST');
    assert.equal(rpcCalls[0].args.p_privacy_notice_version,
      modules.load('src/lib/legal/documents.ts').PRIVACY_NOTICE_VERSION);
    assert.equal(rpcCalls[0].args.p_sensitive_data_consent, true);
    assert.deepEqual(modules.logs, [[method === 'PATCH' ? 'Intake draft error:' : 'Intake submit error:', { status: null, code: '23514' }]]);
    for (const value of privateValues) {
      assert.equal(JSON.stringify(modules.logs).includes(value), false);
      assert.equal(JSON.stringify(result.data).includes(value), false);
    }
  });
}
