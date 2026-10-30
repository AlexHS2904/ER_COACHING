import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { stripeCheckoutTransport } from './helpers/stripe-checkout-transport.mjs';
import { testModules } from './helpers/load-typescript.mjs';
import { assertNoRetiredE2EConfiguration } from '../scripts/dev-stripe-test.mjs';

test('retired runtime fault variables are rejected, not accepted as configuration',()=>{
  assert.doesNotThrow(()=>assertNoRetiredE2EConfiguration({}));
  for(const key of ['STRIPE_E2E_FORCE_CREATE_FAILURE','STRIPE_E2E_DEV_RUN_DIR','STRIPE_E2E_DEV_RUN_TOKEN'])
    assert.throws(()=>assertNoRetiredE2EConfiguration({[key]:'fixture'}),/retired/);
  assert.equal(existsSync(new URL('../src/lib/stripe/e2e-create-failure.ts',import.meta.url)),false);
  assert.doesNotMatch(readFileSync(new URL('../src/lib/stripe/checkout.ts',import.meta.url),'utf8'),/e2eCreateFailure|STRIPE_E2E_|tests\//);
});

test('test-only transport produces official SDK error and real deterministic classification without a Session',async()=>{
  const t=stripeCheckoutTransport({rejectFirstCreate:true});
  const classify=testModules().load('src/lib/stripe/checkout-creation-error.ts').classifyCheckoutCreationError;
  await assert.rejects(t.client.checkout.sessions.create({mode:'payment'},{idempotencyKey:'fixture-first'}),e=>{
    assert.equal(e.statusCode,400);assert.equal(e.rawType,'invalid_request_error');
    assert.deepEqual(classify(e,{operation:'create',priorOutcome:'no_session'}),{status:'failed',last_error:'stripe_invalid_request'});return true;
  });
  assert.equal(t.calls.rejections,1);assert.equal(t.sessions.size,0);assert.equal(t.calls.created.length,0);
});

test('normal test transport creation and same-key retries reuse one Session',async()=>{
  const t=stripeCheckoutTransport();
  const payload={mode:'payment',line_items:[{quantity:1,price_data:{unit_amount:50000,currency:'mxn',product_data:{name:'Fixture'}}}],expires_at:2100000000};
  const first=await t.client.checkout.sessions.create(payload,{idempotencyKey:'fixture-successor'});
  const retry=await t.client.checkout.sessions.create(payload,{idempotencyKey:'fixture-successor'});
  assert.equal(first.id,retry.id);assert.equal(first.amount_total,50000);assert.equal(first.currency,'mxn');
  assert.equal(t.sessions.size,1);assert.equal(t.calls.created.length,1);
});
