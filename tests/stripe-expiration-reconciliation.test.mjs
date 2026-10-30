import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import { localPostgres } from './helpers/local-postgres.mjs';
import { localSupabaseQuery } from './helpers/local-supabase-query.mjs';
import { testModules } from './helpers/load-typescript.mjs';

const pg=localPostgres(),MIN=60_000,HOUR=60*MIN,BASE=Date.now();
const policy=testModules().load('src/lib/stripe/expiration-reconciliation-policy.ts');
const iso=x=>new Date(x).toISOString();
const literal=x=>x===null?'NULL':`'${String(x).replaceAll("'","''")}'`;
const json=q=>JSON.parse(pg.sql(q)||'null');
let day=0;
before(()=>{
  pg.start(new URL('./fixtures/stripe-local-schema.sql',import.meta.url),[
    new URL('../supabase/migrations/20261027000100_activate_booking_intake_v2.sql',import.meta.url),
    new URL('../supabase/migrations/20261028000100_stripe_test_booking_lifecycle.sql',import.meta.url),
    new URL('../supabase/migrations/20261028000200_intake_v2_stable_service_identity.sql',import.meta.url),
    new URL('../supabase/migrations/20261028201527_stripe_failed_attempt_recovery.sql',import.meta.url),
  ]);
  // Mirror timestamp triggers so equality assertions detect redundant writes.
  pg.sql(`CREATE FUNCTION public.fixture_touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END $$;
    CREATE TRIGGER fixture_booking_touch BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.fixture_touch();
    CREATE TRIGGER fixture_attempt_touch BEFORE UPDATE ON public.booking_payment_attempts FOR EACH ROW EXECUTE FUNCTION public.fixture_touch();`);
});
beforeEach(()=>pg.sql('TRUNCATE public.bookings CASCADE;'));
after(()=>pg.stop());

function fixture({age=MIN,last=null,status='cancelled',payment='pending',reconciled=null,attemptStatus='unknown',sessionId=null,reference=null}={}){
  const hash=randomBytes(32).toString('hex'),future=iso(Date.UTC(2038,0,1+day++*2,12));
  const b=json(`SELECT public.create_stripe_booking_hold_v1('sesion-1-1',${literal(future)},'Fixture','fixture@example.test',NULL,NULL,${literal(hash)});`);
  const c=json(`SELECT public.claim_stripe_checkout_v1(${literal(b.booking_id)},${literal(hash)},gen_random_uuid(),'http://localhost:3000');`);
  pg.sql(`UPDATE public.bookings SET created_at=${literal(iso(BASE-age-30*MIN))},payment_expires_at=${literal(iso(BASE-age))},
    stripe_expiration_last_attempt_at=${literal(last===null?null:iso(last))},stripe_expiration_reconciled_at=${literal(reconciled===null?null:iso(reconciled))},
    status=${literal(status)},payment_status=${literal(payment)},expired_at=${status==='cancelled'?literal(iso(BASE-age+3000)):'NULL'},
    cancellation_reason=${status==='cancelled'?"'payment_expired'":'NULL'}${reference?`,booking_reference=${literal(reference)}`:''} WHERE id=${literal(b.booking_id)};
    UPDATE public.booking_payment_attempts SET status=${literal(attemptStatus)},checkout_creation_state='ambiguous',
      created_at=${literal(iso(BASE-age-MIN))},lease_owner=NULL,lease_until=NULL,
      stripe_checkout_session_id=${literal(sessionId)},last_error=${attemptStatus==='unknown'?"'expiration_requires_reconciliation'":'NULL'}
      WHERE id=${literal(c.attempt.id)};`);
  return {id:b.booking_id,attemptId:c.attempt.id,hash};
}
const booking=h=>json(`SELECT to_jsonb(b) FROM public.bookings b WHERE id=${literal(h.id)};`);
const attempt=h=>json(`SELECT to_jsonb(a) FROM public.booking_payment_attempts a WHERE id=${literal(h.attemptId)};`);
function session(h,changes={}){
  const b=booking(h),a=attempt(h);
  return {id:a.stripe_checkout_session_id??`cs_test_${a.id.replaceAll('-','')}`,livemode:false,mode:'payment',
    client_reference_id:h.id,metadata:{booking_id:h.id,payment_attempt_id:h.attemptId},amount_total:50000,currency:'mxn',
    payment_status:'unpaid',status:'expired',expires_at:Math.floor((Date.parse(b.payment_expires_at)+HOUR)/1000),...changes};
}
function harness({remote=null,pages=null,error=null,beforeResponse=null}={}){
  const db=localSupabaseQuery(pg),calls={list:[],retrieve:[],expire:[],create:0};
  const stripe={checkout:{sessions:{
    async list(params){calls.list.push(params);if(beforeResponse)beforeResponse();if(error)throw error;
      return pages?pages[Math.min(calls.list.length-1,pages.length-1)]:{data:remote?[remote]:[],has_more:false};},
    async retrieve(id){calls.retrieve.push(id);if(beforeResponse)beforeResponse();if(error)throw error;return remote;},
    async expire(id){calls.expire.push(id);if(error)throw error;return {...remote,status:'expired'};},
    create(){calls.create++;throw new Error('Must never create Checkout after deadline');},
  }}};
  const modules=testModules({'@/lib/stripe/server':{getStripeBookingAdmin:()=>db,getStripeTestClient:()=>stripe}});
  return {...modules.load('src/lib/stripe/expire-hold.ts'),db,calls};
}
const affected=h=>h.db.stats.updates.reduce((n,x)=>n+x.rows,0);
function unchangedFinancial(h,b,a){
  const next=booking(h);
  for(const key of ['status','payment_status','payment_expires_at','paid_at','payment_reference','google_event_id','google_meet_url',
    'customer_email_id','coach_email_id','customer_email_sent_at','coach_email_sent_at'])assert.deepEqual(next[key],b[key],key);
  assert.deepEqual(attempt(h),a);
  assert.equal(pg.sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id=${literal(h.id)};`),'1');
  assert.equal(pg.sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id=${literal(h.id)};`),'0');
}

