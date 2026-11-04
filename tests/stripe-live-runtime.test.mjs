import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';
import { stripeFixtureScope, stripeFixtureConfig, stripeRuntimeFixture, stripeFixtureCatalog } from './helpers/stripe-runtime-fixture.mjs';
const env={STRIPE_MODE:'test',STRIPE_EXPECTED_ACCOUNT_ID:'acct_fixture',STRIPE_SECRET_KEY:'sk_test_fixture_only',
  NEXT_PUBLIC_SITE_URL:'http://localhost:3000',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',
  STRIPE_PAYMENT_METHOD_CONFIGURATION_ID:'pmc_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture_signature_not_real',
  STRIPE_LOCAL_WORKER_SECRET:'fixture-local-worker-secret-not-real-123'};
const live={...env,STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fixture_only',VERCEL:'1',VERCEL_ENV:'production',
  NEXT_PUBLIC_SITE_URL:'https://www.ednarojocoaching.com',NEXT_PUBLIC_SUPABASE_URL:'https://rysgpojjhiljrrwtjguy.supabase.co',
  CRON_SECRET:'fixture-cron-worker-secret-not-real-123'};
function server(changes={},overrides={}){return testModules({'@/lib/supabase/admin':{getSupabaseAdmin:()=>({marker:'authorized database'})},...overrides},{...env,...changes}).load('src/lib/stripe/server.ts');}
test('sales default off while account-bound recovery remains configured',()=>{
  const s=server();assert.equal(s.isStripeCheckoutEnabled(),false);assert.equal(s.getStripeConfig().mode,'test');
  assert.equal(s.getStripeBookingAdmin().marker,'authorized database');
});
for(const prefix of ['sk_live_', 'rk_live_']) {
  test(`${prefix} accepted in Live while the sales switch remains enforced`,()=>{
    const config={...live,STRIPE_SECRET_KEY:`${prefix}fixture_only`};
    assert.equal(server(config).getStripeConfig().mode,'live');
    assert.equal(server({...config,PAID_BOOKINGS_ENABLED:'true'}).isStripeCheckoutEnabled(),true);
    const paused=server({...config,PAID_BOOKINGS_ENABLED:'false'});
    assert.equal(paused.getStripeConfig().newSalesEnabled,false);
    assert.equal(paused.isStripeCheckoutEnabled(),false);
    assert.throws(()=>paused.assertStripeSalesReady(),/stripe_new_sales_not_ready/);
    assert.throws(()=>server({STRIPE_SECRET_KEY:config.STRIPE_SECRET_KEY}).getStripeConfig(),/stripe_configuration_invalid/);
  });
}
test('Live rejects both unrestricted and restricted Test keys',()=>{
  for(const key of ['sk_test_fixture_only','rk_test_fixture_only']) {
    const s=server({...live,STRIPE_SECRET_KEY:key,PAID_BOOKINGS_ENABLED:'true'});
    assert.throws(()=>s.getStripeConfig(),/stripe_configuration_invalid/);
    assert.equal(s.isStripeCheckoutEnabled(),false);
  }
});
test('Live exact production environment only, Test cannot share production database',()=>{
  assert.equal(server({...live,PAID_BOOKINGS_ENABLED:'true'}).isStripeCheckoutEnabled(),true);
  for(const changes of [{VERCEL_ENV:'preview'},{VERCEL:undefined},{NEXT_PUBLIC_SITE_URL:'http://www.ednarojocoaching.com'},
    {NEXT_PUBLIC_SITE_URL:'https://ednarojocoaching.com'},{NEXT_PUBLIC_SITE_URL:'https://www.ednarojocoaching.com.evil.test'},
    {NEXT_PUBLIC_SUPABASE_URL:'https://differentprojectabcd.supabase.co'},{STRIPE_SECRET_KEY:'sk_test_fixture_only'}]) {
    assert.equal(server({...live,PAID_BOOKINGS_ENABLED:'true',...changes}).isStripeCheckoutEnabled(),false);
  }
  assert.throws(()=>server({NEXT_PUBLIC_SUPABASE_URL:live.NEXT_PUBLIC_SUPABASE_URL}).getStripeConfig());
});
test('explicit isolated staging accepts only configured preview origin and separate project',()=>{
  const staging={VERCEL_ENV:'preview',NEXT_PUBLIC_SITE_URL:'https://staging.example.test',STRIPE_TEST_SITE_ORIGIN:'https://staging.example.test',
    NEXT_PUBLIC_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',STRIPE_TEST_SUPABASE_PROJECT_REF:'abcdefghijklmnopqrst'};
  assert.equal(server(staging).getStripeConfig().mode,'test');
  assert.throws(()=>server({...staging,NEXT_PUBLIC_SITE_URL:'https://foreign.example.test'}).getStripeConfig());
  assert.throws(()=>server({...staging,STRIPE_TEST_SUPABASE_PROJECT_REF:'rysgpojjhiljrrwtjguy',NEXT_PUBLIC_SUPABASE_URL:live.NEXT_PUBLIC_SUPABASE_URL}).getStripeConfig());
});
test('account verification uses own-account endpoint and pins tested API version',async()=>{
  const calls=[];
  class FakeStripe {constructor(_key,options){calls.push(options);this.accounts={retrieve:async id=>{calls.push(id);return {id:'acct_fixture'};}};}}
  const s=server({}, {stripe:FakeStripe});assert.equal((await s.getVerifiedStripeContext()).config.accountId,'acct_fixture');
  assert.equal(calls[0].apiVersion,'2026-09-30.endive');assert.equal(calls[1],null);
  class WrongStripe {constructor(){this.accounts={retrieve:async()=>({id:'acct_foreign'})};}}
  await assert.rejects(server({}, {stripe:WrongStripe}).getVerifiedStripeContext(),/account_mismatch/);
});
test('record provenance rejects historical NULL, foreign account/mode/origin',()=>{
  const s=server();s.assertStripeRecordScope(stripeFixtureScope,stripeFixtureConfig);
  for(const record of [{},{...stripeFixtureScope,stripe_mode:'live'},{...stripeFixtureScope,stripe_account_id:'acct_foreign'},
    {...stripeFixtureScope,stripe_site_origin:'https://foreign.example.test'}]) assert.throws(()=>s.assertStripeRecordScope(record,stripeFixtureConfig));
});
test('Dynamic Payment Methods config only permits immediate methods, including unknown future methods fail closed',async()=>{
  const s=server(),configuration={active:true,livemode:false,card:{available:true,display_preference:{value:'on'}},link:{display_preference:{value:'on'}}};
  const check=value=>s.verifyImmediatePaymentMethods({paymentMethodConfigurations:{retrieve:async()=>value}},stripeFixtureConfig);
  await check(configuration);
  for(const bad of [{...configuration,active:false},{...configuration,livemode:true},
    {...configuration,oxxo:{display_preference:{value:'on'}}},{...configuration,new_delayed_method:{display_preference:{value:'on'}}},
    {...configuration,card:{available:false,display_preference:{value:'on'}}},
    {...configuration,card:{available:true,display_preference:{value:'off'}}}]) await assert.rejects(check(bad));
});
test('both trusted catalog products required, never launch individual while package unavailable',async()=>{
  const s=server();const check=data=>s.assertStripeCatalogReady({from:()=>({select:async()=>({data,error:null})})});
  assert.equal((await check(stripeFixtureCatalog)).length,2);
  for(const data of [[stripeFixtureCatalog[0]],stripeFixtureCatalog.map(p=>({...p,price:0})),
    stripeFixtureCatalog.map(p=>({...p,requires_quote:true})),stripeFixtureCatalog.map(p=>({...p,currency:'USD'})),
    stripeFixtureCatalog.map(p=>({...p,duration_minutes:null}))]) await assert.rejects(check(data));
});
function eventFixture(changes={}) {
  const config=changes.config??stripeFixtureConfig;
  const metadata={booking_id:'booking',payment_attempt_id:'attempt',booking_reference:'REFERENCE',stripe_mode:config.mode,stripe_account_id:config.accountId};
  const session={id:'cs_test_fixture',object:'checkout.session',livemode:config.mode==='live',mode:'payment',status:'complete',payment_status:'paid',
    client_reference_id:'booking',metadata,payment_intent:'pi_fixture',amount_total:50000,currency:'mxn',payment_method_types:['card'],...changes.session};
  const payment={id:'pi_fixture',status:'succeeded',livemode:config.mode==='live',amount:50000,amount_received:50000,currency:'mxn',metadata,
    latest_charge:{payment_method_details:{type:'card'}},...changes.payment};
  const event={id:'evt_fixture',livemode:config.mode==='live',type:'checkout.session.completed',data:{object:session},...changes.event};
  let writes=0;const db={rpc:async(name,args)=>{assert.equal(name,'apply_stripe_checkout_event_v2');assert.equal(args.p_stripe_account_id,'acct_fixture');
    assert.equal(args.p_session.verified_payment_intent.status,'succeeded');writes++;return {data:{accepted:true,booking_id:'booking'},error:null};}};
  const stripe={paymentIntents:{retrieve:async id=>{assert.equal(id,'pi_fixture');return payment;}}};
  const fn=testModules({'@/lib/stripe/server':stripeRuntimeFixture(db,stripe,config)}).load('src/lib/stripe/webhook.ts').applyStripeCheckoutEvent;
  return {run:()=>fn(event),get writes(){return writes;}};
}
test('verified Live receipt enters only its matching Live ledger context',async()=>{
  const f=eventFixture({config:{...stripeFixtureConfig,mode:'live',siteUrl:live.NEXT_PUBLIC_SITE_URL}});
  assert.equal((await f.run()).accepted,true);assert.equal(f.writes,1);
});
test('verified immediate receipt alone enters mode/account-bound event ledger',async()=>{
  const f=eventFixture();assert.equal((await f.run()).accepted,true);assert.equal(f.writes,1);
});
for(const [name,changes] of [
  ['live event in test',{event:{livemode:true}}],['foreign account',{event:{account:'acct_foreign'}}],
  ['deferred method',{session:{payment_method_types:['oxxo']}}],['unpaid',{session:{payment_status:'unpaid'}}],
  ['processing PI',{payment:{status:'processing'}}],['wrong received amount',{payment:{amount_received:1}}],
  ['foreign PI metadata',{payment:{metadata:{stripe_account_id:'acct_foreign'}}}],
  ['delayed charge',{payment:{latest_charge:{payment_method_details:{type:'oxxo'}}}}],
]) test(`receipt rejected before writes: ${name}`,async()=>{const f=eventFixture(changes);await assert.rejects(f.run());assert.equal(f.writes,0);});

test('new sales require webhook signing and a strong authenticated worker configuration; recovery is independent',()=>{
  for(const changes of [{STRIPE_WEBHOOK_SECRET:undefined},{STRIPE_WEBHOOK_SECRET:'whsec_short'},
    {STRIPE_WEBHOOK_SECRET:'wrong_signature_secret_not_a_real_value'},
    {STRIPE_LOCAL_WORKER_SECRET:undefined},{STRIPE_LOCAL_WORKER_SECRET:'short'},
    {STRIPE_LOCAL_WORKER_SECRET:'fixture contains spaces long enough but invalid'}]) {
    const s=server({PAID_BOOKINGS_ENABLED:'true',...changes});
    assert.equal(s.isStripeCheckoutEnabled(),false);assert.throws(()=>s.assertStripeSalesReady());
    assert.equal(s.getStripeConfig().mode,'test');
  }
  assert.equal(server({PAID_BOOKINGS_ENABLED:'true'}).isStripeCheckoutEnabled(),true);
  const missingWorker=server({...live,PAID_BOOKINGS_ENABLED:'true',CRON_SECRET:undefined,STRIPE_WORKER_SECRET:undefined});
  assert.equal(missingWorker.isStripeCheckoutEnabled(),false);assert.equal(missingWorker.getStripeConfig().mode,'live');
  assert.equal(server({...live,PAID_BOOKINGS_ENABLED:'true',CRON_SECRET:undefined,STRIPE_WORKER_SECRET:'fixture-worker-secret-not-real-123456'}).isStripeCheckoutEnabled(),true);
});
test('Live new sales require charges and payouts enabled; disabling sales never blocks recovery for the same account',async()=>{
  for(const account of [{id:'acct_fixture',charges_enabled:false,payouts_enabled:true},
    {id:'acct_fixture',charges_enabled:true,payouts_enabled:false}]) {
    class FakeStripe {constructor(){this.accounts={retrieve:async()=>account};}}
    const s=server({...live,PAID_BOOKINGS_ENABLED:'true'},{stripe:FakeStripe});
    await assert.rejects(s.getVerifiedStripeContext({forNewSale:true}),/account_not_ready/);
    assert.equal((await s.getVerifiedStripeContext()).config.accountId,'acct_fixture');
  }
  class ReadyStripe {constructor(){this.accounts={retrieve:async()=>({id:'acct_fixture',charges_enabled:true,payouts_enabled:true})};}}
  assert.equal((await server({...live,PAID_BOOKINGS_ENABLED:'true'},{stripe:ReadyStripe}).getVerifiedStripeContext({forNewSale:true})).config.mode,'live');
});
