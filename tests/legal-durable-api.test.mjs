import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

// These tests exercise actual routes with a mocked RPC transport. They do not
// execute the prepared migration or claim to verify PostgreSQL transactions.
const version = testModules().load('src/lib/legal/documents.ts').PRIVACY_NOTICE_VERSION;
const token = 'a'.repeat(64);
const databaseTimestamp = '2026-10-29T20:45:35.123456+00:00';
const privateAnswer = 'fixture-private-intake-answer';
const accepted = { sensitiveDataConsent: true, privacyNoticeVersion: version, age: 30 };

function fixture({ rpcError = null, rejection = null } = {}) {
  const calls = [], emailStatusWrites = [], emails = [];
  const form = { id: 'fixture-form', source_type: 'manual', status: 'active', submitted_at: null,
    expires_at: '2099-01-01T00:00:00Z', invitee_name: 'Fixture name', invitee_email: 'fixture@example.test' };
  const modules = testModules({
    'next/server': { NextResponse: { json: (data, init = {}) => ({ data, status: init.status ?? 200 }) } },
    '@/lib/security/public-abuse': { enforcePublicAbuse: async () => null },
    '@/lib/intake/get-intake-by-token': { getIntakeByToken: async () => ({ form, booking: null }) },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({
      async rpc(name, args) {
        calls.push({ name, args });
        if (rpcError) return { data: null, error: rpcError };
        if (rejection) return { data: { error_code: rejection }, error: null };
        return { data: { form: { ...form, ...args.p_answers,
          sensitive_data_consent_at: databaseTimestamp, sensitive_data_consent_version: version,
          status: args.p_submit ? 'submitted' : 'active',
          submitted_at: args.p_submit ? databaseTimestamp : null } }, error: null };
      },
      from(table) {
        assert.equal(table, 'booking_intake_forms');
        const query = { update(value) { emailStatusWrites.push(value); return query; }, eq() { return query; },
          then(resolve) { return Promise.resolve({ error: null }).then(resolve); } };
        return query;
      },
    }) },
    '@/lib/email/send-intake-subimssion-mail': { sendIntakeSubmissionEmail: async payload => {
      emails.push(payload); return { error: null };
    } },
  });
  const route = modules.load('src/app/api/intake/[token]/route.ts');
  return { calls, emailStatusWrites, emails, logs: modules.logs,
    run: (method, body) => route[method]({ json: async () => body }, { params: Promise.resolve({ token }) }) };
}

for (const method of ['PATCH', 'POST']) {
  for (const age of [undefined, null, '30', 0, 17, 17.9, 18.5, 121]) {
    test(`Intake ${method} rejects invalid/non-adult age ${String(age)} before a write RPC`, async () => {
      const f = fixture();
      const result = await f.run(method, { ...accepted, age, currentSituation: privateAnswer });
      assert.equal(result.status, 400);
      assert.match(result.data.error, /al menos 18 años/);
      assert.deepEqual(f.calls, []);
      assert.deepEqual(f.emailStatusWrites, []);
      assert.deepEqual(f.emails, []);
      assert.equal(JSON.stringify([result.data, f.logs]).includes(privateAnswer), false);
    });
  }

  test(`Intake ${method} sends consent and sanitized answers in exactly one owned RPC`, async () => {
    const f = fixture();
    const result = await f.run(method, { ...accepted, currentStep: 3, currentSituation: privateAnswer,
      id: 'another-form', booking_id: 'another-booking', status: 'submitted',
      sensitive_data_consent_at: '1900-01-01T00:00:00Z', invitee_email: 'attacker@example.test' });
    assert.equal(result.status, 200);
    assert.equal(f.calls.length, 1);
    const { name, args } = f.calls[0];
    assert.equal(name, 'save_intake_with_legal_consent_v1');
    assert.equal(args.p_form_id, 'fixture-form');
    assert.equal(args.p_access_token_hash, createHash('sha256').update(token).digest('hex'));
    assert.equal(args.p_privacy_notice_version, version);
    assert.equal(args.p_sensitive_data_consent, true);
    assert.equal(args.p_submit, method === 'POST');
    assert.equal(args.p_current_step, method === 'POST' ? 5 : 3);
    assert.equal(args.p_answers.current_situation, privateAnswer);
    assert.equal(args.p_answers.age, 30);
    for (const forbidden of ['id','booking_id','status','sensitive_data_consent_at','invitee_email','sensitiveDataConsent']) {
      assert.equal(forbidden in args.p_answers, false);
    }
    assert.equal(JSON.stringify(args).includes(token), false);
    if (method === 'POST') {
      assert.equal(result.data.submittedAt, databaseTimestamp);
      assert.equal(f.emails.length, 1);
      assert.equal(f.emails[0].form.sensitive_data_consent_at, databaseTimestamp);
    } else assert.deepEqual(f.emails, []);
    assert.ok(f.emailStatusWrites.every(value => Object.keys(value)
      .every(key => ['coach_email_sent_at','coach_email_error'].includes(key))));
  });

  test(`Intake ${method} has no unsafe fallback when the unapplied RPC is unavailable`, async () => {
    const f = fixture({ rpcError: { code: 'PGRST202', message: privateAnswer } });
    const result = await f.run(method, { ...accepted, currentSituation: privateAnswer });
    assert.equal(result.status, 500);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.emailStatusWrites, []);
    assert.deepEqual(f.emails, []);
    assert.equal(JSON.stringify([result.data, f.logs]).includes(privateAnswer), false);
  });

  for (const [rejection, status] of [['already_submitted',409],['expired',410],['inactive',410],
    ['invalid_access',403],['booking_unavailable',403],['invalid_age',400],['consent_required',400]]) {
    test(`Intake ${method} respects the atomic RPC's ${rejection} revalidation`, async () => {
      const f = fixture({ rejection });
      const result = await f.run(method, accepted);
      assert.equal(result.status, status);
      assert.deepEqual(f.emailStatusWrites, []);
      assert.deepEqual(f.emails, []);
    });
  }
}