test('policy has deterministic age bands, exact eligibility boundaries and finite review threshold',()=>{
  for(const [age,interval] of [[MIN,30_000],[5*MIN,2*MIN],[30*MIN,10*MIN],[2*HOUR,HOUR],[24*HOUR,HOUR]]){
    const expires=iso(BASE-age);
    assert.equal(policy.expirationReconciliationPolicy(expires,null,BASE).due,true);
    assert.equal(policy.expirationReconciliationPolicy(expires,iso(BASE-interval+1),BASE).due,false);
    assert.equal(policy.expirationReconciliationPolicy(expires,iso(BASE-interval),BASE).due,true);
    assert.equal(policy.expirationReconciliationPolicy(expires,null,BASE).interval,interval);
    assert.equal(policy.expirationReconciliationPolicy(expires,null,BASE).reviewDue,age>=24*HOUR);
  }
  assert.equal(policy.expirationReconciliationPolicy(iso(BASE+1),null,BASE).due,false);
  assert.equal(policy.expirationReconciliationPolicy('invalid',null,BASE).due,false);
});

test('ER-3052FC70 fixture: first pass queries, immediate cycles have no writes or effective state changes',async()=>{
  const h=fixture({reference:'ER-3052FC70'}),b=booking(h),a=attempt(h),s=harness();
  await s.expireStripeBookingHold(h.id,undefined,BASE);
  assert.equal(s.calls.list.length,1);assert.equal(s.db.stats.rpcs.length,0);assert.equal(affected(s),1);
  const stable=booking(h),writes=affected(s);
  for(let n=1;n<6;n++)await s.expireStripeBookingHold(h.id,undefined,BASE+n*5000);
  assert.equal(s.calls.list.length,1);assert.equal(affected(s),writes);
  assert.deepEqual(booking(h),stable);unchangedFinancial(h,b,a);assert.equal(s.calls.create,0);
});

