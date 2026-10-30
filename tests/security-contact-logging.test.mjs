import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const markers = [
  'synthetic-private-contact-body',
  'synthetic-private-email@example.test',
  'synthetic-private-authorization',
  'https://example.test/formulario/synthetic-private-token',
];

function fixture({ results = [], jsonError = null } = {}) {
  const sends = [];
  const modules = testModules({
    'next/server': { NextResponse: { json: (data, init = {}) => ({ data, status: init.status ?? 200 }) } },
    '@/emails/ContactMessageEmail': { __esModule: true, default: props => ({ type: 'message', ...props }) },
    '@/emails/ContactConfirmationEmail': { __esModule: true, default: props => ({ type: 'confirmation', ...props }) },
    '@/lib/email/resend': { getResend: () => ({ emails: { send: async payload => {
      sends.push(payload);
      const result = results[sends.length - 1];
      if (result instanceof Error) throw result;
      return result ?? { data: { id: `fixture-email-${sends.length}` }, error: null };
    } } }) },
  }, { RESEND_FROM_EMAIL: 'fixture-sender@example.test', CONTACT_TO_EMAIL: 'fixture-coach@example.test' });
  const route = modules.load('src/app/api/contact/route.ts');
  return {
    logs: modules.logs,
    sends,
    run: () => route.POST({ json: async () => {
      if (jsonError) throw jsonError;
      return { name: 'Fixture name', email: markers[1], subject: 'individual', message: markers[0] };
    } }),
  };
}

function assertPrivateLogsAbsent(logs) {
  const serialized = JSON.stringify(logs);
  for (const marker of markers) assert.equal(serialized.includes(marker), false);
}

test('contact provider rejection logs a useful HTTP status without the private Resend error body', async () => {
  const scenario = fixture({ results: [{ data: null, error: {
    statusCode: 422,
    message: markers.join(' '),
    request: { headers: { Authorization: markers[2] }, body: markers[0] },
  } }] });
  const response = await scenario.run();
  assert.equal(response.status, 502);
  assert.equal(scenario.sends.length, 1);
  assert.deepEqual(scenario.logs, [['Contact email error:', { status: 422, code: null }]]);
  assertPrivateLogsAbsent(scenario.logs);
  assertPrivateLogsAbsent([response.data]);
});

test('failed contact confirmation keeps the successful message and redacts provider diagnostics', async () => {
  const scenario = fixture({ results: [
    { data: { id: 'fixture-coach-email' }, error: null },
    { data: null, error: { statusCode: 429, message: markers.join(' '), headers: { Authorization: markers[2] } } },
  ] });
  const response = await scenario.run();
  assert.deepEqual(response, { status: 200, data: { success: true } });
  assert.equal(scenario.sends.length, 2);
  assert.deepEqual(scenario.logs, [['Contact confirmation email error:', { status: 429, code: null }]]);
  assertPrivateLogsAbsent(scenario.logs);
});

test('contact transport exception preserves only the allowed technical code', async () => {
  const error = Object.assign(new Error(markers.join(' ')), {
    code: 'ECONNRESET',
    cause: { Authorization: markers[2], url: markers[3] },
  });
  const scenario = fixture({ results: [error] });
  const response = await scenario.run();
  assert.equal(response.status, 500);
  assert.equal(scenario.sends.length, 1);
  assert.deepEqual(scenario.logs, [['Unexpected contact error:', { status: null, code: 'ECONNRESET' }]]);
  assertPrivateLogsAbsent(scenario.logs);
  assertPrivateLogsAbsent([response.data]);
});

test('thrown confirmation error does not turn a delivered contact message into a failure', async () => {
  const error = Object.assign(new Error(markers.join(' ')), { code: 'ETIMEDOUT' });
  const scenario = fixture({ results: [{ data: { id: 'fixture-coach-email' }, error: null }, error] });
  const response = await scenario.run();
  assert.deepEqual(response, { status: 200, data: { success: true } });
  assert.equal(scenario.sends.length, 2);
  assert.deepEqual(scenario.logs, [['Contact confirmation email error:', { status: null, code: 'ETIMEDOUT' }]]);
  assertPrivateLogsAbsent(scenario.logs);
});

test('malformed contact JSON never logs the private input fragment from SyntaxError', async () => {
  const scenario = fixture({ jsonError: new SyntaxError(`Unexpected token in ${markers.join(' ')}`) });
  const response = await scenario.run();
  assert.equal(response.status, 500);
  assert.equal(scenario.sends.length, 0);
  assert.deepEqual(scenario.logs, [['Unexpected contact error:', { status: null, code: null }]]);
  assertPrivateLogsAbsent(scenario.logs);
  assertPrivateLogsAbsent([response.data]);
});
