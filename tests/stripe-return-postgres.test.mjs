import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { localPostgres } from './helpers/local-postgres.mjs';
import { localSupabaseQuery } from './helpers/local-supabase-query.mjs';
import { stripeCheckoutTransport } from './helpers/stripe-checkout-transport.mjs';
import { testModules } from './helpers/load-typescript.mjs';

// All six unchanged migration files run in a disposable Unix-socket PostgreSQL
// cluster. No Docker, environment files, remote database, Stripe network,
// Calendar network or email provider is used by these integration tests.
const pg=localPostgres(),Stripe=createRequire(import.meta.url)('stripe');
const site='http://localhost:3000',webhookSecret='whsec_fixture_only';
const env={INTAKE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,13).toString('base64'),
  RESEND_FROM_EMAIL:'sender@example.test',COACH_EMAIL:'coach@example.test',STRIPE_WEBHOOK_SECRET:webhookSecret};
const migrations=[
  '20261027000100_activate_booking_intake_v2.sql',
  '20261028000100_stripe_test_booking_lifecycle.sql',
  '20261028000200_intake_v2_stable_service_identity.sql',
  '20261028201527_stripe_failed_attempt_recovery.sql',
  '20261029012540_decouple_intake_email_from_finalization.sql',
  '20261029204535_legal_consent_evidence.sql',
].map(name=>new URL(`../supabase/migrations/${name}`,import.meta.url));
before(()=>pg.start(new URL('./fixtures/stripe-local-schema.sql',import.meta.url),migrations));
after(()=>pg.stop());
const rows=sql=>JSON.parse(pg.sql(sql)||'null');
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const booking=id=>rows(`SELECT to_jsonb(b) FROM public.bookings b WHERE id=${literal(id)}`);
const attempts=id=>rows(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id),'[]') FROM public.booking_payment_attempts a WHERE booking_id=${literal(id)}`);
const intakes=id=>rows(`SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.id),'[]') FROM public.booking_intake_forms f WHERE booking_id=${literal(id)}`);
const events=id=>rows(`SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.stripe_event_id),'[]') FROM public.stripe_events e WHERE booking_id=${literal(id)}`);
const evidence=b=>Object.fromEntries(Object.entries(b).filter(([key])=>key.startsWith('legal_')));
const snapshot=id=>({booking:booking(id),attempts:attempts(id),intakes:intakes(id),events:events(id)});
let day=0;

function fixture() {
  const adapter=localSupabaseQuery(pg),checkout=stripeCheckoutTransport();
  const calls={calendar:[],emails:[],events:[]},providerReceipts=new Map(),stripeEvents=[],deferred=[];
  // Reuse the existing SDK Checkout transport; the separate Events resource
  // also goes through Stripe's public SDK HTTP boundary, with no network fallback.
  const eventClient=new Stripe('sk_test_fixture_only',{maxNetworkRetries:0,httpClient:{
    getClientName:()=> 'test-only-return-events',
    async makeRequest(_host,_port,path,method) {
      const url=new URL(path,'https://stripe-fixture.invalid');
      assert.equal(method,'GET');assert.equal(url.pathname,'/v1/events');
      assert.equal(url.searchParams.get('type'),'checkout.session.completed');
      calls.events.push(path);
      const response={object:'list',data:structuredClone(stripeEvents),has_more:false,url:'/v1/events'};
      return {getStatusCode:()=>200,getHeaders:()=>({'request-id':'req_fixture_return_events'}),
        getRawResponse:()=>({}),toStream:()=>{throw new Error('JSON fixture only');},toJSON:async()=>response};
    },
  }});
  checkout.client.events=eventClient.events;
  const db={...adapter,async rpc(name,args){
    const result=await adapter.rpc(name,args);
    // This RPC returns a PostgREST table, unlike the JSON-returning Stripe RPCs.
    return name==='activate_booking_intake_v2'?
      {...result,data:result.data?[result.data]:null}:result;
  }};
  const components=Object.fromEntries(['Body','Button','Container','Head','Heading','Hr','Html','Preview','Section','Text'].map(name=>[name,name]));
  const modules=testModules({
    'next/server':{NextResponse:{json:(data,init={})=>({data,status:init.status??200})},after:callback=>deferred.push(callback)},
    '@/lib/stripe/server':{getStripeBookingAdmin:()=>db,getStripeTestClient:()=>checkout.client,getStripeTestSiteUrl:()=>site},
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>db},
    '@/lib/google/calendar':{ensurePaidBookingCalendar:async input=>{
      calls.calendar.push(input.bookingId);
      return {eventId:`event_${input.bookingId.replaceAll('-','')}`,meetUrl:'https://meet.google.com/fixture-only',calendarUrl:'https://calendar.google.com/fixture-only'};
    }},
    '@/lib/email/resend':{getResend:()=>({emails:{send:async(payload,options)=>{
      calls.emails.push({payload,options});
      const key=options.idempotencyKey;
      if(!providerReceipts.has(key))providerReceipts.set(key,{id:`fixture_email_${providerReceipts.size+1}`});
      return {data:providerReceipts.get(key),error:null};
    }}})},
    'react-email':components,
  },env);
  const checkoutService=modules.load('src/lib/stripe/checkout.ts');
  const returns=modules.load('src/lib/stripe/checkout-return.ts');
  const webhook=modules.load('src/app/api/webhooks/stripe/route.ts');
  return {db,modules,checkout,calls,stripeEvents,providerReceipts,...returns,...checkoutService,
    async deliverWebhook(event) {
      const payload=JSON.stringify(event);
      const signature=checkout.client.webhooks.generateTestHeaderString({payload,secret:webhookSecret});
      const result=await webhook.POST({headers:new Headers({'stripe-signature':signature}),text:async()=>payload});
      await Promise.all(deferred.splice(0).map(callback=>callback()));
      return result;
    },
  };
}

async function openBooking(f) {
  const token=randomBytes(32).toString('hex');
  const access=f.modules.load('src/lib/stripe/access.ts');
  const legal=f.modules.load('src/lib/legal/acceptance.ts').currentBookingAcceptance;
  const h=await f.db.rpc('create_stripe_booking_hold_with_legal_v1',{
    p_service_slug:'sesion-1-1',p_starts_at:new Date(Date.UTC(2036,0,1+2*day++,12)).toISOString(),
    p_customer_name:'Fixture customer',p_customer_email:'customer@example.test',p_customer_phone:null,p_notes:null,
    p_access_token_hash:access.hashBookingAccess(token),p_legal_acceptance:legal,
  });
  assert.equal(h.error,null);
  const id=h.data.booking_id,before=booking(id),originalEvidence=evidence(before);
  assert.ok(originalEvidence.legal_terms_accepted_at);
  assert.equal(originalEvidence.legal_terms_version,legal.termsVersion);
  assert.equal(originalEvidence.legal_adult_confirmed_at,originalEvidence.legal_terms_accepted_at);
  assert.equal(pg.sql(`SELECT payment_expires_at=created_at+interval '30 minutes' FROM public.bookings WHERE id=${literal(id)}`),'t');
  const result=await f.createOrRecoverCheckout(id,access.hashBookingAccess(token));
  assert.match(result.url,/^https:\/\/checkout\.stripe\.com\//);
  const attempt=attempts(id)[0],session=[...f.checkout.sessions.values()].find(value=>value.id===attempt.stripe_checkout_session_id);
  assert.ok(session);assert.equal(attempt.status,'open');assert.equal(attempt.checkout_creation_state,'succeeded');
  return {id,token,hash:access.hashBookingAccess(token),before,originalEvidence,attempt,session};
}

function completeSession(f,h) {
  h.session.status='complete';h.session.payment_status='paid';
  h.session.payment_intent=`pi_${randomUUID().replaceAll('-','')}`;
  h.session.url=null;
  const event={id:`evt_${randomUUID().replaceAll('-','')}`,object:'event',api_version:'2026-09-30.endive',
    created:Math.floor(Date.now()/1000),type:'checkout.session.completed',livemode:false,
    pending_webhooks:1,request:null,data:{object:structuredClone(h.session)}};
  f.stripeEvents.push(event);return event;
}

function assertCompleted(f,h) {
  const b=booking(h.id),allAttempts=attempts(h.id),allIntakes=intakes(h.id),allEvents=events(h.id);
  assert.equal(b.status,'confirmed');assert.equal(b.payment_status,'paid');assert.equal(b.payment_provider,'stripe');
  assert.equal(b.finalization_status,'completed');assert.equal(b.finalization_error,null);
  assert.ok(b.paid_at);assert.ok(b.finalized_at);assert.ok(b.google_event_id);assert.ok(b.google_meet_url);
  assert.equal(b.id,h.before.id);assert.equal(b.booking_reference,h.before.booking_reference);
  assert.equal(b.created_at,h.before.created_at);assert.equal(b.payment_expires_at,h.before.payment_expires_at);
  assert.deepEqual(evidence(b),h.originalEvidence);
  assert.equal(allAttempts.length,1);assert.equal(allAttempts[0].id,h.attempt.id);assert.equal(allAttempts[0].status,'paid');
  assert.equal(allAttempts[0].stripe_checkout_session_id,h.session.id);
  assert.equal(allAttempts[0].stripe_payment_intent_id,h.session.payment_intent);
  assert.equal(allIntakes.length,1);assert.equal(allIntakes[0].status,'active');
  assert.ok(allIntakes[0].access_token_hash);assert.ok(allIntakes[0].access_token_encrypted);
  assert.equal(allIntakes[0].sensitive_data_consent_at,null,'payment never invents sensitive-data consent');
  assert.equal(allEvents.length,1);assert.equal(allEvents[0].stripe_event_id,f.stripeEvents[0].id);
  assert.equal(allEvents[0].status,'processed');assert.ok(allEvents[0].processed_at);
  assert.equal(f.calls.calendar.length,1);assert.equal(f.calls.emails.length,2);assert.equal(f.providerReceipts.size,2);
  assert.ok(b.customer_email_sent_at);assert.ok(b.coach_email_sent_at);
  assert.equal(allIntakes[0].ready_email_sent_at,null,'no immediate dedicated Intake email');
  assert.equal(pg.sql(`SELECT count(*) FROM public.bookings WHERE booking_reference=${literal(b.booking_reference)}`),'1');
}

test('all six unchanged migrations support an atomic legal hold and paid return before webhook with real SQL finalization',async()=>{
  const f=fixture(),h=await openBooking(f);
  assert.equal(events(h.id).length,0);assert.equal(intakes(h.id).length,0);
  const event=completeSession(f,h);
  const result=await f.reconcileStripeCheckoutReturn(h.id,h.token,h.session.id);
  assert.equal(result.observation,'paid');assert.equal(result.intake.status,'available');
  assert.match(result.intake.redirectIntakeUrl,new RegExp(`^${site}/formulario/[a-f0-9]{64}$`));
  assertCompleted(f,h);
  assert.equal(f.calls.events.length,1);
  const baseline=snapshot(h.id),destination=result.intake.redirectIntakeUrl;
  assert.equal((await f.deliverWebhook(event)).status,200);
  const refresh=await f.reconcileStripeCheckoutReturn(h.id,h.token,h.session.id);
  assert.equal(refresh.intake.redirectIntakeUrl,destination);
  assert.deepEqual(snapshot(h.id),baseline,'replay/refresh preserve every persisted field, including processed_at and encrypted token');
  assertCompleted(f,h);
});

test('real signed webhook first and subsequent return reuse exactly the same finalized booking and Intake',async()=>{
  const f=fixture(),h=await openBooking(f),event=completeSession(f,h);
  assert.equal((await f.deliverWebhook(event)).status,200);assertCompleted(f,h);
  const baseline=snapshot(h.id),requests=f.checkout.calls.requests.length;
  const result=await f.reconcileStripeCheckoutReturn(h.id,h.token,h.session.id);
  assert.equal(result.observation,'paid');assert.equal(result.intake.status,'available');
  assert.deepEqual(snapshot(h.id),baseline);assert.equal(f.checkout.calls.requests.length,requests);
  assert.equal(f.calls.events.length,0);assertCompleted(f,h);
});

test('two success returns and a signed webhook converge under actual PostgreSQL finalizer leases',async()=>{
  const f=fixture(),h=await openBooking(f),event=completeSession(f,h);
  const results=await Promise.all([
    f.reconcileStripeCheckoutReturn(h.id,h.token,h.session.id),
    f.deliverWebhook(event),
    f.reconcileStripeCheckoutReturn(h.id,h.token,h.session.id),
  ]);
  assert.equal(results[1].status,200);assertCompleted(f,h);
  const baseline=snapshot(h.id);
  const final=await f.reconcileStripeCheckoutReturn(h.id,h.token,h.session.id);
  assert.equal(final.intake.status,'available');assert.deepEqual(snapshot(h.id),baseline);
  assertCompleted(f,h);
});

test('unpaid cancel observation and legitimate retry reuse the same Session without rewriting hold or legal evidence',async()=>{
  const f=fixture(),h=await openBooking(f),baseline=snapshot(h.id);
  const result=await f.reconcileStripeCheckoutReturn(h.id,h.token,h.session.id);
  assert.equal(result.observation,'unpaid');assert.equal(result.intake.redirectIntakeUrl,null);
  assert.deepEqual(snapshot(h.id),baseline);
  const recovered=await f.createOrRecoverCheckout(h.id,h.hash);
  assert.match(recovered.url,/^https:\/\/checkout\.stripe\.com\//);
  assert.equal(f.checkout.calls.created.length,1);assert.equal(attempts(h.id).length,1);
  assert.equal(attempts(h.id)[0].stripe_checkout_session_id,h.session.id);
  assert.deepEqual(booking(h.id),baseline.booking);
  assert.deepEqual(evidence(booking(h.id)),h.originalEvidence);
  assert.equal(events(h.id).length,0);assert.equal(intakes(h.id).length,0);
  assert.equal(f.calls.calendar.length,0);assert.equal(f.calls.emails.length,0);
  assert.equal(f.db.stats.rpcs.filter(call=>call.fn==='record_booking_legal_acceptance_v1').length,0);
});