test('at backoff boundary a query is allowed without rewriting unknown/error/attempt timestamp',async()=>{
  const h=fixture(),s=harness(),a=attempt(h);
  await s.expireStripeBookingHold(h.id,undefined,BASE);
  await s.expireStripeBookingHold(h.id,undefined,BASE+29_999);assert.equal(s.calls.list.length,1);
  await s.expireStripeBookingHold(h.id,undefined,BASE+30_000);assert.equal(s.calls.list.length,2);
  assert.equal(affected(s),2);assert.equal(s.db.stats.rpcs.length,0);assert.deepEqual(attempt(h),a);
});

test('24h ambiguity escalates with existing review fields, preserving financial evidence and preventing further cycles',async()=>{
  const h=fixture({age:24*HOUR}),b=booking(h),a=attempt(h),s=harness();
  await s.expireDueStripeHolds(BASE);
  assert.equal(booking(h).finalization_status,'review_required');
  assert.equal(booking(h).finalization_error,'expiration_reconciliation_review_required');
  assert.equal(booking(h).stripe_expiration_reconciled_at,null);
  unchangedFinancial(h,b,a);
  const state=booking(h),writes=affected(s);
  for(const offset of [5000,HOUR,48*HOUR])await s.expireDueStripeHolds(BASE+offset);
  assert.equal(s.calls.list.length,1);assert.equal(affected(s),writes);assert.deepEqual(booking(h),state);
  assert.throws(()=>pg.sql(`SELECT public.claim_stripe_checkout_v1(${literal(h.id)},${literal(h.hash)},gen_random_uuid(),'http://localhost:3000');`),/review_required/);
});

test('recent audit at 24h respects maximum backoff and escalates on next eligible pass',async()=>{
  const h=fixture({age:24*HOUR,last:BASE-30*MIN}),s=harness();
  await s.expireDueStripeHolds(BASE);assert.equal(s.calls.list.length,0);
  await s.expireDueStripeHolds(BASE+30*MIN);assert.equal(booking(h).finalization_status,'review_required');
});

