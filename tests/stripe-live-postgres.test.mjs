import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {localPostgres} from './helpers/local-postgres.mjs';
import {liveFixture,liveMigrations} from './helpers/stripe-live-postgres.mjs';
const pg=localPostgres(),sql=s=>pg.sql(s),json=s=>JSON.parse(sql(s)||'null');
const hash=()=>randomBytes(32).toString('hex'),quote=v=>v==null?'NULL':`'${String(v).replaceAll("'","''")}'`,j=v=>quote(JSON.stringify(v))+'::jsonb';
const legal={termsAccepted:true,ageConfirmed:true,termsVersion:'2026-10-31.1',privacyNoticeVersion:'2026-10-29.2'};
const account='acct_fixture',origin='https://www.ednarojocoaching.com',enc='A'.repeat(16)+'.'+'B'.repeat(22)+'.'+'C'.repeat(86);
let day=0;const slot=()=>{const n=day++;return `${new Date(Date.now()+86400000*(2+Math.floor(n/4))).toISOString().slice(0,10)}T${12+2*(n%4)}:00:00Z`;};
let historicalFingerprint;
const historicalSql=`SELECT jsonb_build_object('bookings',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM public.bookings b),
  'processes',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.coaching_processes p),
  'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.booking_payment_attempts a),
  'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.stripe_event_id) FROM public.stripe_events e),
  'intakes',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public.booking_intake_forms f))`;
before(()=>{
  pg.start(liveFixture,liveMigrations.slice(0,-1));
  sql(`INSERT INTO public.coaching_processes(id,process_reference,service_id,customer_name,customer_email,service_name_snapshot,duration_minutes_snapshot,price_snapshot,currency_snapshot,total_sessions,access_token_hash,status)
    SELECT '10000000-0000-4000-8000-000000000001','PROC-HIST',s.id,'Fixture','historical@example.test',s.name,90,2500,'MXN',6,repeat('9',64),'active' FROM public.services s WHERE slug='proceso';
    INSERT INTO public.bookings(id,service_id,service_name_snapshot,duration_minutes_snapshot,session_count_snapshot,price_snapshot,currency_snapshot,customer_name,customer_email,starts_at,ends_at,payment_flow,payment_status,status,payment_expires_at,booking_access_token_hash,finalization_status)
    SELECT '10000000-0000-4000-8000-000000000002',s.id,s.name,90,1,500,'MXN','Fixture','historical@example.test','2030-01-01T12:00Z','2030-01-01T13:30Z','stripe','pending','cancelled','2030-01-01T11:00Z',repeat('8',64),'not_started' FROM public.services s WHERE slug='sesion-1-1';
    INSERT INTO public.booking_payment_attempts(booking_id,status,amount_minor,currency,checkout_payload,checkout_creation_state,last_error)
    VALUES('10000000-0000-4000-8000-000000000002','unknown',50000,'mxn','{}','ambiguous','stripe_request_unknown');
    INSERT INTO public.stripe_events(stripe_event_id,event_type,object_id,booking_id,status,processed_at)
    VALUES('evt_historical','checkout.session.expired','cs_test_historical','10000000-0000-4000-8000-000000000002','processed',now());
    INSERT INTO public.booking_intake_forms(source_type,status,access_token_hash,access_token_encrypted) VALUES('manual','submitted',repeat('7',64),'historical-fixture');`);
  historicalFingerprint=json(historicalSql);
  sql(readFileSync(liveMigrations.at(-1),'utf8'));
});after(()=>pg.stop());
const booking=id=>json(`SELECT to_jsonb(b) FROM public.bookings b WHERE id=${quote(id)}`);
const process=id=>json(`SELECT to_jsonb(p) FROM public.coaching_processes p WHERE id=${quote(id)}`);
const attempt=id=>json(`SELECT to_jsonb(a) FROM public.booking_payment_attempts a WHERE id=${quote(id)}`);
function hold({service='sesion-1-1',mode='live',token=hash(),processToken=hash(),time=slot(),acceptance=legal}={}) {
  const result=json(`SELECT public.create_stripe_booking_hold_with_legal_v2('${service}','${time}','Fixture','fixture@example.test',NULL,NULL,'${token}',${j(acceptance)},'${mode}','${account}','${mode==='live'?origin:'http://localhost:3000'}','${processToken}','${enc}')`);
  return {...result,token,processToken,mode};
}
function claim(h,owner=randomUUID()) {
  const b=booking(h.booking_id),r=json(`SELECT public.claim_stripe_checkout_v2('${b.id}','${h.token}','${owner}','${b.stripe_site_origin}','${h.mode}','${account}','pmc_fixture')`);
  return {...h,...r,owner};
}
function bound(h) {
  const a=claim(h),session=`cs_${h.mode}_${randomUUID().replaceAll('-','')}`;
  sql(`SELECT public.begin_stripe_checkout_creation_v2('${h.booking_id}','${a.attempt.id}','${a.owner}','${h.mode}','${account}')`);
  sql(`SELECT public.save_stripe_checkout_v2('${h.booking_id}','${a.attempt.id}','${a.owner}','${session}',to_timestamp(${a.attempt.checkout_payload.expires_at}),'${h.mode}','${account}')`);
  return {...a,session};
}
function receipt(a,changes={}) {
  const metadata=a.attempt.checkout_payload.metadata;
  return {id:a.session,livemode:a.mode==='live',mode:'payment',status:'complete',payment_status:'paid',
    amount_total:Number(a.attempt.amount_minor),currency:a.attempt.currency,payment_intent:`pi_${a.attempt.id.replaceAll('-','')}`,
    client_reference_id:a.booking_id,metadata,payment_method_types:['card','link'],
    verified_payment_intent:{id:`pi_${a.attempt.id.replaceAll('-','')}`,status:'succeeded',amount:Number(a.attempt.amount_minor),amount_received:Number(a.attempt.amount_minor),
      currency:a.attempt.currency,livemode:a.mode==='live',metadata},...changes};
}
function pay(a,changes={},eventId=`evt_${randomUUID()}`,type='checkout.session.completed') {
  return json(`SELECT public.apply_stripe_checkout_event_v2('${eventId}','${type}',${j(receipt(a,changes))},'${a.mode}','${account}')`);
}
const entitlement=id=>sql(`SELECT public.assert_stripe_paid_entitlement_v1('${id}','live','${account}')`);
function child(h,{time=slot(),token=hash(),processToken=h.processToken,mode=h.mode,acct=account,notes=null}={}) {
  return json(`SELECT public.create_stripe_process_session_v1('${processToken}','${time}',${quote(notes)},'${token}','${mode}','${acct}')`);
}
function activate(id) {return json(`SELECT to_jsonb(f) FROM public.activate_stripe_intake_v1('${id}','live','${account}','${hash()}','${enc}') f`);}

test('migration preserves every historical value without assigning Test/Live provenance',()=>{
  const after=json(historicalSql);
  for(const [group,rows] of Object.entries(historicalFingerprint)){
    assert.equal(after[group]?.length,rows?.length);
    for(let n=0;n<(rows?.length??0);n++)for(const [key,value] of Object.entries(rows[n]))assert.deepEqual(after[group][n][key],value,`${group}.${key}`);
  }
  for(const group of ['bookings','attempts','events','processes'])for(const row of after[group]??[]){assert.equal(row.stripe_mode,null);assert.equal(row.stripe_account_id,null);}
  assert.equal(after.processes[0].status,'active');
  assert.throws(()=>sql(`SELECT public.assert_stripe_paid_entitlement_v1('10000000-0000-4000-8000-000000000002','live','${account}')`),/stripe_context_mismatch/);
});

