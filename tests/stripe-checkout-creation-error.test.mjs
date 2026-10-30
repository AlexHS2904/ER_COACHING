import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { testModules } from './helpers/load-typescript.mjs';

const { classifyCheckoutCreationError: classify } = testModules().load('src/lib/stripe/checkout-creation-error.ts');
// The TypeScript test loader uses CommonJS; construct errors from that same SDK.
const Stripe = createRequire(import.meta.url)('stripe');
const initial = { operation: 'create', priorOutcome: 'no_session' };
const invalid = () => new Stripe.errors.StripeInvalidRequestError({
  type: 'invalid_request_error', statusCode: 400, param: 'payment_method_types',
  message: 'The payment_method_types parameter is no longer supported when creating a Checkout Session.',
});

for (const [label, error, code] of [
  ['invalid_request_error reproducing ER-3052FC70', invalid(), 'stripe_invalid_request'],
  ['authentication', new Stripe.errors.StripeAuthenticationError({statusCode:401}), 'stripe_authentication_failed'],
  ['permission', new Stripe.errors.StripePermissionError({statusCode:403}), 'stripe_permission_denied'],
]) {
  test(`${label}: definite creation rejection is failed with sanitized diagnostic`,()=>{
    assert.deepEqual(classify(error,initial),{status:'failed',last_error:code});
  });
}
for (const [label,error] of [
  ['timeout',new Stripe.errors.StripeConnectionError({message:'Request timed out'})],
  ['socket',Object.assign(new Error('socket closed'),{code:'ECONNRESET'})],
  ['5xx',new Stripe.errors.StripeAPIError({statusCode:500})],
  ['unknown',new Error('unknown')],
  ['plain 400',Object.assign(new Error('bad request'),{statusCode:400})],
  ['forged type',{type:'StripeInvalidRequestError',rawType:'invalid_request_error',statusCode:400}],
  ['idempotency conflict',new Stripe.errors.StripeIdempotencyError({statusCode:400})],
  ['rate limit',new Stripe.errors.StripeRateLimitError({statusCode:429})],
  ['invalid request with 5xx',new Stripe.errors.StripeInvalidRequestError({type:'invalid_request_error',statusCode:500})],
  ['missing status',new Stripe.errors.StripeInvalidRequestError({type:'invalid_request_error'})],
  ['contention',new Stripe.errors.StripeInvalidRequestError({type:'invalid_request_error',statusCode:400,code:'idempotency_key_in_use'})],
  ['retry advice',new Stripe.errors.StripeInvalidRequestError({type:'invalid_request_error',statusCode:400,headers:{'stripe-should-retry':'true'}})],
  ['payment object',new Stripe.errors.StripeInvalidRequestError({type:'invalid_request_error',statusCode:400,payment_intent:{id:'pi_test'}})],
]) {
  test(`${label}: remains unknown`,()=>{
    assert.deepEqual(classify(error,initial),{status:'unknown',last_error:'stripe_request_unknown'});
  });
}
for (const context of [
  {operation:'create',priorOutcome:'unknown'},
  {operation:'create',priorOutcome:'session_exists'},
  {operation:'retrieve',priorOutcome:'session_exists'},
]) {
  test(`definitive last response does not erase ${context.operation}/${context.priorOutcome}`,()=>{
    assert.equal(classify(invalid(),context).status,'unknown');
  });
}
