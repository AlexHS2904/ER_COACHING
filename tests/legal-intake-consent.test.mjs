import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const version = '2026-10-29.2';
const accepted = { sensitiveDataConsent: true, privacyNoticeVersion: version };
const privateAnswer = 'fixture-private-open-answer';

for (const method of ['saveDraft', 'submit']) {
  test(`Intake browser ${method} never transmits answers without separate consent`, async () => {
    const source = readFileSync(new URL('../src/components/intake/IntakeFormWizard.tsx', import.meta.url), 'utf8');
    const tree = ts.createSourceFile('wizard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let handler;
    (function visit(node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === method) handler = node;
      ts.forEachChild(node, visit);
    })(tree);
    assert.ok(handler);
    const compiled = ts.transpileModule(handler.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const errors = [];
    const run = new Function('sensitiveDataConsent', 'isAdult', 'setError', 'fetch', 'setSaving',
      `${compiled}\nreturn ${method};`)(false, true, error => errors.push(error),
      () => assert.fail('answers must not leave the browser before consent'),
      () => assert.fail('the submission must not start'));
    await run(2);
    assert.match(errors[0], /datos sensibles/);
  });
}

function fixture({ status = 'active', submittedAt = null } = {}) {
  const updates = [], emails = [];
  const form = { id: 'fixture-form', booking_id: null, source_type: 'manual', status,
    submitted_at: submittedAt, expires_at: '2099-01-01T00:00:00Z',
    invitee_name: 'Fixture name', invitee_email: 'fixture@example.test' };
  const db = {
    from(table) {
      assert.equal(table, 'booking_intake_forms');
      const query = {
        update(value) {
          assert.ok(Object.keys(value).every(key => ['coach_email_sent_at', 'coach_email_error'].includes(key)),
            'answers and evidence must use one RPC, never a direct update');
          return query;
        },
        eq() { return query; },
        then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
      };
      return query;
    },
    async rpc(name, args) {
      assert.equal(name, 'save_intake_with_legal_consent_v1');
      assert.equal(args.p_form_id, form.id);
      assert.match(args.p_access_token_hash, /^[a-f0-9]{64}$/);
      assert.equal(args.p_sensitive_data_consent, true);
      assert.equal(args.p_privacy_notice_version, version);
      const value = { ...args.p_answers,
        current_step: args.p_current_step,
        sensitive_data_consent_at: '2026-10-29T20:00:00Z',
        sensitive_data_consent_version: args.p_privacy_notice_version,
        ...(args.p_submit ? { status: 'submitted', submitted_at: '2026-10-29T20:00:00Z' } : {}),
      };
      updates.push(value);
      return { data: { form: { ...form, ...value } }, error: null };
    },
  };
  const modules = testModules({
    'next/server': { NextResponse: { json: (data, init = {}) => ({ data, status: init.status ?? 200 }) } },
    '@/lib/legal/documents': { PRIVACY_NOTICE_VERSION: version },
    '@/lib/security/public-abuse': { enforcePublicAbuse: async () => null },
    '@/lib/intake/get-intake-by-token': { getIntakeByToken: async () => ({ form, booking: null }) },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => db },
    '@/lib/email/send-intake-subimssion-mail': { sendIntakeSubmissionEmail: async payload => {
      emails.push(payload); return { error: null };
    } },
  });
  const route = modules.load('src/app/api/intake/[token]/route.ts');
  return { updates, emails, modules, run: (method, body) => route[method](
    { json: async () => ({ age: 30, ...body }) }, { params: Promise.resolve({ token: 'fixture-private-token' }) },
  ) };
}

for (const method of ['PATCH', 'POST']) {
  for (const [label, consent] of [
    ['missing acceptance', {}],
    ['unchecked acceptance', { ...accepted, sensitiveDataConsent: false }],
    ['string acceptance', { ...accepted, sensitiveDataConsent: 'true' }],
    ['missing notice version', { sensitiveDataConsent: true }],
    ['stale notice version', { ...accepted, privacyNoticeVersion: 'older-fixture-version' }],
  ]) {
    test(`Intake ${method} rejects ${label} before writes or email`, async () => {
      const f = fixture();
      const result = await f.run(method, { ...consent, currentSituation: privateAnswer });
      assert.equal(result.status, 400);
      assert.match(result.data.error, /Aviso de Privacidad vigente/);
      assert.deepEqual(f.updates, []);
      assert.deepEqual(f.emails, []);
      assert.equal(JSON.stringify([result.data, f.modules.logs]).includes(privateAnswer), false);
    });
  }

  test(`Intake ${method} sends answers and evidence through the same atomic RPC`, async () => {
    const f = fixture();
    const result = await f.run(method, { ...accepted, currentStep: 2, currentSituation: privateAnswer });
    assert.equal(result.status, 200);
    assert.equal(f.updates[0].current_situation, privateAnswer);
    assert.equal(f.updates[0].sensitiveDataConsent, undefined);
    assert.equal(f.updates[0].privacyNoticeVersion, undefined);
    assert.equal(f.updates[0].sensitive_data_consent_at, '2026-10-29T20:00:00Z');
    assert.equal(f.updates[0].sensitive_data_consent_version, version);
    if (method === 'PATCH') {
      assert.equal(f.updates[0].current_step, 2);
      assert.deepEqual(f.emails, []);
    } else {
      assert.equal(f.updates[0].status, 'submitted');
      assert.ok(Number.isFinite(Date.parse(f.updates[0].submitted_at)));
      assert.equal(f.emails.length, 1);
    }
  });

  for (const age of [null, 17, 17.5, 121, '18']) {
    test(`Intake ${method} rejects age ${age} without saving any open answer`, async () => {
      const f = fixture();
      const result = await f.run(method, { ...accepted, age, currentSituation: privateAnswer });
      assert.equal(result.status, 400);
      assert.match(result.data.error, /18 años/);
      assert.deepEqual(f.updates, []);
      assert.deepEqual(f.emails, []);
      assert.equal(JSON.stringify([result.data, f.modules.logs]).includes(privateAnswer), false);
    });
  }

  test(`Intake ${method} keeps submitted access closed without requesting another consent`, async () => {
    const f = fixture({ status: 'submitted', submittedAt: '2026-10-29T00:00:00Z' });
    const result = await f.run(method, {});
    assert.equal(result.status, 409);
    assert.deepEqual(f.updates, []);
    assert.deepEqual(f.emails, []);
  });
}