for(const service of ['sesion-1-1','proceso']) test(`${service}: atomic hold/legal/server snapshots, no entitlement or side effects before payment`,()=>{
  const h=hold({service}),b=booking(h.booking_id);
  assert.equal(b.status,'pending');assert.equal(b.payment_status,'pending');assert.equal(b.stripe_mode,'live');assert.equal(b.stripe_account_id,account);
  assert.equal(Date.parse(b.payment_expires_at)-Date.parse(b.created_at),1800000);assert.ok(b.legal_terms_accepted_at);assert.ok(b.legal_adult_confirmed_at);
  assert.equal(Number(b.price_snapshot),service==='proceso'?2500:500);assert.equal(b.session_count_snapshot,service==='proceso'?6:1);
  for(const k of ['google_event_id','google_meet_url','customer_email_id','coach_email_id','paid_at','payment_reference'])assert.equal(b[k],null);
  assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id='${b.id}'`),'0');
  assert.throws(()=>entitlement(b.id),/stripe_payment_required/);
  if(h.process_id){assert.equal(process(h.process_id).status,'pending_payment');assert.equal(process(h.process_id).activated_at,null);assert.throws(()=>child(h),/process_unavailable/);}
});
test('invalid or absent legal consent rolls back all holds/processes',()=>{
  const before=sql('SELECT count(*) FROM public.bookings');const cp=sql('SELECT count(*) FROM public.coaching_processes');
  assert.throws(()=>hold({service:'proceso',acceptance:{...legal,ageConfirmed:false}}),/legal_acceptance_required/);
  assert.equal(sql('SELECT count(*) FROM public.bookings'),before);assert.equal(sql('SELECT count(*) FROM public.coaching_processes'),cp);
});
test('quote, unknown amount, unsupported package size and currency fail closed',()=>{
  for(const [column,value] of [['requires_quote','true'],['price','NULL'],['currency',"'usd'"],['session_count','5']]) {
    sql(`UPDATE public.services SET ${column}=${value} WHERE slug='proceso'`);
    assert.throws(()=>hold({service:'proceso'}),/service_unavailable/);
    sql("UPDATE public.services SET requires_quote=false,price=2500,currency='MXN',session_count=6 WHERE slug='proceso'");
  }
});
test('hold retry returns same booking/process/deadline and does not rotate process access',()=>{
  const token=hash(),pt=hash(),time=slot(),h=hold({service:'proceso',token,processToken:pt,time}),b=booking(h.booking_id),cp=process(h.process_id);
  const retry=hold({service:'proceso',token,time,processToken:hash()});assert.equal(retry.booking_id,h.booking_id);assert.equal(retry.process_id,h.process_id);
  assert.deepEqual(booking(h.booking_id),b);assert.deepEqual(process(h.process_id),cp);
});
for(const mode of ['test','live']) test(`${mode} purchase verifies complete receipt and activates exactly one process`,()=>{
  const a=bound(hold({service:'proceso',mode})),result=pay(a),b=booking(a.booking_id),cp=process(a.process_id);
  assert.equal(result.accepted,true);assert.equal(b.payment_status,'paid');assert.equal(b.status,'pending');assert.equal(b.finalization_status,'pending');
  assert.equal(cp.status,'active');assert.ok(cp.activated_at);assert.equal(cp.total_sessions,6);assert.equal(cp.purchase_booking_id,b.id);
  assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE process_id='${cp.id}'`),'1');
  assert.equal(sql(`SELECT count(*) FROM public.coaching_processes WHERE purchase_booking_id='${b.id}'`),'1');
  assert.equal(attempt(a.attempt.id).status,'paid');
});
test('successful individual payment has one attempt and matching durable ledger',()=>{
  const a=bound(hold()),result=pay(a);assert.equal(result.accepted,true);assert.doesNotThrow(()=>entitlement(a.booking_id));
  assert.equal(booking(a.booking_id).process_id,null);assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id='${a.booking_id}'`),'1');
});
test('duplicate and delayed duplicate events preserve exact paid evidence and entitlement',()=>{
  const a=bound(hold({service:'proceso'})),id=`evt_${randomUUID()}`;pay(a,{},id);const b=booking(a.booking_id),cp=process(a.process_id),at=attempt(a.attempt.id);
  assert.equal(pay(a,{},id).duplicate,true);assert.deepEqual(booking(a.booking_id),b);assert.deepEqual(process(a.process_id),cp);assert.deepEqual(attempt(a.attempt.id),at);
  assert.equal(sql(`SELECT count(*) FROM public.stripe_events WHERE stripe_event_id='${id}'`),'1');
});
for(const [label,changes] of [
 ['forged amount',{amount_total:1}],['wrong currency',{currency:'usd'}],['foreign metadata',{metadata:{booking_id:randomUUID()}}],
 ['unpaid',{payment_status:'unpaid'}],['missing intent receipt',{verified_payment_intent:null}],
 ['deferred method',{payment_method_types:['oxxo']}],['mismatched intent',{payment_intent:'pi_other'}],
]) test(`${label} cannot grant package entitlement or finalization`,()=>{
  const a=bound(hold({service:'proceso'})),r=pay(a,changes);assert.equal(r.accepted,false);assert.equal(r.review_required,true);
  assert.equal(process(a.process_id).status,'pending_payment');assert.equal(booking(a.booking_id).payment_status,'pending');
  assert.equal(booking(a.booking_id).finalization_status,'review_required');assert.throws(()=>entitlement(a.booking_id),/stripe_payment_required/);
});
for(const [label,mode,acct] of [['Test in Live','test',account],['wrong account','live','acct_other']])test(`${label} rejected atomically`,()=>{
  const a=bound(hold({service:'proceso'}));const before=sql('SELECT count(*) FROM public.stripe_events');
  assert.throws(()=>json(`SELECT public.apply_stripe_checkout_event_v2('evt_${randomUUID()}','checkout.session.completed',${j(receipt(a))},'${mode}','${acct}')`),/invalid_event|stripe_context_mismatch/);
  assert.equal(sql('SELECT count(*) FROM public.stripe_events'),before);assert.equal(process(a.process_id).status,'pending_payment');
});
test('legacy test financial RPC cannot reinterpret provenanced Live booking',()=>{
  const a=bound(hold());assert.throws(()=>sql(`SELECT public.apply_stripe_checkout_event_v1('evt_legacy','checkout.session.completed',${j(receipt(a,{livemode:false}))})`),/stripe_v2_required/);
  assert.equal(booking(a.booking_id).payment_status,'pending');
});
test('late payment records funds for review without reviving slot or activating process',()=>{
  const a=bound(hold({service:'proceso'}));sql(`UPDATE public.bookings SET payment_expires_at=now()-interval '1 second' WHERE id='${a.booking_id}'`);
  sql(`SELECT public.expire_stripe_booking_hold_v2('${a.booking_id}','${a.attempt.id}',true,'live','${account}')`);
  assert.equal(booking(a.booking_id).status,'cancelled');assert.equal(process(a.process_id).status,'cancelled');
  const r=pay(a);assert.equal(r.accepted,false);assert.equal(r.review_required,true);assert.equal(booking(a.booking_id).status,'cancelled');assert.notEqual(process(a.process_id).status,'active');
});
test('expired Checkout cancels hold and leaves no side effects',()=>{
  const a=bound(hold({service:'proceso'}));sql(`UPDATE public.bookings SET payment_expires_at=now()-interval '1 second' WHERE id='${a.booking_id}'`);
  pay(a,{status:'expired',payment_status:'unpaid',payment_intent:null},`evt_${randomUUID()}`,'checkout.session.expired');
  assert.equal(booking(a.booking_id).status,'cancelled');assert.equal(booking(a.booking_id).payment_status,'pending');assert.equal(attempt(a.attempt.id).status,'expired');
  assert.equal(process(a.process_id).status,'cancelled');assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id='${a.booking_id}'`),'0');
});
test('deterministic failure creates safe successor, same hold, new metadata identities, one active attempt',()=>{
  const a=claim(hold({service:'proceso'})),b=booking(a.booking_id);
  sql(`SELECT public.begin_stripe_checkout_creation_v2('${a.booking_id}','${a.attempt.id}','${a.owner}','live','${account}')`);
  sql(`SELECT public.record_stripe_checkout_failure_v2('${a.booking_id}','${a.attempt.id}','${a.owner}','failed','stripe_invalid_request','live','${account}')`);
  const rejected=attempt(a.attempt.id),next=claim(a);assert.notEqual(next.attempt.id,a.attempt.id);assert.equal(rejected.status,'failed');assert.equal(rejected.checkout_creation_state,'rejected');
  assert.equal(next.attempt.checkout_payload.metadata.payment_attempt_id,next.attempt.id);assert.equal(next.attempt.checkout_payload.payment_intent_data.metadata.payment_attempt_id,next.attempt.id);
  assert.equal(next.attempt.checkout_payload.expires_at,a.attempt.checkout_payload.expires_at);assert.equal(next.attempt.amount_minor,a.attempt.amount_minor);
  assert.equal(booking(a.booking_id).payment_expires_at,b.payment_expires_at);assert.equal(booking(a.booking_id).created_at,b.created_at);assert.deepEqual(attempt(a.attempt.id),rejected);
  assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id='${b.id}' AND status IN ('creating','unknown','open')`),'1');
});
test('ambiguous failure never authorizes successor with a different idempotency key',()=>{
  const a=claim(hold());sql(`SELECT public.begin_stripe_checkout_creation_v2('${a.booking_id}','${a.attempt.id}','${a.owner}','live','${account}')`);
  sql(`SELECT public.record_stripe_checkout_failure_v2('${a.booking_id}','${a.attempt.id}','${a.owner}','unknown','stripe_request_unknown','live','${account}')`);
  const next=claim(a);assert.equal(next.attempt.id,a.attempt.id);assert.equal(next.attempt.status,'unknown');assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id='${a.booking_id}'`),'1');
});
test('package first plus five remaining sessions: one charge, stable entitlement, seventh forbidden',()=>{
  const h=hold({service:'proceso'}),a=bound(h);pay(a);const purchase=booking(a.booking_id);
  for(let n=2;n<=6;n++){const c=child(h);assert.equal(c.package_session_number,n);const b=booking(c.booking_id);assert.equal(b.payment_status,'paid');assert.equal(b.payment_reference,purchase.payment_reference);assert.equal(b.paid_at,purchase.paid_at);assert.equal(b.price_snapshot,null);assert.equal(b.status,'pending');assert.equal(b.google_event_id,null);assert.equal(b.legal_terms_accepted_at,purchase.legal_terms_accepted_at);assert.doesNotThrow(()=>entitlement(b.id));}
  assert.throws(()=>child(h),/process_sessions_exhausted/);assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE process_id='${h.process_id}'`),'6');
  assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id IN (SELECT id FROM public.bookings WHERE process_id='${h.process_id}')`),'1');
});
test('same process request is idempotent; changed payload cannot reuse credential',()=>{
  const h=hold({service:'proceso'});pay(bound(h));const token=hash(),time=slot(),c=child(h,{token,time});const b=booking(c.booking_id);
  assert.deepEqual(child(h,{token,time}),c);assert.deepEqual(booking(c.booking_id),b);assert.throws(()=>child(h,{token,time:slot()}),/flow_mismatch/);
});
test('wrong process token or account cannot allocate an entitlement',()=>{
  const h=hold({service:'proceso'});pay(bound(h));for(const opts of [{processToken:hash()},{acct:'acct_other'},{mode:'test'}])assert.throws(()=>child(h,opts),/process_unavailable/);
  assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE process_id='${h.process_id}'`),'1');
});
test('concurrent distinct child requests allocate distinct ordinals under a single process lock',async()=>{
  const h=hold({service:'proceso'});pay(bound(h));const statements=[0,1].map(()=>`SELECT public.create_stripe_process_session_v1('${h.processToken}','${slot()}',NULL,'${hash()}','live','${account}')`);
  const results=await Promise.all(statements.map(s=>pg.run(s)));assert.ok(results.every(r=>r.code===0),results.map(r=>r.errors).join('\n'));
  const ordinals=results.map(r=>JSON.parse(r.output).package_session_number).sort();assert.deepEqual(ordinals,[2,3]);
});
test('concurrent repeated child request consumes exactly one ordinal',async()=>{
  const h=hold({service:'proceso'});pay(bound(h));const token=hash(),time=slot(),statement=`SELECT public.create_stripe_process_session_v1('${h.processToken}','${time}',NULL,'${token}','live','${account}')`;
  const results=await Promise.all([pg.run(statement),pg.run(statement)]);assert.ok(results.every(r=>r.code===0));assert.equal(JSON.parse(results[0].output).booking_id,JSON.parse(results[1].output).booking_id);
  assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE process_id='${h.process_id}'`),'2');
});
test('rescheduling same booking consumes no extra ordinal; cancellation does not silently restore entitlement',()=>{
  const h=hold({service:'proceso'});pay(bound(h));const c=child(h),time=slot();sql(`UPDATE public.bookings SET starts_at='${time}',ends_at=('${time}'::timestamptz)+interval '90 minutes' WHERE id='${c.booking_id}'`);
  assert.equal(booking(c.booking_id).package_session_number,2);assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE process_id='${h.process_id}'`),'2');
  sql(`UPDATE public.bookings SET status='cancelled' WHERE id='${c.booking_id}'`);assert.equal(child(h).package_session_number,3);
});
test('one Intake per paid process is reused across sessions without token rotation',()=>{
  const h=hold({service:'proceso'});pay(bound(h));const f=activate(h.booking_id),c=child(h),again=activate(c.booking_id);
  assert.equal(f.form_id,again.form_id);assert.equal(f.access_token_hash,again.access_token_hash);assert.equal(f.access_token_encrypted,again.access_token_encrypted);assert.equal(f.intake_created,true);assert.equal(again.intake_created,false);
  assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE process_id='${h.process_id}'`),'1');
});
test('package Intake legal consent and one final submission retain server enforcement',()=>{
  const h=hold({service:'proceso'});pay(bound(h));const f=activate(h.booking_id),answers={age:30,current_situation:'Fixture only'};
  const save=(consent=true)=>json(`SELECT public.save_intake_with_legal_consent_v1('${f.form_id}','${f.access_token_hash}',${j(answers)},5,true,'2026-10-29.2',${consent})`);
  assert.equal(save(false).error_code,'consent_required');const r=save();assert.equal(r.form.status,'submitted');assert.ok(r.form.submitted_at);assert.ok(r.form.sensitive_data_consent_at);assert.equal(save().error_code,'already_submitted');
});
test('finalization lease requires verified receipt; completed requires Calendar/Meet, both emails and Intake',()=>{
  const h=hold({service:'proceso'});assert.throws(()=>sql(`SELECT public.claim_stripe_finalization_v2('${h.booking_id}','${randomUUID()}','live','${account}')`),/stripe_payment_required/);
  pay(bound(h));const owner=randomUUID();json(`SELECT public.claim_stripe_finalization_v2('${h.booking_id}','${owner}','live','${account}')`);
  const save=(step,data={})=>json(`SELECT public.save_stripe_finalization_v2('${h.booking_id}','${owner}','${step}',${j(data)},'live','${account}')`);
  assert.throws(()=>save('completed'),/incomplete_finalization/);save('calendar',{eventId:`event_${randomUUID()}`,meetUrl:'https://meet.google.com/fixture'});
  save('customer_email',{id:'fixture_customer'});save('coach_email',{id:'fixture_coach'});assert.throws(()=>save('completed'),/incomplete_finalization/);
  activate(h.booking_id);assert.equal(save('completed').finalization_status,'completed');
});
test('new RPCs deny public/anon/authenticated and permit only service role; no RLS changes',()=>{
  const rows=json(`SELECT jsonb_agg(jsonb_build_object('name',p.proname,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'owner',pg_get_userbyid(p.proowner),'path',p.proconfig)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('create_stripe_booking_hold_with_legal_v2','claim_stripe_checkout_v2','apply_stripe_checkout_event_v2','activate_stripe_intake_v1','create_stripe_process_session_v1')`);
  assert.equal(rows.length,5);for(const r of rows){assert.equal(r.anon,false);assert.equal(r.authenticated,false);assert.equal(r.service,true);assert.equal(r.owner,'postgres');assert.ok(r.path.some(x=>x==='search_path=pg_catalog, pg_temp'));}
  assert.equal(sql("SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.bookings'::regclass,'public.booking_intake_forms'::regclass,'public.booking_payment_attempts'::regclass,'public.stripe_events'::regclass,'public.coaching_processes'::regclass)"),'t');
});