test('adult boundary ages remain valid without inventing a stricter age limit', async () => {
  for (const age of [18, 120]) {
    const f = fixture();
    assert.equal((await f.run('PATCH', { ...accepted, age })).status, 200);
    assert.equal(f.calls[0].args.p_answers.age, age);
  }
});

const migration = readFileSync(new URL('../supabase/migrations/20261029204535_legal_consent_evidence.sql', import.meta.url), 'utf8');
const functionNames = [
  'assert_current_legal_acceptance_v1', 'record_booking_legal_acceptance_v1',
  'create_stripe_booking_hold_with_legal_v1', 'create_booking_with_legal_v1',
  'create_package_booking_with_legal_v1', 'save_intake_with_legal_consent_v1',
];

test('prepared SQL contains only additive nullable evidence and no top-level historical DML', () => {
  const topLevel = migration.replace(/\$(f|checks)\$[\s\S]*?\$\1\$/g, '$body$');
  assert.doesNotMatch(topLevel, /^\s*(?:UPDATE|INSERT|DELETE|MERGE|TRUNCATE)\b/im);
  assert.equal((topLevel.match(/ADD COLUMN IF NOT EXISTS/g) ?? []).length, 6);
  assert.doesNotMatch(topLevel, /ADD COLUMN[^;]*\bDEFAULT\b/);
  assert.doesNotMatch(topLevel, /(?:CREATE|DROP)\s+(?:TABLE|INDEX|TRIGGER|POLICY)/i);
  assert.doesNotMatch(topLevel, /DISABLE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY|CREATE OR REPLACE FUNCTION/i);
  assert.deepEqual([...migration.matchAll(/CREATE FUNCTION public\.([a-z_0-9]+)/g)].map(match => match[1]), functionNames);
});

test('prepared new RPCs retain fixed search paths and service-role-only execution', () => {
  assert.equal((migration.match(/SECURITY INVOKER SET search_path = pg_catalog, pg_temp/g) ?? []).length, 6);
  for (const name of functionNames) {
    assert.match(migration, new RegExp(`ALTER FUNCTION public\\.${name}\\([^;]+ OWNER TO postgres;`));
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+ FROM PUBLIC, anon, authenticated;`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+ TO service_role;`));
  }
});

test('prepared Intake transaction locks booking before form and preserves first server-clock evidence', () => {
  const body = migration.slice(migration.indexOf('CREATE FUNCTION public.save_intake_with_legal_consent_v1'));
  assert.ok(body.indexOf('FROM public.bookings x') < body.indexOf('x.access_token_hash = p_access_token_hash FOR UPDATE'));
  assert.match(body, /f\.booking_id IS DISTINCT FROM expected_booking_id/);
  assert.match(body, /f\.submitted_at IS NOT NULL OR f\.status = 'submitted'/);
  assert.match(body, /b\.payment_status IS DISTINCT FROM 'paid'/);
  assert.match(body, /saved_at := clock_timestamp\(\)/);
  assert.match(body, /sensitive_data_consent_at = coalesce\(f\.sensitive_data_consent_at, saved_at\)/);
  assert.match(body, /sensitive_data_consent_version = coalesce\(f\.sensitive_data_consent_version, p_privacy_notice_version\)/);
  assert.match(body, /submitted_at = CASE WHEN p_submit THEN saved_at ELSE f\.submitted_at END/);
  assert.doesNotMatch(body, /p_(?:accepted_at|submitted_at|ip|user_agent)/);
});

test('prepared booking wrapper delegates financial behavior and never rewrites evidence on recovery', () => {
  const record = migration.slice(migration.indexOf('CREATE FUNCTION public.record_booking_legal_acceptance_v1'),
    migration.indexOf('CREATE FUNCTION public.create_stripe_booking_hold_with_legal_v1'));
  assert.match(record, /x\.booking_access_token_hash = p_access_token_hash FOR UPDATE/);
  assert.match(record, /IF b\.legal_terms_accepted_at IS NOT NULL THEN RETURN true; END IF/);
  assert.doesNotMatch(record, /SET (?:status|payment_status|payment_expires_at|created_at|paid_at)/);
  const hold = migration.slice(migration.indexOf('CREATE FUNCTION public.create_stripe_booking_hold_with_legal_v1'),
    migration.indexOf('CREATE FUNCTION public.create_booking_with_legal_v1'));
  assert.match(hold, /result := public\.create_stripe_booking_hold_v1/);
  assert.match(hold, /PERFORM public\.record_booking_legal_acceptance_v1/);
  assert.doesNotMatch(hold, /INSERT INTO|UPDATE public\.bookings|payment_expires_at\s*=/);
});
