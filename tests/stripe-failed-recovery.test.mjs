import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { stripeCheckoutTransport } from './helpers/stripe-checkout-transport.mjs';
import { before, after, test } from 'node:test';
import { localPostgres } from './helpers/local-postgres.mjs';
import { testModules } from './helpers/load-typescript.mjs';

const Stripe=createRequire(import.meta.url)('stripe');
const pg=localPostgres();
const migration=new URL('../supabase/migrations/20261028201527_stripe_failed_attempt_recovery.sql',import.meta.url);
const literal=x=>x===null?'NULL':`'${String(x).replaceAll("'","''")}'`;
const json=q=>JSON.parse(pg.sql(q)||'null');
const rpcSql=(name,args)=>`SELECT to_jsonb(public.${name}(${Object.entries(args).map(([k,v])=>`${k} => ${literal(v)}`).join(',')}));`;
const rpc=(name,args)=>json(rpcSql(name,args));
let day=0;
function hold(){
  const hash=randomBytes(32).toString('hex');
  const time=new Date(Date.UTC(2036,0,1+day++*2,12)).toISOString();
  const b=rpc('create_stripe_booking_hold_v1',{p_service_slug:'sesion-1-1',p_starts_at:time,
    p_customer_name:'Fixture',p_customer_email:'fixture@example.test',p_customer_phone:null,p_notes:null,p_access_token_hash:hash});
  return {id:b.booking_id,hash};
}
const booking=h=>json(`SELECT to_jsonb(b) FROM public.bookings b WHERE id=${literal(h.id)};`);
const attempts=h=>json(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY created_at,id),'[]') FROM public.booking_payment_attempts a WHERE booking_id=${literal(h.id)};`);
const claim=(h,owner=randomUUID())=>({owner,...rpc('claim_stripe_checkout_v1',{
  p_booking_id:h.id,p_access_token_hash:h.hash,p_owner:owner,p_site_url:'http://localhost:3000'})});
const begin=(h,a)=>rpc('begin_stripe_checkout_creation_v1',{p_booking_id:h.id,p_attempt_id:a.attempt.id,p_owner:a.owner});
const record=(h,a,status='failed')=>rpc('record_stripe_checkout_failure_v1',{
  p_booking_id:h.id,p_attempt_id:a.attempt.id,p_owner:a.owner,p_status:status,
  p_error:status==='failed'?'stripe_invalid_request':'stripe_request_unknown'});
function rejected(h){const a=claim(h);assert.equal(begin(h,a),true);assert.equal(record(h,a),true);return attempts(h)[0];}
function payloadWithoutAttempt(p){const result=structuredClone(p);delete result.metadata.payment_attempt_id;return result;}
const invalid=()=>new Stripe.errors.StripeInvalidRequestError({type:'invalid_request_error',statusCode:400,param:'payment_method_types'});

let legacy;
before(()=>{
  pg.start(new URL('./fixtures/stripe-local-schema.sql',import.meta.url),[
  new URL('../supabase/migrations/20261027000100_activate_booking_intake_v2.sql',import.meta.url),
  new URL('../supabase/migrations/20261028000100_stripe_test_booking_lifecycle.sql',import.meta.url),
    new URL('../supabase/migrations/20261028000200_intake_v2_stable_service_identity.sql',import.meta.url),
  ]);
  const h=hold(),a=claim(h);
  pg.sql(`UPDATE public.booking_payment_attempts SET status='unknown',last_error='stripe_request_unknown',lease_owner=NULL,lease_until=NULL WHERE id=${literal(a.attempt.id)};`);
  legacy={h,attempt:attempts(h)[0],booking:booking(h),holdDefinition:pg.sql("SELECT md5(pg_get_functiondef('public.create_stripe_booking_hold_v1(text,timestamptz,text,text,text,text,text)'::regprocedure));")};
  pg.sql(readFileSync(migration,'utf8'));
});
after(()=>pg.stop());

test('initial migration preserves pre-existing booking/attempt fields and defaults provenance to ambiguous',()=>{
  const a=attempts(legacy.h)[0];const {checkout_creation_state,...original}=a;
  assert.equal(checkout_creation_state,'ambiguous');assert.deepEqual(original,legacy.attempt);
  assert.deepEqual(booking(legacy.h),legacy.booking);
  assert.equal(pg.sql("SELECT md5(pg_get_functiondef('public.create_stripe_booking_hold_v1(text,timestamptz,text,text,text,text,text)'::regprocedure));"),legacy.holdDefinition);
  const retry=claim(legacy.h);assert.equal(begin(legacy.h,retry),false);assert.equal(record(legacy.h,retry),true);
  assert.equal(attempts(legacy.h).length,1);assert.equal(attempts(legacy.h)[0].status,'unknown');
});

// Real financial service + isolated SQL RPCs for failed/successor recovery.
// Legal wrappers/evidence are a test transport so these schema snapshots remain
// focused on the recovery migration, independently of the additive legal SQL.
function service({error=null,saveFailure=null,failureWrite=false,afterSend=null,client=null}={}){
  const calls={create:[],sessions:new Map(),expire:0,legalEvidence:new Map()};
  const listeners=new Set();
  const stripe=client??{on(n,fn){listeners.add(fn);},off(n,fn){listeners.delete(fn);},checkout:{sessions:{
    async create(payload,options){
      calls.create.push({payload:structuredClone(payload),options});
      for(const fn of listeners)fn({method:'POST',path:'/v1/checkout/sessions',idempotency_key:options.idempotencyKey});
      if(afterSend)await afterSend();
      if(error)throw error;
      if(!calls.sessions.has(options.idempotencyKey))calls.sessions.set(options.idempotencyKey,{
        id:`cs_test_${randomUUID().replaceAll('-','')}`,livemode:false,mode:'payment',status:'open',payment_status:'unpaid',
        client_reference_id:payload.client_reference_id,metadata:payload.metadata,amount_total:payload.line_items[0].price_data.unit_amount,
        currency:payload.line_items[0].price_data.currency,expires_at:payload.expires_at,url:'https://checkout.stripe.com/c/pay/test',
      });
      return calls.sessions.get(options.idempotencyKey);
    },
    async retrieve(id){return [...calls.sessions.values()].find(s=>s.id===id);},
  }}};
  let fail=saveFailure,writeFail=failureWrite;
  const db={from(table){
    assert.ok(['bookings','booking_payment_attempts'].includes(table));
    const predicates=[],orders=[];let limit=null;
    const column=name=>{assert.match(name,/^[a-z_][a-z_0-9]*$/);return name;};
    const query={select(){return query;},eq(k,v){predicates.push(`${column(k)}=${literal(v)}`);return query;},
      not(k,op,v){assert.equal(op,'is');assert.equal(v,null);predicates.push(`${column(k)} IS NOT NULL`);return query;},
      order(k,{ascending=true}={}){orders.push(`${column(k)} ${ascending?'ASC':'DESC'}`);return query;},
      limit(n){assert.ok(Number.isInteger(n)&&n>0);limit=n;return query;},async maybeSingle(){
        try{
          // Ownership predicates execute against the real isolated PostgreSQL
          // rows. Only legal fields absent from this older fixture are merged
          // from the same evidence transport used by the atomic hold wrapper.
          const rows=json(`WITH result AS (SELECT * FROM public.${table}${predicates.length?' WHERE '+predicates.join(' AND '):''}${orders.length?' ORDER BY '+orders.join(','):''}${limit===null?'':' LIMIT '+limit}) SELECT coalesce(jsonb_agg(to_jsonb(result)),'[]') FROM result;`);
          if(rows.length>1)return {data:null,error:{message:'multiple rows'}};
          const data=rows[0]??null;
          if(data&&table==='bookings'){
            const evidence=calls.legalEvidence.get(data.id);
            Object.assign(data,{legal_terms_accepted_at:evidence?data.created_at:null,
              legal_adult_confirmed_at:evidence?data.created_at:null,
              legal_terms_version:evidence?.termsVersion??null,
              legal_privacy_notice_version:evidence?.privacyNoticeVersion??null});
          }
          return {data,error:null};
        }catch(e){return {data:null,error:{message:e.message.match(/ERROR:\s+([^\n]+)/)?.[1]??'local query failed'}};}
      }};
    return query;
  },async rpc(name,args){
    if(name==='create_stripe_booking_hold_with_legal_v1') {
      assert.deepEqual(args.p_legal_acceptance,testModules().load('src/lib/legal/acceptance.ts').currentBookingAcceptance);
      const {p_legal_acceptance,...originalArgs}=args;
      const data=rpc('create_stripe_booking_hold_v1',originalArgs);
      if(!calls.legalEvidence.has(data.booking_id)) calls.legalEvidence.set(data.booking_id,structuredClone(p_legal_acceptance));
      return {data,error:null};
    }
    if(name==='record_booking_legal_acceptance_v1') {
      assert.deepEqual(args.p_legal_acceptance,testModules().load('src/lib/legal/acceptance.ts').currentBookingAcceptance);
      const existing=booking({id:args.p_booking_id});
      if(!existing||existing.booking_access_token_hash!==args.p_access_token_hash) return {data:null,error:{message:'invalid_access'}};
      if(!calls.legalEvidence.has(existing.id)) calls.legalEvidence.set(existing.id,structuredClone(args.p_legal_acceptance));
      return {data:true,error:null};
    }
    if(name==='save_stripe_checkout_v1'&&fail==='before'){fail=null;return {data:null,error:{message:'database unavailable'}};}
    if(name==='record_stripe_checkout_failure_v1'&&writeFail){writeFail=false;return {data:null,error:{message:'database unavailable'}};}
    let data;
    try {data=rpc(name,args);} catch(e){return {data:null,error:{message:e.message.match(/ERROR:\s+([^\n]+)/)?.[1]??'database error'}};}
    if(name==='save_stripe_checkout_v1'&&fail==='after'){fail=null;throw new Error('lost committed response');}
    return {data,error:null};
  }};
  const modules=testModules({'@/lib/stripe/server':{getStripeTestClient:()=>stripe,getStripeBookingAdmin:()=>db,getStripeTestSiteUrl:()=> 'http://localhost:3000'},
    'next/server':{NextResponse:{json:(data,init={})=>({data,status:init.status??200,cookies:{saved:[],set(...args){this.saved.push(args);}}})}},
    '@/lib/bookings/finalize-paid-booking':{finalizePaidBooking:async()=>{throw new Error('Unpaid failed-recovery test must never finalize');}},
    '@/lib/bookings/intake-destination':{bookingIntakeDestination:async(owned)=>{assert.equal(owned.payment_status,'pending');return {status:'waiting',redirectIntakeUrl:null};}},
    '@/lib/stripe/expire-hold':{expireDueStripeHolds:async()=>{},expireStripeBookingHold:async()=>{calls.expire++;return true;}}});
  return {...modules.load('src/lib/stripe/checkout.ts'),calls,loadRoute:()=>modules.load('src/app/api/bookings/stripe/checkout/route.ts').POST};
}

test('test-only SDK transport traverses real POST, classification and SQL failed-to-successor recovery',async()=>{
    const transport=stripeCheckoutTransport({rejectFirstCreate:true});
    const f=service({client:transport.client}),POST=f.loadRoute(),cookies=new Map();
    const payload={service:'sesion-1-1',startsAt:new Date(Date.UTC(2036,0,1+day++*2,12)).toISOString(),
      name:'Fixture',email:'fixture@example.test',flowId:randomUUID()};
    const request=body=>({headers:new Headers({origin:'http://localhost:3000'}),json:async()=>({
      ...body,legalAcceptance:testModules().load('src/lib/legal/acceptance.ts').currentBookingAcceptance}),
      cookies:{get:name=>cookies.has(name)?{value:cookies.get(name)}:undefined}});
    const remember=response=>{for(const [name,value] of response.cookies.saved)cookies.set(name,value);};
    const countBefore=Number(pg.sql('SELECT count(*) FROM public.bookings;'));
    const bootstrap=await POST(request(payload));assert.equal(bootstrap.data.requiresCookie,true);remember(bootstrap);
    const failedResponse=await POST(request(payload));remember(failedResponse);
    assert.equal(failedResponse.status,409);assert.equal(failedResponse.data.code,'checkout_unavailable');
    const h={id:failedResponse.data.bookingId},b=booking(h),failed=attempts(h)[0];
    const firstAcceptance=structuredClone(f.calls.legalEvidence.get(h.id));
    assert.equal(firstAcceptance.ageConfirmed,true);
    assert.equal(b.status,'pending');assert.equal(b.payment_status,'pending');assert.equal(b.payment_flow,'stripe');
    assert.equal(failed.status,'failed');assert.equal(failed.checkout_creation_state,'rejected');
    assert.equal(failed.last_error,'stripe_invalid_request');assert.equal(failed.stripe_checkout_session_id,null);
    assert.equal(failed.stripe_payment_intent_id,null);assert.equal(transport.calls.created.length,0);assert.equal(transport.sessions.size,0);
    for(const column of ['google_event_id','google_meet_url','customer_email_id','coach_email_id','paid_at'])assert.equal(b[column],null);
    assert.equal(pg.sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id=${literal(h.id)};`),'0');
    assert.equal(pg.sql(`SELECT count(*) FROM public.stripe_events WHERE booking_id=${literal(h.id)};`),'0');
    const recovered=await POST(request({bookingId:h.id}));assert.equal(recovered.status,200);
    assert.deepEqual(f.calls.legalEvidence.get(h.id),firstAcceptance);
    assert.ok(recovered.data.checkoutUrl.startsWith('https://checkout.stripe.com/'));
    const all=attempts(h),success=all.find(a=>a.id!==failed.id);
    assert.equal(all.length,2);assert.deepEqual(all.find(a=>a.id===failed.id),failed);
    assert.equal(success.status,'open');assert.ok(success.stripe_checkout_session_id);assert.equal(success.stripe_payment_intent_id,null);
    assert.equal(transport.calls.created.length,1);assert.equal(transport.sessions.size,1);
    assert.equal(transport.calls.created[0].key,`booking-checkout/${success.id}`);
    assert.notEqual(`booking-checkout/${failed.id}`,transport.calls.created[0].key);
    assert.deepEqual(booking(h),b);assert.equal(Number(pg.sql('SELECT count(*) FROM public.bookings;')),countBefore+1);
    assert.equal(pg.sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id=${literal(h.id)} AND status IN ('creating','open','unknown');`),'1');
});

test('migration reapplication preserves signatures, legacy RPCs and historical evidence',()=>{
  const h=hold();const a=claim(h);
  pg.sql(`UPDATE public.booking_payment_attempts SET checkout_creation_state='ambiguous',status='unknown' WHERE id=${literal(a.attempt.id)};`);
  const before=attempts(h),b=booking(h);
  const signatures=pg.sql("SELECT oid::regprocedure::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('claim_stripe_checkout_v1','save_stripe_checkout_v1','create_stripe_booking_hold_v1') ORDER BY proname;");
  pg.sql(readFileSync(migration,'utf8'));
  assert.deepEqual(attempts(h),before);assert.deepEqual(booking(h),b);
  assert.equal(pg.sql("SELECT oid::regprocedure::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('claim_stripe_checkout_v1','save_stripe_checkout_v1','create_stripe_booking_hold_v1') ORDER BY proname;"),signatures);
});

test('deterministic 400 persists failed, successor opens with new key and same hold/payload; payment finalizes',async()=>{
  const h=hold(),originalBooking=booking(h),f=service({error:invalid()});
  await assert.rejects(f.createOrRecoverCheckout(h.id,h.hash));
  const failed=attempts(h)[0];
  assert.equal(failed.status,'failed');assert.equal(failed.last_error,'stripe_invalid_request');
  assert.equal(failed.checkout_creation_state,'rejected');assert.deepEqual(booking(h),originalBooking);
  const success=service();
  await success.createOrRecoverCheckout(h.id,h.hash);
  const all=attempts(h),a=all.find(x=>x.id!==failed.id);
  assert.equal(all.length,2);assert.deepEqual(all.find(x=>x.id===failed.id),failed);
  assert.equal(a.status,'open');assert.equal(a.checkout_creation_state,'succeeded');assert.notEqual(a.id,failed.id);
  assert.equal(a.amount_minor,failed.amount_minor);assert.equal(a.currency,failed.currency);
  assert.deepEqual(payloadWithoutAttempt(a.checkout_payload),payloadWithoutAttempt(failed.checkout_payload));
  assert.equal(a.checkout_payload.metadata.payment_attempt_id,a.id);
  assert.notEqual(success.calls.create[0].options.idempotencyKey,f.calls.create[0].options.idempotencyKey);
  assert.equal(success.calls.create[0].options.idempotencyKey,`booking-checkout/${a.id}`);
  await success.createOrRecoverCheckout(h.id,h.hash);
  assert.equal(success.calls.create.length,1);assert.equal(success.calls.sessions.size,1);
  assert.deepEqual(booking(h),originalBooking);
  assert.equal(pg.sql(`SELECT count(*) FROM public.bookings WHERE booking_access_token_hash=${literal(h.hash)};`),'1');
  assert.equal(pg.sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id=${literal(h.id)} AND status IN ('creating','open','unknown');`),'1');
  const session=[...success.calls.sessions.values()][0];
  const paid={...session,status:'complete',payment_status:'paid',payment_intent:`pi_${a.id.replaceAll('-','')}`};
  const receipt=json(`SELECT public.apply_stripe_checkout_event_v1('evt_recovered_${a.id}','checkout.session.completed',${literal(JSON.stringify(paid))}::jsonb);`);
  assert.equal(receipt.accepted,true);
  assert.equal(booking(h).payment_status,'paid');
  // No Calendar/email APIs: drive the existing finalization contract with local doubles.
  const owner=randomUUID();
  rpc('claim_stripe_finalization_v1',{p_booking_id:h.id,p_owner:owner});
  const step=(name,data={})=>json(`SELECT public.save_stripe_finalization_v1(${literal(h.id)},${literal(owner)},${literal(name)},${literal(JSON.stringify(data))}::jsonb);`);
  step('calendar',{eventId:'fixture-event',meetUrl:'https://meet.google.com/fixture'});
  step('customer_email',{id:'fixture-customer-email'});step('coach_email',{id:'fixture-coach-email'});
  json(`SELECT to_jsonb(r) FROM public.activate_booking_intake_v2(${literal(h.id)},${literal(randomBytes(32).toString('hex'))},'fixture-encrypted','stripe',${literal(paid.payment_intent)}) r;`);
  pg.sql(`UPDATE public.booking_intake_forms SET ready_email_sent_at=now() WHERE booking_id=${literal(h.id)};`);
  step('completed');assert.equal(booking(h).finalization_status,'completed');
  assert.deepEqual(attempts(h).find(x=>x.id===failed.id),failed);
});