test('server snapshots are immutable despite catalogue changes after hold',()=>{
  const h=hold({service:'proceso'}),b=booking(h.booking_id),cp=process(h.process_id);
  sql("UPDATE public.services SET price=3000,duration_minutes=100,session_count=7 WHERE slug='proceso'");
  try {const a=bound(h);assert.equal(Number(a.attempt.amount_minor),250000);pay(a);assert.equal(process(h.process_id).total_sessions,6);
    const c=child(h);assert.equal(booking(c.booking_id).duration_minutes_snapshot,90);assert.equal(booking(c.booking_id).session_count_snapshot,6);
    assert.equal(booking(h.booking_id).price_snapshot,b.price_snapshot);assert.equal(process(h.process_id).price_snapshot,cp.price_snapshot);
  } finally {sql("UPDATE public.services SET price=2500,duration_minutes=90,session_count=6 WHERE slug='proceso'");}
});
test('concurrent same hold request produces exactly one booking and one pending process',async()=>{
  const token=hash(),pt=hash(),time=slot(),s=`SELECT public.create_stripe_booking_hold_with_legal_v2('proceso','${time}','Fixture','fixture@example.test',NULL,NULL,'${token}',${j(legal)},'live','${account}','${origin}','${pt}','${enc}')`;
  const results=await Promise.all([pg.run(s),pg.run(s)]);assert.ok(results.every(r=>r.code===0),results.map(r=>r.errors).join('\n'));
  const [a,b]=results.map(r=>JSON.parse(r.output));assert.equal(a.booking_id,b.booking_id);assert.equal(a.process_id,b.process_id);
  assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE booking_access_token_hash='${token}'`),'1');
  assert.equal(sql(`SELECT count(*) FROM public.coaching_processes WHERE purchase_booking_id='${a.booking_id}'`),'1');
});
test('concurrent checkout retry leases cannot allocate multiple active attempts',async()=>{
  const h=hold({service:'proceso'}),s=()=>`SELECT public.claim_stripe_checkout_v2('${h.booking_id}','${h.token}','${randomUUID()}','${origin}','live','${account}','pmc_fixture')`;
  const results=await Promise.all([pg.run(s()),pg.run(s())]);assert.equal(results.filter(r=>r.code===0).length,1);assert.match(results.find(r=>r.code!==0).errors,/checkout_in_progress/);
  assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id='${h.booking_id}' AND status IN ('creating','open','unknown')`),'1');
});
test('cancelled browser Checkout remains unpaid and no financial event or external side effect is fabricated',()=>{
  const a=bound(hold({service:'proceso'}));const b=booking(a.booking_id),cp=process(a.process_id);
  const reopened=claim(a);assert.equal(reopened.attempt.id,a.attempt.id);assert.equal(reopened.attempt.stripe_checkout_session_id,a.session);
  assert.equal(booking(a.booking_id).payment_status,'pending');assert.equal(booking(a.booking_id).status,'pending');assert.deepEqual(process(a.process_id),cp);
  assert.equal(booking(a.booking_id).payment_expires_at,b.payment_expires_at);assert.equal(booking(a.booking_id).google_event_id,null);
  assert.equal(sql(`SELECT count(*) FROM public.stripe_events WHERE booking_id='${a.booking_id}'`),'0');
});
for(const status of ['expired','revoked'])test(`later paid sessions do not inherit a package expiration from ${status} original Intake`,()=>{
  const h=hold({service:'proceso'});pay(bound(h));const f=activate(h.booking_id),c=child(h);
  sql(`UPDATE public.booking_intake_forms SET status='${status}',expires_at=now()-interval '1 day' WHERE id='${f.form_id}'`);
  const reused=activate(c.booking_id);assert.equal(reused.form_id,f.form_id);assert.equal(reused.access_token_hash,f.access_token_hash);
  const owner=randomUUID();json(`SELECT public.claim_stripe_finalization_v2('${c.booking_id}','${owner}','live','${account}')`);
  const save=(step,data={})=>json(`SELECT public.save_stripe_finalization_v2('${c.booking_id}','${owner}','${step}',${j(data)},'live','${account}')`);
  save('calendar',{eventId:`event_${randomUUID()}`,meetUrl:'https://meet.google.com/fixture'});save('customer_email',{id:'fixture_customer'});save('coach_email',{id:'fixture_coach'});
  assert.equal(save('completed').finalization_status,'completed');assert.equal(process(h.process_id).status,'active');
});
test('changing only paid flags without accepted ledger cannot authorize side effects or process access',()=>{
  const h=hold();sql(`UPDATE public.bookings SET payment_status='paid',payment_provider='stripe',payment_reference='pi_unverified',paid_at=now() WHERE id='${h.booking_id}'`);
  assert.throws(()=>entitlement(h.booking_id),/stripe_payment_required/);assert.throws(()=>activate(h.booking_id),/stripe_payment_required/);
  assert.throws(()=>json(`SELECT public.claim_stripe_finalization_v2('${h.booking_id}','${randomUUID()}','live','${account}')`),/stripe_payment_required/);
});