test('normal pending/open expiration cancels, expires remote Session, reconciles and frees original slot',async()=>{
  const h=fixture({status:'pending',attemptStatus:'open',sessionId:'cs_test_normal'}),deadline=booking(h).payment_expires_at;
  const s=harness({remote:session(h,{status:'open'})});
  await s.expireDueStripeHolds(BASE);
  const b=booking(h),a=attempt(h);
  assert.equal(s.calls.expire.length,1);assert.equal(b.status,'cancelled');assert.equal(a.status,'expired');
  assert.equal(b.cancellation_reason,'payment_expired');assert.ok(b.stripe_expiration_reconciled_at);
  assert.equal(b.payment_expires_at,deadline);assert.equal(b.payment_status,'pending');assert.equal(b.paid_at,null);
  assert.equal(b.finalization_status,'not_started');assert.equal(b.google_event_id,null);assert.equal(b.google_meet_url,null);
  assert.equal(pg.sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id=${literal(h.id)};`),'0');
  assert.equal(pg.sql(`SELECT count(*) FROM public.get_available_slots('sesion-1-1',${literal(b.starts_at)}::timestamptz::date) s WHERE s.starts_at=${literal(b.starts_at)}::timestamptz;`),'1');
  const done=booking(h),writes=affected(s);await s.expireDueStripeHolds(BASE+HOUR);
  assert.deepEqual(booking(h),done);assert.equal(affected(s),writes);
});

test('expired Session discovered by bounded metadata lookup reconciles correctly',async()=>{
  const h=fixture(),s=harness({remote:session(h)});
  await s.expireStripeBookingHold(h.id,undefined,BASE);
  assert.equal(attempt(h).status,'expired');assert.ok(attempt(h).stripe_checkout_session_id);
  assert.ok(booking(h).stripe_expiration_reconciled_at);assert.equal(s.calls.create,0);
  const query=s.calls.list[0];assert.ok(query.created.gte);assert.ok(query.created.lte);assert.ok(query.created.lte>=query.created.gte);
  assert.equal(query.limit,100);
});

test('known PaymentIntent narrows lookup and a conflicting identity cannot be reconciled',async()=>{
  const h=fixture();pg.sql(`UPDATE public.booking_payment_attempts SET stripe_payment_intent_id='pi_fixture_known' WHERE id=${literal(h.attemptId)};`);
  const s=harness({remote:session(h,{payment_intent:'pi_fixture_known'})});
  await s.expireStripeBookingHold(h.id,undefined,BASE);
  assert.equal(s.calls.list[0].payment_intent,'pi_fixture_known');assert.ok(booking(h).stripe_expiration_reconciled_at);
  const conflict=fixture({sessionId:'cs_test_conflicting'});
  pg.sql(`UPDATE public.booking_payment_attempts SET stripe_payment_intent_id='pi_fixture_conflicting' WHERE id=${literal(conflict.attemptId)};`);
  const bad=harness({remote:session(conflict,{status:'open',payment_intent:'pi_other'})});
  await bad.expireStripeBookingHold(conflict.id,undefined,BASE);
  assert.equal(bad.calls.expire.length,0);assert.equal(booking(conflict).stripe_expiration_reconciled_at,null);
});

test('SQL backoff predicate and in-process policy agree at every band boundary',async()=>{
  const db=localSupabaseQuery(pg),cases=[];
  for(const age of [MIN,5*MIN,30*MIN,2*HOUR,24*HOUR]){
    const interval=policy.expirationReconciliationPolicy(iso(BASE-age),null,BASE).interval;
    for(const extra of [0,1])cases.push(fixture({age,last:BASE-interval+extra}));
  }
  const result=await db.from('bookings').select('id').lte('payment_expires_at',iso(BASE)).or(policy.expirationReconciliationFilter(BASE));
  assert.equal(result.error,null);
  const selected=new Set(result.data.map(b=>b.id));
  for(const h of cases){const b=booking(h);assert.equal(selected.has(h.id),policy.expirationReconciliationPolicy(b.payment_expires_at,b.stripe_expiration_last_attempt_at,BASE).due);}
});

test('checkout.session.expired replay stays idempotent after worker reconciliation',async()=>{
  const h=fixture({status:'pending',attemptStatus:'open',sessionId:'cs_test_webhook'}),remote=session(h),s=harness({remote});
  await s.expireDueStripeHolds(BASE);
  const payload={...remote,metadata:{...remote.metadata,booking_reference:booking(h).booking_reference}};
  const eventSql=`SELECT public.apply_stripe_checkout_event_v1('evt_expiration_fixture','checkout.session.expired',${literal(JSON.stringify(payload))}::jsonb);`;
  json(eventSql);const b=booking(h),a=attempt(h);
  const event=pg.sql("SELECT to_jsonb(e) FROM public.stripe_events e WHERE stripe_event_id='evt_expiration_fixture';");
  assert.equal(json(eventSql).duplicate,true);assert.deepEqual(booking(h),b);assert.deepEqual(attempt(h),a);
  assert.equal(pg.sql("SELECT to_jsonb(e) FROM public.stripe_events e WHERE stripe_event_id='evt_expiration_fixture';"),event);
});

for(const options of [{payment:'paid'},{reconciled:BASE-MIN}])test(`ineligible booking ${JSON.stringify(options)} is never queried or written`,async()=>{
  const h=fixture(options),b=booking(h),a=attempt(h),s=harness();
  await s.expireDueStripeHolds(BASE);await s.expireStripeBookingHold(h.id,undefined,BASE);
  assert.equal(s.calls.list.length,0);assert.equal(s.calls.retrieve.length,0);assert.equal(affected(s),0);
  assert.deepEqual(booking(h),b);assert.deepEqual(attempt(h),a);
});

test('server-side backoff filtering happens before batch limit: old ambiguous rows do not starve another expiry',async()=>{
  const held=[];
  for(let n=0;n<12;n++){const h=fixture({age:3*HOUR,last:BASE-10*MIN});held.push({h,b:booking(h),a:attempt(h)});}
  const fresh=fixture({age:4*MIN,last:BASE-3*MIN,status:'pending',attemptStatus:'open',sessionId:'cs_test_fair'});
  const s=harness({remote:session(fresh)});await s.expireDueStripeHolds(BASE);
  assert.equal(s.calls.retrieve.length,1);assert.equal(booking(fresh).status,'cancelled');assert.ok(booking(fresh).stripe_expiration_reconciled_at);
  for(const {h,b,a} of held){assert.deepEqual(booking(h),b);assert.deepEqual(attempt(h),a);}
});

test('two workers cannot claim the same eligible reconciliation pass',async()=>{
  const h=fixture(),s=harness();await Promise.all([s.expireStripeBookingHold(h.id,undefined,BASE),s.expireStripeBookingHold(h.id,undefined,BASE)]);
  assert.equal(s.calls.list.length,1);assert.equal(affected(s),1);assert.equal(s.db.stats.rpcs.length,0);
});

test('network failure remains ambiguous, obeys backoff and eventually reaches review',async()=>{
  const h=fixture(),s=harness({error:new Error('network')});
  await s.expireStripeBookingHold(h.id,undefined,BASE);const a=attempt(h);
  await s.expireStripeBookingHold(h.id,undefined,BASE+5000);assert.equal(s.calls.list.length,1);
  await s.expireStripeBookingHold(h.id,undefined,BASE+24*HOUR);
  assert.equal(booking(h).finalization_status,'review_required');assert.deepEqual(attempt(h),a);
  assert.equal(attempt(h).status,'unknown');assert.equal(booking(h).payment_status,'pending');
});

test('pagination is capped: incomplete results never imply absence or reconciliation',async()=>{
  const h=fixture(),other={...session(h),id:'cs_test_other',metadata:{booking_id:'other',payment_attempt_id:'other'}};
  const s=harness({pages:[{data:[other],has_more:true}]});await s.expireStripeBookingHold(h.id,undefined,BASE);
  assert.equal(s.calls.list.length,3);assert.equal(booking(h).stripe_expiration_reconciled_at,null);
  assert.equal(attempt(h).stripe_checkout_session_id,null);assert.equal(attempt(h).status,'unknown');
});

test('multiple matching Sessions or wrong identity never expire/bind an arbitrary Session',async()=>{
  for(const kind of ['duplicate','wrong-amount']){
    const h=fixture(),remote=session(h,kind==='wrong-amount'?{amount_total:1}:{});
    const s=harness({pages:[{data:kind==='duplicate'?[remote,{...remote,id:'cs_test_second'}]:[remote],has_more:false}]});
    await s.expireStripeBookingHold(h.id,undefined,BASE);
    assert.equal(s.calls.expire.length,0);assert.equal(attempt(h).stripe_checkout_session_id,null);
    assert.equal(booking(h).stripe_expiration_reconciled_at,null);
  }
});

test('payment winning during reconciliation cannot be overwritten by review or expiration',async()=>{
  const h=fixture({age:24*HOUR,sessionId:'cs_test_paid_race'}),s=harness({error:new Error('lost response'),beforeResponse(){
    pg.sql(`UPDATE public.bookings SET payment_status='paid',payment_provider='stripe',paid_at=now(),payment_reference='pi_fixture' WHERE id=${literal(h.id)};`);
  }});
  await s.expireStripeBookingHold(h.id,undefined,BASE);
  assert.equal(booking(h).payment_status,'paid');assert.equal(booking(h).finalization_status,'not_started');
  assert.equal(booking(h).payment_reference,'pi_fixture');assert.equal(attempt(h).status,'unknown');
});

test('legacy pending/unknown first cancellation is performed once and subsequent cycles are stable',async()=>{
  const h=fixture({status:'pending'}),s=harness();
  await s.expireDueStripeHolds(BASE);assert.equal(booking(h).status,'cancelled');assert.equal(s.db.stats.rpcs.length,1);
  const b=booking(h),a=attempt(h),writes=affected(s);
  for(let n=1;n<6;n++)await s.expireDueStripeHolds(BASE+n*5000);
  assert.deepEqual(booking(h),b);assert.deepEqual(attempt(h),a);assert.equal(affected(s),writes);
  assert.equal(s.db.stats.rpcs.length,1);
});