function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
}

function wizardFixture(currentStep, age = 30) {
  const states = [];
  let cursor = 0;
  const modules = testModules({
    react: { useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } },
    '@/lib/legal/documents': { PRIVACY_NOTICE_VERSION: version },
  });
  const Wizard = modules.load('src/components/intake/IntakeFormWizard.tsx').default;
  const initialData = { currentStep, age, occupation: 'employee', currentSituation: privateAnswer,
    discoverySource: '', motivation: privateAnswer, currentChallenges: [], challengeDuration: null,
    desiredOutcome: privateAnswer, desiredChange: '', blockingFactors: '', strengths: '',
    mainConcern: privateAnswer, previousAttempts: privateAnswer, supportPreferences: [], additionalNotes: privateAnswer };
  return { render() { cursor = 0; return Wizard({ token: 'fixture-token', customerName: 'Fixture name',
    customerEmail: 'fixture@example.test', initialData }); } };
}

for (const currentStep of [1, 4]) {
  test(`Intake consent starts unchecked and hides new/resumed answers at step ${currentStep}`, () => {
    const f = wizardFixture(currentStep);
    let tree = f.render();
    let nodes = elements(tree);
    const inputs = nodes.filter(node => node.type === 'input');
    assert.equal(inputs.length, 2);
    const checkbox = inputs.find(node => node.props.type === 'checkbox');
    assert.equal(checkbox.props.checked, false);
    assert.equal(inputs.find(node => node.props.type === 'number').props.min, 18);
    assert.equal(JSON.stringify(tree).includes(privateAnswer), false);
    let begin = nodes.find(node => node.type === 'button');
    assert.equal(begin.props.disabled, true);
    begin.props.onClick();
    assert.equal(JSON.stringify(f.render()).includes(privateAnswer), false);
    const notice = nodes.find(node => node.type === 'a');
    assert.equal(notice.props.href, '/aviso-de-privacidad');
    assert.equal(notice.props.target, '_blank');
    assert.equal(notice.props.rel, 'noopener noreferrer');
    assert.match(JSON.stringify(tree), /consiento expresamente/);
    assert.match(JSON.stringify(tree), /voluntarias/);
    assert.equal(JSON.stringify(tree).includes('Términos y Condiciones'), false);
    checkbox.props.onChange({ target: { checked: true } });
    tree = f.render();
    begin = elements(tree).find(node => node.type === 'button');
    assert.equal(begin.props.disabled, false);
    assert.equal(JSON.stringify(tree).includes(privateAnswer), false);
    begin.props.onClick();
    tree = f.render();
    assert.equal(JSON.stringify(tree).includes(privateAnswer), true);
    assert.equal(elements(tree).some(node => node.type === 'a' && node.props.href === '/aviso-de-privacidad'), true);
  });
}

for (const [currentStep, method] of [[1, 'PATCH'], [5, 'POST']]) {
  test(`Intake UI includes the separate acceptance and notice version in ${method}`, async () => {
    const f = wizardFixture(currentStep);
    let tree = f.render();
    elements(tree).find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    tree = f.render();
    elements(tree).find(node => node.type === 'button').props.onClick();
    tree = f.render();
    const calls = [];
    const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
    globalThis.fetch = async (url, options) => {
      calls.push({ url, method: options.method, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ success: true }) };
    };
    globalThis.window = { scrollTo() {} };
    try {
      const buttons = elements(tree).filter(node => node.type === 'button');
      await buttons.at(-1).props.onClick();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, method);
      assert.equal(calls[0].body.sensitiveDataConsent, true);
      assert.equal(calls[0].body.privacyNoticeVersion, version);
      assert.equal(calls[0].body.currentSituation, privateAnswer);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });
}

for (const age of [null, 17, 17.5, 121]) {
  test(`Intake does not reveal open answers or enable entry for ineligible age ${age}`, () => {
    const f = wizardFixture(1, age);
    let tree = f.render();
    const checkbox = elements(tree).find(node => node.type === 'input' && node.props.type === 'checkbox');
    assert.equal(checkbox.props.checked, false);
    assert.equal(checkbox.props.disabled, true);
    checkbox.props.onChange({ target: { checked: true } });
    tree = f.render();
    const begin = elements(tree).find(node => node.type === 'button');
    assert.equal(begin.props.disabled, true);
    begin.props.onClick();
    assert.equal(JSON.stringify(f.render()).includes(privateAnswer), false);
    assert.equal(elements(f.render()).some(node => node.type === 'textarea'), false);
  });
}