function finalized({service='sesion-1-1',h=null}={}) {
  h??=hold({service});if(booking(h.booking_id).payment_status!=='paid')pay(bound(h));const owner=randomUUID();
  json(`SELECT public.claim_stripe_finalization_v2('${h.booking_id}','${owner}','live','${account}')`);
  const save=(step,data={})=>json(`SELECT public.save_stripe_finalization_v2('${h.booking_id}','${owner}','${step}',${j(data)},'live','${account}')`);
  save('calendar',{eventId:`event_${randomUUID()}`,meetUrl:'https://meet.google.com/fixture'});
  const f=activate(h.booking_id);save('customer_email',{id:`email_${randomUUID()}`});save('coach_email',{id:`email_${randomUUID()}`});save('completed');
  return {...h,form:f};
}
const change=(h,kind='rescheduled',time=slot(),requestId=randomUUID(),mode='live',acct=account)=>json(`SELECT public.request_stripe_booking_change_v1('${h.booking_id}','${kind}',${kind==='cancelled'?'NULL':`'${time}'`},'${requestId}','${mode}','${acct}')`);
const job=id=>json(`SELECT to_jsonb(j) FROM public.booking_change_jobs j WHERE id='${id}'`);
const claimChange=(id,owner=randomUUID())=>({...json(`SELECT public.claim_stripe_booking_change_v1(${quote(id)},'${owner}','live','${account}')`),owner});
const saveChange=(id,owner,action,data={})=>json(`SELECT public.save_stripe_booking_change_v1('${id}','${owner}','${action}',${j(data)})`);
function completeChange(id,owner) {saveChange(id,owner,'calendar_completed');saveChange(id,owner,'email_started');saveChange(id,owner,'email_sent',{id:`email_${randomUUID()}`});return saveChange(id,owner,'completed');}