test('two concurrent service retries create exactly one successor and one logical Checkout',async()=>{
  const h=hold(),failed=rejected(h),b=booking(h),s=service({afterSend:()=>new Promise(resolve=>setTimeout(resolve,25))});
  const results=await Promise.allSettled([s.createOrRecoverCheckout(h.id,h.hash),s.createOrRecoverCheckout(h.id,h.hash)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(s.calls.create.length,1);assert.equal(s.calls.sessions.size,1);
  assert.equal(attempts(h).length,2);assert.deepEqual(attempts(h).find(a=>a.id===failed.id),failed);
  assert.deepEqual(booking(h),b);
});

test('two concurrent SQL transactions serialize successor creation under booking lock',async()=>{
  const h=hold(),failed=rejected(h);
  const args=owner=>({p_booking_id:h.id,p_access_token_hash:h.hash,p_owner:owner,p_site_url:'http://localhost:3000'});
  const results=await Promise.all([
    pg.run(`BEGIN; SELECT id FROM public.bookings WHERE id=${literal(h.id)} FOR UPDATE; SELECT pg_sleep(0.15); ${rpcSql('claim_stripe_checkout_v1',args(randomUUID()))} COMMIT;`),
    pg.run(rpcSql('claim_stripe_checkout_v1',args(randomUUID()))),
  ]);
  assert.equal(results.filter(r=>r.code===0).length,1);
  assert.match(results.find(r=>r.code!==0).errors,/checkout_in_progress/);
  assert.equal(attempts(h).length,2);assert.deepEqual(attempts(h).find(a=>a.id===failed.id),failed);
});

for(const [label,change] of [
  ['paid',"payment_status='paid'"],['cancelled',"status='cancelled'"],
  ['deadline passed',"payment_expires_at=clock_timestamp()-interval '1 second'"],
  ['deadline equal to transaction time',"payment_expires_at=now()"],
])test(`${label} prevents successor creation`,()=>{
  const h=hold(),failed=rejected(h);pg.sql(`UPDATE public.bookings SET ${change} WHERE id=${literal(h.id)};`);
  assert.throws(()=>claim(h),/already_paid|hold_expired/);
  assert.deepEqual(attempts(h),[failed]);
});

test('unknown reuses original attempt/key even if next response is deterministic',async()=>{
  const h=hold(),f=service({error:new Error('timeout')});await assert.rejects(f.createOrRecoverCheckout(h.id,h.hash));
  const a=attempts(h)[0];assert.equal(a.status,'unknown');
  const next=service({error:invalid()});await assert.rejects(next.createOrRecoverCheckout(h.id,h.hash));
  assert.equal(attempts(h).length,1);assert.equal(attempts(h)[0].id,a.id);assert.equal(attempts(h)[0].status,'unknown');
  assert.equal(next.calls.create[0].options.idempotencyKey,f.calls.create[0].options.idempotencyKey);
});

for(const failure of ['before','after'])test(`Session exists, save ${failure} commit fails: never failed or successor`,async()=>{
  const h=hold(),f=service({saveFailure:failure});await assert.rejects(f.createOrRecoverCheckout(h.id,h.hash));
  const a=attempts(h)[0];assert.equal(a.status,failure==='before'?'unknown':'open');
  await f.createOrRecoverCheckout(h.id,h.hash);
  assert.equal(attempts(h).length,1);assert.equal(attempts(h)[0].id,a.id);assert.equal(attempts(h)[0].status,'open');
  assert.equal(f.calls.sessions.size,1);assert.equal(f.calls.create.length,failure==='before'?2:1);
  if(failure==='before')assert.deepEqual(f.calls.create[0],f.calls.create[1]);
});

test('lost failure write keeps dispatch provenance ambiguous on retry',async()=>{
  const h=hold(),f=service({error:new Error('timeout'),failureWrite:true});
  await assert.rejects(f.createOrRecoverCheckout(h.id,h.hash));const a=attempts(h)[0];
  assert.equal(a.checkout_creation_state,'in_flight');
  pg.sql(`UPDATE public.booking_payment_attempts SET lease_until=now()-interval '1 second' WHERE id=${literal(a.id)};`);
  const next=service({error:invalid()});await assert.rejects(next.createOrRecoverCheckout(h.id,h.hash));
  assert.equal(attempts(h).length,1);assert.equal(attempts(h)[0].status,'unknown');
});

test('stale owner cannot save deterministic failure after another dispatch',()=>{
  const h=hold(),first=claim(h);assert.equal(begin(h,first),true);
  pg.sql(`UPDATE public.booking_payment_attempts SET lease_until=now()-interval '1 second' WHERE id=${literal(first.attempt.id)};`);
  const next=claim(h);assert.equal(begin(h,next),false);
  assert.equal(record(h,first),false);assert.equal(record(h,next),true);
  assert.equal(attempts(h)[0].status,'unknown');assert.equal(attempts(h).length,1);
});

test('dispatch claim expires before Stripe send: no network call and no successor',async()=>{
  const h=hold(),a=claim(h);
  pg.sql(`UPDATE public.bookings SET payment_expires_at=clock_timestamp()-interval '1 second' WHERE id=${literal(h.id)};`);
  assert.throws(()=>begin(h,a),/hold_expired/);
  const f=service();await assert.rejects(f.createOrRecoverCheckout(h.id,h.hash));
  assert.equal(f.calls.create.length,0);assert.equal(attempts(h).length,1);
});

test('current lease must begin dispatch before any rejection can be recorded as failed',()=>{
  const h=hold(),a=claim(h);assert.equal(record(h,a),true);
  assert.equal(attempts(h)[0].status,'unknown');assert.equal(attempts(h)[0].checkout_creation_state,'ambiguous');
  assert.equal(attempts(h).length,1);
});

test('Session returned after deadline is bound for reconciliation, never failed or renewed',async()=>{
  const h=hold(),f=service({afterSend:()=>{
    pg.sql(`UPDATE public.bookings SET payment_expires_at=clock_timestamp()-interval '1 second' WHERE id=${literal(h.id)};`);
  }});
  await assert.rejects(f.createOrRecoverCheckout(h.id,h.hash),e=>e.code==='hold_expired');
  const a=attempts(h)[0];assert.equal(a.status,'open');assert.ok(a.stripe_checkout_session_id);
  assert.equal(f.calls.expire,1);assert.equal(attempts(h).length,1);
  assert.throws(()=>claim(h),/hold_expired/);
});

test('new RPCs are service-only and use hardened search_path',()=>{
  for(const name of ['begin_stripe_checkout_creation_v1(uuid,uuid,uuid)','record_stripe_checkout_failure_v1(uuid,uuid,uuid,text,text)']){
    for(const role of ['anon','authenticated'])assert.equal(pg.sql(`SELECT has_function_privilege('${role}','public.${name}','EXECUTE');`),'f');
    assert.equal(pg.sql(`SELECT has_function_privilege('service_role','public.${name}','EXECUTE');`),'t');
    assert.equal(pg.sql(`SELECT prosecdef AND proconfig=ARRAY['search_path=pg_catalog, pg_temp'] FROM pg_proc WHERE oid='public.${name}'::regprocedure;`),'t');
  }
});

test('real SDK internal retry followed by definitive 400 remains unknown with original key',async()=>{
  const h=hold(),keys=[];let sends=0;
  const sdk=new Stripe('sk_test_fixture_only',{maxNetworkRetries:1,httpClient:{
    getClientName:()=> 'fixture',
    async makeRequest(host,port,path,method,headers){
      keys.push(headers['Idempotency-Key']);sends++;
      if(sends===1)throw Object.assign(new Error('socket closed after send'),{code:'ECONNRESET'});
      return {getStatusCode:()=>400,getHeaders:()=>({'request-id':'req_fixture'}),getRawResponse:()=>null,
        toJSON:async()=>({error:{type:'invalid_request_error',param:'payment_method_types',message:'Invalid parameter'}})};
    },
  }});
  const s=service({client:sdk});await assert.rejects(s.createOrRecoverCheckout(h.id,h.hash));
  assert.equal(sends,2);assert.equal(keys[0],keys[1]);
  assert.equal(attempts(h)[0].status,'unknown');assert.equal(attempts(h)[0].last_error,'stripe_request_unknown');
});
