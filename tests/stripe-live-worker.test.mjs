import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';
import { stripeRuntimeFixture, stripeFixtureConfig } from './helpers/stripe-runtime-fixture.mjs';

test('worker scopes every batch and one failing job does not starve changes or reminders while sales are paused',async()=>{
  const calls=[],filters=[];
  const query={select(){return this;},eq(...args){filters.push(args);return this;},in(){return this;},lte(){return this;},order(){return this;},
    async limit(){return {data:[{id:'broken'},{id:'ready'}],error:null};}};
  const db={from:()=>query};
  const modules=testModules({
    '@/lib/stripe/server':stripeRuntimeFixture(db,{}, {...stripeFixtureConfig,newSalesEnabled:false}),
    '@/lib/stripe/expire-hold':{expireDueStripeHolds:async(_now,options)=>{calls.push('expire');assert.ok(options.deadline);throw new Error('provider unavailable');}},
    '@/lib/bookings/finalize-paid-booking':{finalizePaidBooking:async(id,scope)=>{calls.push(id);assert.equal(scope.accountId,'acct_fixture');if(id==='broken')throw new Error('temporary');return {completed:true};}},
    '@/lib/bookings/stripe-booking-changes':{processStripeBookingChange:async()=>{calls.push('change');return {completed:true};}},
    '@/lib/intake/process-stripe-reminders':{processStripeIntakeReminders:async options=>{calls.push('reminder');assert.equal(options.limit,2);return {sent:1};}},
  });
  const result=await modules.load('src/lib/stripe/process-pending.ts').processPendingStripeBookings();
  assert.deepEqual(calls,['expire','broken','ready','change','reminder']);
  assert.ok(filters.some(([k,v])=>k==='stripe_mode'&&v==='test'));
  assert.ok(filters.some(([k,v])=>k==='stripe_account_id'&&v==='acct_fixture'));
  assert.deepEqual(result,{processed:1,deferred:2,remindersSent:1,changesProcessed:1,budgetExhausted:false});
});

test('worker respects its elapsed budget before dispatching another phase',async()=>{
  let dispatched=0;
  const modules=testModules({
    '@/lib/stripe/server':stripeRuntimeFixture({from:()=>{throw new Error('no time for DB batch');}}),
    '@/lib/stripe/expire-hold':{expireDueStripeHolds:async()=>({deferred:0})},
    '@/lib/bookings/finalize-paid-booking':{finalizePaidBooking:async()=>dispatched++},
    '@/lib/bookings/stripe-booking-changes':{processStripeBookingChange:async()=>dispatched++},
    '@/lib/intake/process-stripe-reminders':{processStripeIntakeReminders:async()=>dispatched++},
  });
  const result=await modules.load('src/lib/stripe/process-pending.ts').processPendingStripeBookings({budgetMs:0});
  assert.equal(dispatched,0);assert.equal(result.budgetExhausted,true);
});

function route(env={}) {
  let calls=0;
  const module=testModules({
    'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200,headers:options.headers})}},
    '@/lib/stripe/server':{getStripeConfig:()=>({mode:'live',newSalesEnabled:false})},
    '@/lib/stripe/process-pending':{processPendingStripeBookings:async()=>{calls++;return {processed:1};}},
  },env).load('src/app/api/internal/stripe/process-pending/route.ts');
  return {...module,get calls(){return calls;}};
}
const secret='test-only-worker-secret-'.repeat(3);
const request=token=>({headers:new Headers(token?{authorization:`Bearer ${token}`}:{})});
test('production Cron and external worker have distinct server-held secrets, no cookie/query authorization',async()=>{
  const f=route({VERCEL:'1',VERCEL_ENV:'production',CRON_SECRET:secret,STRIPE_WORKER_SECRET:secret+'external',STRIPE_LOCAL_WORKER_SECRET:secret+'local'});
  for(const method of ['GET','POST']) {
    assert.equal((await f[method](request())).status,401);
    assert.equal((await f[method](request('wrong'))).status,401);
    assert.equal((await f[method]({headers:new Headers({cookie:`CRON_SECRET=${secret}`}),url:`https://example.test?secret=${secret}`})).status,401);
  }
  assert.equal((await f.GET(request(secret))).status,200);
  assert.equal((await f.POST(request(secret+'external'))).status,200);
  assert.equal((await f.POST(request(secret+'local'))).status,401);
  assert.equal(f.calls,2);
});
test('Cron cannot run on preview or localhost, local POST stays independently authenticated',async()=>{
  const f=route({VERCEL_ENV:'preview',CRON_SECRET:secret,STRIPE_LOCAL_WORKER_SECRET:secret});
  assert.equal((await f.GET(request(secret))).status,401);
  assert.equal((await f.POST(request(secret))).status,200);
  assert.equal((await route({STRIPE_LOCAL_WORKER_SECRET:'short'}).POST(request('short'))).status,401);
});