test('durable administrative reschedule changes same booking atomically with one scoped outbox job',()=>{
  const h=finalized({service:'proceso'}),before=booking(h.booking_id),time=slot(),requestId=randomUUID(),r=change(h,'rescheduled',time,requestId),b=booking(h.booking_id),work=job(r.job_id);
  for(const key of ['id','booking_reference','process_id','package_session_number','payment_status','payment_provider','payment_reference','paid_at','google_event_id','google_meet_url','created_at','payment_expires_at'])assert.deepEqual(b[key],before[key],key);
  assert.notEqual(b.starts_at,before.starts_at);assert.equal(work.status,'pending');assert.equal(work.booking_snapshot.starts_at,b.starts_at);
  assert.equal(work.stripe_mode,'live');assert.equal(work.stripe_account_id,account);assert.equal(work.email_started_at,null);assert.equal(work.calendar_completed_at,null);
  assert.equal(change(h,'rescheduled',time,requestId).job_id,r.job_id);assert.equal(change(h,'rescheduled',time).job_id,r.job_id);
  assert.throws(()=>change(h,'rescheduled',slot(),requestId),/booking_change_request_mismatch/);assert.throws(()=>change(h,'rescheduled',slot()),/booking_change_in_progress/);
  assert.equal(sql(`SELECT count(*) FROM public.booking_change_jobs WHERE booking_id='${b.id}'`),'1');
  assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE process_id='${h.process_id}'`),'1');
});
test('completed same-state booking change retry reuses previous job and never resends',()=>{
  const h=finalized(),time=slot(),requestId=randomUUID(),r=change(h,'rescheduled',time,requestId),c=claimChange(r.job_id);assert.equal(c.claimed,true);
  completeChange(r.job_id,c.owner);const before=job(r.job_id),b=booking(h.booking_id);
  assert.equal(change(h,'rescheduled',time,requestId).job_id,r.job_id);assert.equal(change(h,'rescheduled',time).job_id,r.job_id);
  assert.deepEqual(job(r.job_id),before);assert.deepEqual(booking(h.booking_id),b);assert.equal(claimChange(r.job_id).claimed,false);
  assert.equal(sql(`SELECT count(*) FROM public.booking_change_jobs WHERE booking_id='${h.booking_id}'`),'1');
});
test('new reschedule after a different completed target is a new durable change, not an older duplicate',()=>{
  const h=finalized(),timeA=slot(),a=change(h,'rescheduled',timeA);let c=claimChange(a.job_id);completeChange(a.job_id,c.owner);
  const timeB=slot(),b=change(h,'rescheduled',timeB);c=claimChange(b.job_id);completeChange(b.job_id,c.owner);
  const again=change(h,'rescheduled',timeA);assert.notEqual(again.job_id,a.job_id);assert.notEqual(again.job_id,b.job_id);assert.equal(job(again.job_id).status,'pending');
});
test('administrative cancellation of first session retains paid process entitlement without a refund or recycled ordinal',()=>{
  const h=finalized({service:'proceso'}),b=booking(h.booking_id),cp=process(h.process_id),r=change(h,'cancelled');
  const after=booking(h.booking_id);assert.equal(after.status,'cancelled');assert.equal(after.cancellation_reason,'admin_cancelled');
  for(const key of ['id','process_id','package_session_number','payment_status','payment_provider','payment_reference','paid_at','price_snapshot'])assert.deepEqual(after[key],b[key],key);
  assert.deepEqual(process(h.process_id),cp);assert.doesNotThrow(()=>entitlement(h.booking_id));const c=child(h);assert.equal(c.package_session_number,2);assert.doesNotThrow(()=>entitlement(c.booking_id));
  const lease=claimChange(r.job_id);completeChange(r.job_id,lease.owner);assert.equal(change(h,'cancelled').job_id,r.job_id);
  assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id='${h.booking_id}'`),'1');
});
test('new matching paid event after administrative cancellation does not revoke paid package entitlement',()=>{
  const h=hold({service:'proceso'}),a=bound(h);pay(a);finalized({h});change(h,'cancelled');
  const before=booking(h.booking_id),r=pay(a);assert.equal(r.accepted,true);assert.equal(booking(h.booking_id).status,'cancelled');
  assert.equal(booking(h.booking_id).paid_at,before.paid_at);assert.equal(booking(h.booking_id).payment_reference,before.payment_reference);
  assert.equal(process(h.process_id).status,'active');assert.doesNotThrow(()=>entitlement(h.booking_id));assert.equal(child(h).package_session_number,2);
});
test('unpaid and unscoped admin change requests fail before either mutation or outbox insertion',()=>{
  const h=hold(),before=booking(h.booking_id);assert.throws(()=>change(h),/stripe_payment_required/);assert.deepEqual(booking(h.booking_id),before);
  const paid=finalized(),b=booking(paid.booking_id);assert.throws(()=>change(paid,'rescheduled',slot(),randomUUID(),'test'),/stripe_context_mismatch/);
  assert.throws(()=>change(paid,'rescheduled',slot(),randomUUID(),'live','acct_other'),/stripe_context_mismatch/);assert.deepEqual(booking(paid.booking_id),b);
  assert.equal(sql(`SELECT count(*) FROM public.booking_change_jobs WHERE booking_id IN ('${h.booking_id}','${paid.booking_id}')`),'0');
});
test('two booking-change workers cannot claim the same job lease',async()=>{
  const h=finalized(),r=change(h),s=()=>`SELECT public.claim_stripe_booking_change_v1('${r.job_id}','${randomUUID()}','live','${account}')`;
  const results=await Promise.all([pg.run(s()),pg.run(s())]);assert.ok(results.every(r=>r.code===0));assert.equal(results.map(r=>JSON.parse(r.output)).filter(r=>r.claimed).length,1);
  assert.equal(job(r.job_id).attempt_count,1);
});
test('booking-change receipts require lease, Calendar first, durable email start, and stable identity',()=>{
  const h=finalized(),r=change(h),c=claimChange(r.job_id);
  assert.throws(()=>saveChange(r.job_id,randomUUID(),'calendar_completed'),/booking_change_lease_lost/);
  assert.throws(()=>saveChange(r.job_id,c.owner,'completed'),/booking_change_incomplete/);
  assert.throws(()=>saveChange(r.job_id,c.owner,'email_started'),/booking_change_calendar_pending/);
  assert.throws(()=>saveChange(r.job_id,c.owner,'email_sent',{id:'email_fixture'}),/booking_change_email_not_started/);
  saveChange(r.job_id,c.owner,'calendar_completed');saveChange(r.job_id,c.owner,'email_started');saveChange(r.job_id,c.owner,'email_sent',{id:'email_fixture'});
  const before=job(r.job_id);saveChange(r.job_id,c.owner,'email_sent',{id:'email_fixture'});assert.equal(job(r.job_id).email_sent_at,before.email_sent_at);
  assert.throws(()=>saveChange(r.job_id,c.owner,'email_sent',{id:'email_different'}),/booking_change_email_identity_conflict/);assert.equal(job(r.job_id).email_id,'email_fixture');
  assert.equal(saveChange(r.job_id,c.owner,'completed').status,'completed');
});
test('expired booking-change lease is recoverable; ambiguous delivery beyond provider idempotency becomes review',()=>{
  const h=finalized(),r=change(h),c=claimChange(r.job_id);saveChange(r.job_id,c.owner,'calendar_completed');saveChange(r.job_id,c.owner,'email_started');
  sql(`UPDATE public.booking_change_jobs SET lease_until=now()-interval '1 second',email_started_at=now()-interval '24 hours' WHERE id='${r.job_id}'`);
  const next=claimChange(r.job_id);assert.equal(next.claimed,false);assert.equal(next.review_required,true);assert.equal(job(r.job_id).status,'review_required');
  assert.equal(job(r.job_id).last_error,'booking_change_email_delivery_unknown');assert.equal(job(r.job_id).next_attempt_at,null);
  assert.throws(()=>change(h,'rescheduled',slot()),/booking_change_in_progress/);
});
test('retryable booking-change backoff prevents a busy retry and preserves prior Calendar receipt',()=>{
  const h=finalized(),r=change(h),c=claimChange(r.job_id);saveChange(r.job_id,c.owner,'calendar_completed');const receipt=job(r.job_id).calendar_completed_at;
  const saved=saveChange(r.job_id,c.owner,'retryable');assert.equal(saved.status,'retryable');assert.ok(Date.parse(saved.next_attempt_at)>Date.now());assert.equal(claimChange(r.job_id).claimed,false);
  sql(`UPDATE public.booking_change_jobs SET next_attempt_at=now()-interval '1 second' WHERE id='${r.job_id}'`);const next=claimChange(r.job_id);assert.equal(next.claimed,true);assert.equal(next.job.calendar_completed_at,receipt);assert.equal(next.job.attempt_count,2);
});
test('booking-change outbox is RLS protected with only service-role RPC mutation',()=>{
  assert.equal(sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.booking_change_jobs'::regclass"),'t');
  for(const role of ['anon','authenticated'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal(sql(`SELECT has_table_privilege('${role}','public.booking_change_jobs','${privilege}')`),'f');
  assert.equal(sql("SELECT has_table_privilege('service_role','public.booking_change_jobs','SELECT')"),'t');
  for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
    assert.equal(sql(`SELECT has_table_privilege('service_role','public.booking_change_jobs','${privilege}')`),'f');
  }
  for(const name of ['request_stripe_booking_change_v1','claim_stripe_booking_change_v1','save_stripe_booking_change_v1']){
    const perms=json(`SELECT jsonb_build_object('anon',has_function_privilege('anon',oid,'EXECUTE'),'auth',has_function_privilege('authenticated',oid,'EXECUTE'),'service',has_function_privilege('service_role',oid,'EXECUTE'),'owner',pg_get_userbyid(proowner)) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='${name}'`);
    assert.equal(perms.anon,false);assert.equal(perms.auth,false);assert.equal(perms.service,true);assert.equal(perms.owner,'postgres');
  }
});

function reminderFixture({service='sesion-1-1',minutes=59,childSession=false}={}) {
  sql("UPDATE public.bookings SET status='completed' WHERE starts_at<now()+interval '1 day' AND status IN ('pending','confirmed')");
  sql("UPDATE public.booking_intake_forms SET status='submitted',submitted_at=now() WHERE status='active'");
  const h=finalized({service});let id=h.booking_id;
  if(childSession){const c=child(h);id=c.booking_id;const owner=randomUUID();json(`SELECT public.claim_stripe_finalization_v2('${id}','${owner}','live','${account}')`);
    for(const [step,data] of [['calendar',{eventId:`event_${randomUUID()}`,meetUrl:'https://meet.google.com/fixture'}],['customer_email',{id:'email_child'}],['coach_email',{id:'email_child_coach'}],['completed',{}]])json(`SELECT public.save_stripe_finalization_v2('${id}','${owner}','${step}',${j(data)},'live','${account}')`);
  }
  sql(`UPDATE public.bookings SET starts_at=clock_timestamp()+interval '${minutes} minutes',ends_at=clock_timestamp()+interval '${minutes+90} minutes' WHERE id='${id}'`);
  return {...h,booking_id:id};
}
const claimReminder=()=>json(`SELECT public.claim_stripe_intake_reminder_v2('live','${account}')`);
const markReminder=c=>sql(`SELECT public.mark_stripe_intake_reminder_dispatch_started_v2('${c.booking_id}','${c.form_id}','${c.claim_started_at}','${c.expected_starts_at}','live','${account}')`);
const releaseReminder=c=>sql(`SELECT public.release_unstarted_stripe_intake_reminder_v2('${c.booking_id}','${c.claim_started_at}','live','${account}')`);
const form=id=>json(`SELECT to_jsonb(f) FROM public.booking_intake_forms f WHERE id='${id}'`);

test('scoped reminder claims only the one-hour future window and persists pre-dispatch state',()=>{
  const h=reminderFixture({minutes:300});assert.equal(claimReminder(),null);
  sql(`UPDATE public.bookings SET starts_at=clock_timestamp()+interval '59 minutes',ends_at=clock_timestamp()+interval '149 minutes' WHERE id='${h.booking_id}'`);
  const c=claimReminder();assert.equal(c.booking_id,h.booking_id);assert.equal(c.form_id,h.form.form_id);assert.equal(form(c.form_id).ready_email_error,'reminder_claimed_not_started');
  assert.equal(booking(c.booking_id).stripe_intake_email_started_at,c.claim_started_at);assert.equal(claimReminder(),null);assert.equal(markReminder(c),'t');
  assert.equal(form(c.form_id).ready_email_error,'reminder_delivery_pending_or_unknown');assert.equal(markReminder(c),'f');assert.equal(releaseReminder(c),'f');assert.equal(claimReminder(),null);
});
test('two concurrent reminder workers claim at most one shared process Intake across covered sessions',async()=>{
  const h=reminderFixture({service:'proceso',childSession:true}),s=`SELECT public.claim_stripe_intake_reminder_v2('live','${account}')`;
  const results=await Promise.all([pg.run(s),pg.run(s)]);assert.ok(results.every(r=>r.code===0));const claims=results.map(r=>JSON.parse(r.output||'null')).filter(Boolean);assert.equal(claims.length,1);
  assert.equal(claims[0].booking_id,h.booking_id);assert.equal(claims[0].form_id,h.form.form_id);assert.equal(markReminder(claims[0]),'t');assert.equal(releaseReminder(claims[0]),'f');assert.equal(claimReminder(),null);
});
test('unstarted reminder can release after reschedule; stale claim cannot dispatch new starts_at',()=>{
  const h=reminderFixture(),c=claimReminder();sql(`UPDATE public.bookings SET starts_at=clock_timestamp()+interval '5 hours',ends_at=clock_timestamp()+interval '390 minutes' WHERE id='${h.booking_id}'`);
  assert.equal(markReminder(c),'f');assert.equal(releaseReminder(c),'t');assert.equal(form(c.form_id).ready_email_error,null);assert.equal(booking(h.booking_id).stripe_intake_email_started_at,null);assert.equal(claimReminder(),null);
});
test('reminder dispatch marker cannot be released after mark even if caller crashes before provider contact',()=>{
  reminderFixture();const c=claimReminder();assert.equal(markReminder(c),'t');assert.equal(releaseReminder(c),'f');assert.equal(form(c.form_id).ready_email_error,'reminder_delivery_pending_or_unknown');assert.equal(claimReminder(),null);
});
for(const [scenario,mutation] of [
  ['submitted',h=>`UPDATE public.booking_intake_forms SET status='submitted',submitted_at=now() WHERE id='${h.form.form_id}'`],
  ['cancelled',h=>`UPDATE public.bookings SET status='cancelled' WHERE id='${h.booking_id}'`],
  ['expired form',h=>`UPDATE public.booking_intake_forms SET expires_at=now()-interval '1 second' WHERE id='${h.form.form_id}'`],
  ['session started',h=>`UPDATE public.bookings SET starts_at=now()-interval '1 minute',ends_at=now()+interval '89 minutes' WHERE id='${h.booking_id}'`],
])test(`reminder ${scenario} before mark prevents delivery and permits only unstarted release`,()=>{
  const h=reminderFixture(),c=claimReminder();sql(mutation(h));assert.equal(markReminder(c),'f');assert.equal(releaseReminder(c),'t');assert.equal(claimReminder(),null);
});
test('already sent or ambiguous process Intake cannot be newly claimed by a later covered session',()=>{
  const h=reminderFixture({service:'proceso',childSession:true});sql(`UPDATE public.booking_intake_forms SET ready_email_error='reminder_delivery_pending_or_unknown' WHERE id='${h.form.form_id}'`);assert.equal(claimReminder(),null);
  sql(`UPDATE public.booking_intake_forms SET ready_email_error=NULL,ready_email_id='email_existing',ready_email_sent_at=now() WHERE id='${h.form.form_id}'`);assert.equal(claimReminder(),null);
});
test('reminder scope cannot cross Test/Live or Stripe account, with no partial claim mutation',()=>{
  const h=reminderFixture();assert.equal(json(`SELECT public.claim_stripe_intake_reminder_v2('test','${account}')`),null);assert.equal(json("SELECT public.claim_stripe_intake_reminder_v2('live','acct_other')"),null);
  assert.equal(booking(h.booking_id).stripe_intake_email_started_at,null);assert.equal(form(h.form.form_id).ready_email_error,null);
});

test('stale expiry observation cannot expire a successor created concurrently, even with equal created_at',async()=>{
  const h=hold({service:'proceso'}),a=claim(h);
  sql(`SELECT public.begin_stripe_checkout_creation_v2('${h.booking_id}','${a.attempt.id}','${a.owner}','live','${account}')`);
  sql(`SELECT public.record_stripe_checkout_failure_v2('${h.booking_id}','${a.attempt.id}','${a.owner}','failed','stripe_invalid_request','live','${account}')`);
  const successorOwner=randomUUID();
  const creating=pg.run(`BEGIN;
    SELECT id FROM public.bookings WHERE id='${h.booking_id}' FOR UPDATE;
    SELECT public.claim_stripe_checkout_v2('${h.booking_id}','${h.token}','${successorOwner}','${origin}','live','${account}','pmc_fixture');
    UPDATE public.booking_payment_attempts SET created_at='2031-01-01' WHERE booking_id='${h.booking_id}';
    UPDATE public.bookings SET payment_expires_at=clock_timestamp()-interval '1 second' WHERE id='${h.booking_id}';
    SELECT pg_sleep(0.2); COMMIT;`);
  // Wait only until the fixture transaction has taken the booking lock. No
  // provider operation or real-time hold elapse is involved in this scenario.
  let locked=false;
  for(let n=0;n<50&&!locked;n++) {
    locked=sql(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation='public.bookings'::regclass AND mode='RowExclusiveLock' AND granted)`) === 't';
    if(!locked)await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.equal(locked,true);
  const stale=pg.run(`SELECT public.expire_stripe_booking_hold_v2('${h.booking_id}','${a.attempt.id}',true,'live','${account}')`);
  const [created,reconciled]=await Promise.all([creating,stale]);assert.equal(created.code,0,created.errors);assert.equal(reconciled.code,0,reconciled.errors);assert.equal(reconciled.output,'f');
  const active=json(`SELECT to_jsonb(a) FROM public.booking_payment_attempts a WHERE booking_id='${h.booking_id}' AND status IN ('creating','open','unknown')`);
  assert.notEqual(active.id,a.attempt.id);assert.equal(active.status,'creating');assert.equal(booking(h.booking_id).status,'pending');assert.equal(booking(h.booking_id).stripe_expiration_reconciled_at,null);
  assert.equal(sql(`SELECT public.expire_stripe_booking_hold_v2('${h.booking_id}','${active.id}',false,'live','${account}')`),'t');
  assert.equal(booking(h.booking_id).status,'cancelled');assert.equal(attempt(active.id).status,'unknown');assert.equal(booking(h.booking_id).stripe_expiration_reconciled_at,null);
  assert.equal(sql(`SELECT public.expire_stripe_booking_hold_v2('${h.booking_id}','${active.id}',true,'live','${account}')`),'t');
  assert.equal(attempt(active.id).status,'expired');assert.ok(booking(h.booking_id).stripe_expiration_reconciled_at);
});
for(const reason of ['refunded','process_revoked'])test(`queued change revalidates payment before worker side effects: ${reason}`,()=>{
  const h=finalized({service:'proceso'}),r=change(h);
  if(reason==='refunded')sql(`UPDATE public.bookings SET payment_status='refunded' WHERE id='${h.booking_id}'`);
  else sql(`UPDATE public.coaching_processes SET status='cancelled' WHERE id='${h.process_id}'`);
  const claimed=claimChange(r.job_id);assert.equal(claimed.claimed,false);assert.equal(claimed.review_required,true);assert.equal(job(r.job_id).status,'review_required');
  assert.equal(job(r.job_id).last_error,'booking_change_payment_review');assert.equal(job(r.job_id).calendar_completed_at,null);assert.equal(job(r.job_id).email_started_at,null);
});
test('two reminder marks have a single dispatch winner and mark versus release cannot reopen a started reminder',async()=>{
  reminderFixture();const c=claimReminder(),statement=`SELECT public.mark_stripe_intake_reminder_dispatch_started_v2('${c.booking_id}','${c.form_id}','${c.claim_started_at}','${c.expected_starts_at}','live','${account}')`;
  const results=await Promise.all([pg.run(statement),pg.run(statement)]);assert.ok(results.every(r=>r.code===0));assert.deepEqual(results.map(r=>r.output).sort(),['f','t']);
  assert.equal(releaseReminder(c),'f');assert.equal(form(c.form_id).ready_email_error,'reminder_delivery_pending_or_unknown');
});

test('covered session snapshot duration must fit the complete currently offered availability interval',()=>{
  const h=hold({service:'proceso'});pay(bound(h));sql("UPDATE public.services SET duration_minutes=60 WHERE slug='proceso'");
  try {assert.throws(()=>child(h),/slot_conflict/);assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE process_id='${h.process_id}'`),'1');}
  finally {sql("UPDATE public.services SET duration_minutes=90 WHERE slug='proceso'");}
});
test('repeated verified expiration is a read-only idempotent result after reconciliation',()=>{
  const a=bound(hold());sql(`UPDATE public.bookings SET payment_expires_at=now()-interval '1 second' WHERE id='${a.booking_id}'`);
  const expiry=`SELECT public.expire_stripe_booking_hold_v2('${a.booking_id}','${a.attempt.id}',true,'live','${account}')`;
  assert.equal(sql(expiry),'t');const b=booking(a.booking_id),at=attempt(a.attempt.id),xmin=sql(`SELECT xmin FROM public.bookings WHERE id='${a.booking_id}'`),axmin=sql(`SELECT xmin FROM public.booking_payment_attempts WHERE id='${a.attempt.id}'`);
  assert.equal(sql(expiry),'t');assert.deepEqual(booking(a.booking_id),b);assert.deepEqual(attempt(a.attempt.id),at);
  assert.equal(sql(`SELECT xmin FROM public.bookings WHERE id='${a.booking_id}'`),xmin);assert.equal(sql(`SELECT xmin FROM public.booking_payment_attempts WHERE id='${a.attempt.id}'`),axmin);
});

test('paid process proof also binds the original purchase and immutable service/session snapshots',()=>{
  const h=hold({service:'proceso'});pay(bound(h));const c=child(h);
  sql(`UPDATE public.bookings SET duration_minutes_snapshot=60 WHERE id='${c.booking_id}'`);
  assert.throws(()=>entitlement(c.booking_id),/stripe_payment_required/);
  sql(`UPDATE public.bookings SET duration_minutes_snapshot=90 WHERE id='${c.booking_id}'`);assert.doesNotThrow(()=>entitlement(c.booking_id));
  sql(`UPDATE public.coaching_processes SET price_snapshot=1 WHERE id='${h.process_id}'`);
  assert.throws(()=>entitlement(c.booking_id),/stripe_payment_required/);assert.throws(()=>child(h),/stripe_payment_required/);
});

const adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const resolveSession=(id,action,actor=adminId)=>json(`SELECT public.resolve_stripe_session_v1('${id}','${action}','${actor}','live','${account}')`);
function lateCancellation(h) {
  sql(`UPDATE public.bookings SET starts_at=now()+interval '3 hours',ends_at=now()+interval '270 minutes' WHERE id='${h.booking_id}'`);
  return json(`SELECT public.request_stripe_booking_change_v1('${h.booking_id}','cancelled',NULL,'${randomUUID()}','live','${account}','${adminId}')`);
}
test('new package expiry is exactly 90 calendar days from verified payment and cannot restart on replay',()=>{
  const h=hold({service:'proceso'});assert.equal(process(h.process_id).expires_at,null);
  const a=bound(h);pay(a);const cp=process(h.process_id),b=booking(h.booking_id);
  assert.equal(Date.parse(cp.expires_at)-Date.parse(b.paid_at),90*86400000);
  pay(a);assert.equal(process(h.process_id).expires_at,cp.expires_at);
});
test('a package cannot be purchased with a first appointment outside its 90-day term or obsolete acceptance',()=>{
  const count=sql('SELECT count(*) FROM public.coaching_processes');
  assert.throws(()=>hold({service:'proceso',time:new Date(Date.now()+91*86400000).toISOString()}),/process_outside_validity/);
  assert.throws(()=>hold({service:'proceso',acceptance:{...legal,termsVersion:'2026-10-29.2'}}),/legal_acceptance_required/);
  assert.equal(sql('SELECT count(*) FROM public.coaching_processes'),count);
});
test('all of a covered session must fit before expiry; an exact end boundary is accepted',()=>{
  const h=hold({service:'proceso'});pay(bound(h));const time=slot();
  sql(`UPDATE public.coaching_processes SET expires_at='${time}'::timestamptz+interval '90 minutes' WHERE id='${h.process_id}'`);
  const c=child(h,{time});assert.equal(Date.parse(booking(c.booking_id).ends_at),Date.parse(process(h.process_id).expires_at));
  assert.throws(()=>child(h,{time:slot()}),/process_outside_validity/);
  const count=sql(`SELECT count(*) FROM public.bookings WHERE process_id='${h.process_id}'`);
  sql(`UPDATE public.coaching_processes SET expires_at=now()-interval '1 second' WHERE id='${h.process_id}'`);
  assert.throws(()=>child(h),/process_outside_validity/);assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE process_id='${h.process_id}'`),count);
});
test('administrative reschedule cannot move a paid package appointment outside its original term',()=>{
  const h=finalized({service:'proceso'}),before=booking(h.booking_id);
  assert.throws(()=>change(h,'rescheduled',new Date(Date.now()+91*86400000).toISOString()),/process_outside_validity/);
  assert.deepEqual(booking(h.booking_id),before);assert.equal(sql(`SELECT count(*) FROM public.booking_change_jobs WHERE booking_id='${h.booking_id}'`),'0');
});
test('late cancellation reserves its ordinal pending an explicit active-admin decision',()=>{
  const h=finalized({service:'proceso'}),expiry=process(h.process_id).expires_at;lateCancellation(h);
  const b=booking(h.booking_id);assert.equal(b.session_resolution,'late_cancel_pending');assert.equal(b.session_resolution_by,adminId);assert.ok(b.session_resolution_at);
  assert.equal(child(h).package_session_number,2); // Pending ordinal 1 is not returned.
  assert.throws(()=>resolveSession(h.booking_id,'consume','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),/admin_required/);
  resolveSession(h.booking_id,'consume');assert.equal(booking(h.booking_id).session_resolution,'consumed');
  assert.throws(()=>resolveSession(h.booking_id,'approve_replacement'),/session_already_resolved/);
  assert.equal(process(h.process_id).expires_at,expiry);
});
test('approved late cancellation creates one replacement with the same ordinal and keeps the original evidence',()=>{
  const h=finalized({service:'proceso'});lateCancellation(h);resolveSession(h.booking_id,'approve_replacement');
  const original=booking(h.booking_id),expiry=process(h.process_id).expires_at;
  const token=hash(),time=slot(),c=child(h,{token,time});assert.equal(c.package_session_number,1);
  assert.equal(booking(c.booking_id).replaces_booking_id,h.booking_id);assert.deepEqual(booking(h.booking_id),original);
  assert.equal(child(h,{token,time}).booking_id,c.booking_id);assert.equal(child(h).package_session_number,2);
  assert.equal(process(h.process_id).expires_at,expiry);
  assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts a JOIN public.bookings b ON a.booking_id=b.id WHERE b.process_id='${h.process_id}'`),'1');
});
test('no-show cannot be marked before start; afterward it consumes one session with immutable actor/time evidence',()=>{
  const h=finalized({service:'proceso'});assert.throws(()=>resolveSession(h.booking_id,'no_show'),/session_not_started/);
  sql(`UPDATE public.bookings SET starts_at=now()-interval '2 hours',ends_at=now()-interval '30 minutes' WHERE id='${h.booking_id}'`);
  sql(`UPDATE public.bookings SET finalization_status='retryable' WHERE id='${h.booking_id}'`);
  assert.throws(()=>resolveSession(h.booking_id,'no_show'),/session_not_started/);
  sql(`UPDATE public.bookings SET finalization_status='completed' WHERE id='${h.booking_id}'`);
  const marked=resolveSession(h.booking_id,'no_show');assert.equal(marked.status,'no_show');assert.equal(marked.session_resolution,'no_show');
  assert.equal(marked.session_resolution_by,adminId);assert.ok(marked.session_resolution_at);
  assert.equal(marked.no_show_marked_by,adminId);assert.ok(marked.no_show_marked_at);
  assert.deepEqual(resolveSession(h.booking_id,'no_show'),marked);assert.equal(child(h).package_session_number,2);
  for(let i=3;i<=6;i++)assert.equal(child(h).package_session_number,i);
  assert.throws(()=>child(h),/process_sessions_exhausted/);
});
test('an authorized no-show exception releases only one entitlement even under concurrent replacement requests',async()=>{
  const h=finalized({service:'proceso'});for(let i=2;i<=6;i++)child(h);
  sql(`UPDATE public.bookings SET starts_at=now()-interval '2 hours',ends_at=now()-interval '30 minutes' WHERE id='${h.booking_id}'`);
  const missed=resolveSession(h.booking_id,'no_show');resolveSession(h.booking_id,'approve_replacement');
  assert.equal(booking(h.booking_id).status,'cancelled','release Production legacy ordinal index only after an authorized exception');
  assert.equal(booking(h.booking_id).no_show_marked_by,missed.no_show_marked_by);
  assert.equal(booking(h.booking_id).no_show_marked_at,missed.no_show_marked_at);
  const requests=[slot(),slot()].map(time=>`SELECT public.create_stripe_process_session_v1('${h.processToken}','${time}',NULL,'${hash()}','live','${account}')`);
  const results=await Promise.all(requests.map(q=>pg.run(q)));assert.equal(results.filter(r=>r.code===0).length,1);
  assert.match(results.find(r=>r.code!==0).errors,/process_sessions_exhausted/);
  assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE replaces_booking_id='${h.booking_id}'`),'1');
  assert.equal(sql(`SELECT count(DISTINCT package_session_number) FROM public.bookings WHERE process_id='${h.process_id}' AND session_resolution IS DISTINCT FROM 'replacement_approved'`),'6');
});
test('new resolution rules never apply retroactively and historical expiry remains NULL',()=>{
  assert.equal(process('10000000-0000-4000-8000-000000000001').expires_at,null);
  const h=finalized({service:'proceso'});sql(`UPDATE public.coaching_processes SET expires_at=NULL WHERE id='${h.process_id}';
    UPDATE public.bookings SET legal_terms_version='2026-10-29.2' WHERE id='${h.booking_id}'`);
  const before=booking(h.booking_id);assert.throws(()=>resolveSession(h.booking_id,'no_show'),/historical_conditions_unchanged/);
  assert.deepEqual(booking(h.booking_id),before);assert.ok(child(h).booking_id);
});

test('no resolution or past reschedule is permitted when its prerequisite is NULL or absent',()=>{
  const h=finalized(),before=booking(h.booking_id);
  for(const action of ['consume','approve_replacement'])assert.throws(()=>resolveSession(h.booking_id,action),/session_already_resolved/);
  assert.deepEqual(booking(h.booking_id),before);
  sql(`UPDATE public.bookings SET starts_at=now()-interval '2 hours',ends_at=now()-interval '30 minutes' WHERE id='${h.booking_id}'`);
  assert.throws(()=>change(h),/booking_change_not_allowed/);
  sql(`UPDATE public.bookings SET status='completed' WHERE id='${h.booking_id}'`);
});
test('individual late cancellation stays pending without effects, then reuses the same booking, Calendar and Intake',()=>{
  const h=finalized(),before=booking(h.booking_id),r=lateCancellation(h),pending=booking(h.booking_id);
  assert.equal(r.review_pending,true);assert.equal(pending.status,'confirmed');assert.equal(pending.session_resolution,'late_cancel_pending');
  assert.equal(sql(`SELECT count(*) FROM public.booking_change_jobs WHERE booking_id='${h.booking_id}'`),'0');
  assert.throws(()=>change(h),/session_decision_required/);
  resolveSession(h.booking_id,'approve_replacement');const c=change(h),after=booking(h.booking_id);
  assert.ok(c.job_id);assert.equal(after.session_resolution,'replacement_scheduled');
  for(const key of ['id','google_event_id','google_meet_url','payment_reference','paid_at','payment_expires_at','legal_terms_accepted_at'])assert.deepEqual(after[key],before[key]);
  assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id='${h.booking_id}'`),'1');
});
test('individual late cancellation consumed by Edna atomically queues the existing cancellation operation once',()=>{
  const h=finalized();lateCancellation(h);const decided=resolveSession(h.booking_id,'consume');
  assert.equal(decided.status,'cancelled');assert.equal(decided.session_resolution,'consumed');assert.equal(decided.payment_status,'paid');
  assert.equal(sql(`SELECT count(*) FROM public.booking_change_jobs WHERE booking_id='${h.booking_id}'`),'1');
  assert.deepEqual(resolveSession(h.booking_id,'consume'),decided);
  assert.equal(sql(`SELECT count(*) FROM public.booking_change_jobs WHERE booking_id='${h.booking_id}'`),'1');
});
test('a noticed individual cancellation cannot be relabeled as an absence without notice',()=>{
  const h=finalized();lateCancellation(h);
  sql(`UPDATE public.bookings SET starts_at=now()-interval '2 hours',ends_at=now()-interval '30 minutes' WHERE id='${h.booking_id}'`);
  assert.throws(()=>resolveSession(h.booking_id,'no_show'),/session_not_started/);
  assert.equal(booking(h.booking_id).session_resolution,'late_cancel_pending');
});

test('authorized individual no-show exception moves the same paid booking and preserves its original absence evidence',()=>{
  const h=finalized();sql(`UPDATE public.bookings SET starts_at=now()-interval '4 hours',ends_at=now()-interval '150 minutes' WHERE id='${h.booking_id}'`);
  const missed=resolveSession(h.booking_id,'no_show');resolveSession(h.booking_id,'approve_replacement');
  assert.ok(change(h).job_id);const after=booking(h.booking_id);
  assert.equal(after.id,missed.id);assert.equal(after.status,'confirmed');assert.equal(after.session_resolution,'replacement_scheduled');
  for(const key of ['google_event_id','google_meet_url','payment_reference','paid_at','no_show_marked_by','no_show_marked_at'])assert.deepEqual(after[key],missed[key]);
});
test('session-resolution RPC is service-only with fixed search_path and administrator authorization in PostgreSQL',()=>{
  const signature='public.resolve_stripe_session_v1(uuid,text,uuid,text,text)';
  for(const role of ['anon','authenticated'])assert.equal(sql(`SELECT has_function_privilege('${role}','${signature}','EXECUTE')`),'f');
  assert.equal(sql(`SELECT has_function_privilege('service_role','${signature}','EXECUTE')`),'t');
  assert.equal(sql(`SELECT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, pg_temp'] FROM pg_proc WHERE oid='${signature}'::regprocedure`),'t');
});
