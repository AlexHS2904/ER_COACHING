import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {localPostgres} from './helpers/local-postgres.mjs';
import {liveFixture,liveMigrations} from './helpers/stripe-live-postgres.mjs';
const pg=localPostgres(),sql=s=>pg.sql(s),json=s=>JSON.parse(sql(s)||'null');
const migration=new URL('../supabase/migrations/20261104212623_dynamic_services_publication_and_intake.sql',import.meta.url);
const hash=()=>randomBytes(32).toString('hex'),q=v=>v==null?'NULL':`'${String(v).replaceAll("'","''")}'`,j=v=>q(JSON.stringify(v))+'::jsonb';
const account='acct_fixture',origin='https://www.ednarojocoaching.com',admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const enc='A'.repeat(16)+'.'+'B'.repeat(22)+'.'+'C'.repeat(86);
const legal={termsAccepted:true,ageConfirmed:true,termsVersion:'2026-10-31.1',privacyNoticeVersion:'2026-10-29.2'};
let day=0;const slot=()=>{const n=day++;return `${new Date(Date.now()+86400000*(2+Math.floor(n/4))).toISOString().slice(0,10)}T${12+2*(n%4)}:00:00Z`;};
const booking=id=>json(`SELECT to_jsonb(b) FROM public.bookings b WHERE id=${q(id)}`);
const serviceId=slug=>sql(`SELECT id FROM public.services WHERE slug=${q(slug)}`);
let historical,oldPackage,oldSingle,oldBound,shape,bookingArguments,bookingResult,availabilityAccess;
const historySql=`SELECT jsonb_build_object('bookings',(SELECT jsonb_agg(to_jsonb(b)-'requires_intake_snapshot' ORDER BY b.id) FROM public.bookings b),
'processes',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.coaching_processes p),
'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.booking_payment_attempts a),
'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.stripe_event_id) FROM public.stripe_events e),
'intakes',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public.booking_intake_forms f))`;
function hold({slug='sesion-1-1',token=hash(),processToken=hash(),time=slot(),adminId=null,mode='live',site=origin,acceptance=legal,legacy=false}={}) {
 const entry=legacy?'create_stripe_booking_hold_with_legal_v2':'create_stripe_booking_hold_with_legal_v3';
 const id=legacy?slug:serviceId(slug);
 const r=json(`SELECT public.${entry}(${q(id)},${q(time)},'Fixture','fixture@example.test',NULL,NULL,${q(token)},${j(acceptance)},${q(mode)},${q(account)},${q(site)},${q(processToken)},${q(enc)}${legacy?'':','+q(adminId)})`);
 return {...r,token,processToken,time};
}
function bound(h) {
 const owner=randomUUID(),r=json(`SELECT public.claim_stripe_checkout_v2('${h.booking_id}','${h.token}','${owner}','${origin}','live','${account}','pmc_fixture')`),session='cs_live_'+randomUUID().replaceAll('-','');
 sql(`SELECT public.begin_stripe_checkout_creation_v2('${h.booking_id}','${r.attempt.id}','${owner}','live','${account}');SELECT public.save_stripe_checkout_v2('${h.booking_id}','${r.attempt.id}','${owner}','${session}',to_timestamp(${r.attempt.checkout_payload.expires_at}),'live','${account}')`);
 return {...h,...r,owner,session};
}
function pay(a,event='evt_'+randomUUID(),changes={}) {
 const metadata=a.attempt.checkout_payload.metadata,intent='pi_'+a.attempt.id.replaceAll('-','');
 const receipt={id:a.session,livemode:true,mode:'payment',status:'complete',payment_status:'paid',amount_total:Number(a.attempt.amount_minor),currency:'mxn',payment_intent:intent,client_reference_id:a.booking_id,metadata,payment_method_types:['card'],verified_payment_intent:{id:intent,status:'succeeded',amount:Number(a.attempt.amount_minor),amount_received:Number(a.attempt.amount_minor),currency:'mxn',livemode:true,metadata},...changes};
 return json(`SELECT public.apply_stripe_checkout_event_v2(${q(event)},'checkout.session.completed',${j(receipt)},'live','${account}')`);
}
const requires=id=>sql(`SELECT public.booking_requires_intake_v1(${q(id)})`)==='t';
const activate=id=>json(`SELECT to_jsonb(f) FROM public.activate_stripe_intake_v1('${id}','live','${account}','${hash()}','${enc}') f`);
function steps(id) {
 const owner=randomUUID();sql(`SELECT public.claim_stripe_finalization_v2('${id}','${owner}','live','${account}')`);
 const save=(step,data={})=>json(`SELECT public.save_stripe_finalization_v2('${id}','${owner}',${q(step)},${j(data)},'live','${account}')`);
 save('calendar',{eventId:'event_'+randomUUID(),meetUrl:'https://meet.google.com/fixture'});save('customer_email',{id:'customer_fixture'});save('coach_email',{id:'coach_fixture'});return save;
}
before(()=>{
 pg.start(liveFixture,liveMigrations);
 // Exercise the installed Production result shape and a scheduling body that
 // actually calls availability; the small shared fixture does neither.
 sql(`DROP FUNCTION public.get_available_slots(text,date);
 CREATE FUNCTION public.get_available_slots(p_service_slug text,p_date date)
 RETURNS TABLE(starts_at timestamptz,ends_at timestamptz,local_time text) LANGUAGE sql AS $$
 SELECT p_date::timestamptz+make_interval(hours=>hour),
 p_date::timestamptz+make_interval(hours=>hour,mins=>s.duration_minutes),hour::text||':00'
 FROM public.services s CROSS JOIN generate_series(12,18,2) hour WHERE s.slug=p_service_slug
 AND NOT EXISTS(SELECT 1 FROM public.bookings b WHERE b.status IN ('pending','confirmed')
 AND tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(p_date::timestamptz+make_interval(hours=>hour),
 p_date::timestamptz+make_interval(hours=>hour,mins=>s.duration_minutes),'[)')); $$;`);
 const base=sql("SELECT pg_get_functiondef('public.create_booking(text,timestamptz,text,text,text,text)'::regprocedure)");
 assert.ok(base.includes('  INSERT INTO public.bookings'));
 assert.ok(base.includes('p_customer_phone text, p_notes text)'));
 sql(base.replace('p_customer_phone text, p_notes text)',
 'p_customer_phone text DEFAULT NULL,p_notes text DEFAULT NULL)').replace('  INSERT INTO public.bookings',`  IF NOT EXISTS(SELECT 1 FROM public.get_available_slots(p_service_slug,p_starts_at::date) x
 WHERE x.starts_at=p_starts_at) THEN RAISE EXCEPTION 'slot_conflict'; END IF;
  INSERT INTO public.bookings`));
 // Match the remote contract before migration, while leaving permissive
 // default privileges in place for newly created functions.
 sql('REVOKE ALL ON FUNCTION public.get_available_slots(text,date) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.get_available_slots(text,date) TO service_role;');
 bookingArguments=sql("SELECT pg_get_function_arguments('public.create_booking(text,timestamptz,text,text,text,text)'::regprocedure)");
 bookingResult=sql("SELECT pg_get_function_result('public.create_booking(text,timestamptz,text,text,text,text)'::regprocedure)");
 availabilityAccess=json(`SELECT jsonb_object_agg(r.name,has_function_privilege(r.name,'public.get_available_slots(text,date)','EXECUTE'))
 FROM (VALUES ('anon'),('authenticated'),('service_role')) r(name)`);
 sql('GRANT SELECT ON public.services TO anon,authenticated;');
 oldPackage=hold({slug:'proceso',legacy:true});oldBound=bound(oldPackage);pay(oldBound);activate(oldPackage.booking_id);
 oldSingle=hold({legacy:true});
 historical=json(historySql);shape=sql("SELECT pg_get_function_result('public.get_available_slots(text,date)'::regprocedure)");
 sql(readFileSync(migration,'utf8'));
 sql("INSERT INTO public.services(slug,name,service_type,duration_minutes,session_count,price,currency,published) VALUES('technical-private','Private fixture','single',90,1,10,'MXN',false),('dynamic-public','Dynamic fixture','single',90,1,100,'MXN',true); INSERT INTO public.admin_users VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false)");
});after(()=>pg.stop());

test('application preserves every historic booking, process, attempt, event and intake field',()=>{
 const now=json(historySql);for(const [group,rows] of Object.entries(historical))assert.deepEqual(now[group],rows);
 assert.equal(booking(oldSingle.booking_id).requires_intake_snapshot,null);assert.equal(booking(oldPackage.booking_id).requires_intake_snapshot,null);
 assert.equal(requires(oldSingle.booking_id),true);assert.equal(requires(oldPackage.booking_id),true);
 assert.equal(sql("SELECT count(*) FROM public.services WHERE requires_intake"),'1');
});
test('existing v2 hold retry preserves its old fingerprint, identity and deadline exactly',()=>{
 const before=booking(oldSingle.booking_id),again=hold({legacy:true,token:oldSingle.token,time:oldSingle.time});assert.equal(again.booking_id,oldSingle.booking_id);assert.deepEqual(booking(again.booking_id),before);
});
test('publication RLS hides active private services from anon and normal authenticated users',()=>{
 for(const role of ['anon','authenticated'])assert.equal(sql(`SET ROLE ${role};SELECT count(*) FROM public.services WHERE slug='technical-private';RESET ROLE`),'0');
 for(const role of ['anon','authenticated'])assert.equal(sql(`SET ROLE ${role};SELECT count(*) FROM public.services WHERE slug='dynamic-public';RESET ROLE`),'1');
});
test('public availability preserves its installed result shape and never exposes hidden or inactive services',()=>{
 assert.equal(sql("SELECT pg_get_function_result('public.get_available_slots(text,date)'::regprocedure)"),shape);
 assert.equal(sql("SELECT count(*) FROM public.get_available_slots('technical-private',(now()+interval '50 days')::date)"),'0');
 sql("UPDATE public.services SET active=false WHERE slug='dynamic-public'");
 try{assert.equal(sql("SELECT count(*) FROM public.get_available_slots('dynamic-public',(now()+interval '50 days')::date)"),'0');}finally{sql("UPDATE public.services SET active=true WHERE slug='dynamic-public'");}
});
test('availability preserves service-role-only access despite permissive function default privileges',()=>{
 const access=json(`SELECT jsonb_object_agg(r.name,has_function_privilege(r.name,'public.get_available_slots(text,date)','EXECUTE'))
 FROM (VALUES ('anon'),('authenticated'),('service_role')) r(name)`);
 assert.deepEqual(access,availabilityAccess);
 assert.deepEqual(access,{anon:false,authenticated:false,service_role:true});
 assert.equal(sql(`SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 WHERE p.oid='public.get_available_slots(text,date)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')`),'f');
 for(const role of ['anon','authenticated'])assert.throws(()=>sql(`SET ROLE ${role};SELECT * FROM public.get_available_slots('dynamic-public',(now()+interval '50 days')::date)`),/permission denied/);
 assert.ok(Number(sql("SET ROLE service_role; SELECT count(*) FROM public.get_available_slots('dynamic-public',(now()+interval '50 days')::date)"))>0);
});
test('create_booking preserves its exact six-argument contract and both optional NULL defaults',()=>{
 assert.equal(sql("SELECT pg_get_function_arguments('public.create_booking(text,timestamptz,text,text,text,text)'::regprocedure)"),bookingArguments);
 assert.equal(sql("SELECT pg_get_function_result('public.create_booking(text,timestamptz,text,text,text,text)'::regprocedure)"),bookingResult);
 assert.equal(sql("SELECT pronargdefaults FROM pg_proc WHERE oid='public.create_booking(text,timestamptz,text,text,text,text)'::regprocedure"),'2');
 for(const args of [[],['fixture phone'],['fixture phone','fixture notes']]){
  const time=slot();
  const row=json(`BEGIN;SET LOCAL ROLE service_role;
  DO $test$ BEGIN PERFORM * FROM public.create_booking('dynamic-public',${q(time)},'Fixture','fixture@example.test'${args.map(v=>','+q(v)).join('')}); END $test$;
  RESET ROLE;
  SELECT to_jsonb(b) FROM public.bookings b WHERE b.starts_at=${q(time)} AND b.service_id=${q(serviceId('dynamic-public'))};ROLLBACK;`);
  assert.equal(row.customer_phone,args[0]??null);assert.equal(row.notes,args[1]??null);
  assert.equal(row.status,'pending');assert.equal(row.payment_status,'pending');
  assert.equal(Number(row.price_snapshot),100);assert.equal(row.google_event_id,null);
 }
});
test('private availability requires an active admin and is not callable by public roles',()=>{
 const id=serviceId('technical-private');
 assert.ok(Number(sql(`SELECT count(*) FROM public.get_admin_available_slots_v1('${id}',(now()+interval '50 days')::date,'${admin}')`))>0);
 for(const who of [null,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',randomUUID()])assert.throws(()=>sql(`SELECT * FROM public.get_admin_available_slots_v1('${id}',current_date,${q(who)})`),/admin_required/);
 for(const role of ['anon','authenticated'])assert.throws(()=>sql(`SET ROLE ${role};SELECT * FROM public.get_admin_available_slots_v1('${id}',current_date,'${admin}')`),/permission denied/);
});
test('hidden holds fail without active admin, Live mode and canonical origin; legacy entrypoints cannot opt in',()=>{
 const before=sql('SELECT count(*) FROM public.bookings');
 for(const opts of [{},{adminId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},{adminId:admin,mode:'test',site:'http://localhost:3000'},{adminId:admin,site:'https://foreign.example'}])assert.throws(()=>hold({slug:'technical-private',...opts}),/service_unavailable|invalid_site_origin/);
 assert.throws(()=>hold({slug:'technical-private',legacy:true}),/service_unavailable/);
 assert.throws(()=>sql("SELECT * FROM public.create_booking('technical-private',now()+interval '40 days','Fixture','fixture@example.test',NULL,NULL)"),/service_unavailable/);
 assert.equal(sql('SELECT count(*) FROM public.bookings'),before);
});
test('authorized private $10 hold freezes trusted server amount and false Intake without financial side effects',()=>{
 const h=hold({slug:'technical-private',adminId:admin}),b=booking(h.booking_id);assert.equal(Number(b.price_snapshot),10);assert.equal(b.requires_intake_snapshot,false);assert.equal(requires(b.id),false);
 assert.equal(b.status,'pending');assert.equal(b.payment_status,'pending');assert.equal(b.process_id,null);assert.equal(Date.parse(b.payment_expires_at)-Date.parse(b.created_at),1800000);
 for(const k of ['paid_at','payment_reference','google_event_id','google_meet_url','customer_email_id','coach_email_id'])assert.equal(b[k],null);
 assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id='${b.id}'`),'0');
 assert.throws(()=>sql(`SELECT public.claim_stripe_finalization_v2('${b.id}','${randomUUID()}','live','${account}')`),/stripe_payment_required/);
});
test('dynamic public singles have independent server price snapshots; unsupported service shapes fail closed',()=>{
 const h=hold({slug:'dynamic-public'});assert.equal(Number(booking(h.booking_id).price_snapshot),100);assert.equal(requires(h.booking_id),false);
 for(const [column,value] of [['price','NULL'],['currency',"'USD'"],['session_count','2'],['active','false'],['booking_enabled','false'],['requires_quote','true']]){
  sql(`UPDATE public.services SET ${column}=${value} WHERE slug='dynamic-public'`);try{assert.throws(()=>hold({slug:'dynamic-public'}),/service_unavailable/);}finally{sql("UPDATE public.services SET price=100,currency='MXN',session_count=1,active=true,booking_enabled=true,requires_quote=false WHERE slug='dynamic-public'");}
 }
});
test('legal rejection atomically creates no booking, process or legal evidence',()=>{
 const before=sql('SELECT count(*) FROM public.bookings'),processes=sql('SELECT count(*) FROM public.coaching_processes');
 assert.throws(()=>hold({slug:'proceso',acceptance:{...legal,ageConfirmed:false}}),/legal_acceptance_required/);assert.equal(sql('SELECT count(*) FROM public.bookings'),before);assert.equal(sql('SELECT count(*) FROM public.coaching_processes'),processes);
});
test('only core service may opt into Intake; all new compatibility holds also snapshot explicit eligibility',()=>{
 assert.throws(()=>sql("UPDATE public.services SET requires_intake=true WHERE slug='dynamic-public'"),/services_intake_core_only/);
 const one=hold({legacy:true}),pack=hold({slug:'proceso',legacy:true});assert.equal(booking(one.booking_id).requires_intake_snapshot,true);assert.equal(booking(pack.booking_id).requires_intake_snapshot,false);
});
test('a no-Intake dynamic service completes only after verified payment and applicable finalization',()=>{
 const a=bound(hold({slug:'technical-private',adminId:admin}));assert.equal(Number(a.attempt.amount_minor),1000);
 assert.equal(pay(a).accepted,true);const save=steps(a.booking_id);assert.equal(save('completed').finalization_status,'completed');
 assert.throws(()=>activate(a.booking_id),/intake_ineligible/);assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id='${a.booking_id}'`),'0');
});
test('core snapshot remains mandatory after catalog flag/visibility/archive changes; active or submitted Intake is valid',()=>{
 const a=bound(hold());pay(a);const save=steps(a.booking_id);assert.throws(()=>save('completed'),/incomplete_finalization/);
 sql("UPDATE public.services SET requires_intake=false,published=false,active=false WHERE slug='sesion-1-1'");
 try {assert.equal(requires(a.booking_id),true);const f=activate(a.booking_id);assert.equal(save('completed').finalization_status,'completed');
  const owner=randomUUID();sql(`UPDATE public.bookings SET finalization_status='processing',finalization_owner='${owner}',finalization_lease_until=now()+interval '2 minutes' WHERE id='${a.booking_id}';UPDATE public.booking_intake_forms SET status='submitted',submitted_at=now() WHERE id='${f.form_id}'`);
  assert.equal(json(`SELECT public.save_stripe_finalization_v2('${a.booking_id}','${owner}','completed','{}','live','${account}')`).finalization_status,'completed');
 }finally{sql("UPDATE public.services SET requires_intake=true,published=true,active=true WHERE slug='sesion-1-1'");}
});
for(const status of ['revoked','expired'])test(`core ${status} Intake cannot complete finalization`,()=>{
 const a=bound(hold());pay(a);const f=activate(a.booking_id),save=steps(a.booking_id);sql(`UPDATE public.booking_intake_forms SET status='${status}' WHERE id='${f.form_id}'`);assert.throws(()=>save('completed'),/incomplete_finalization/);
});
test('new six-session package has no Intake; children inherit snapshot, six-session limit and 90-day expiry',()=>{
 const h=hold({slug:'proceso'}),a=bound(h);pay(a);assert.equal(requires(h.booking_id),false);assert.throws(()=>activate(h.booking_id),/intake_ineligible/);
 const cp=json(`SELECT to_jsonb(p) FROM public.coaching_processes p WHERE id='${h.process_id}'`);assert.equal(Date.parse(cp.expires_at)-Date.parse(cp.activated_at),90*86400000);
 sql("UPDATE public.services SET published=false WHERE slug='proceso'");
 try{for(let n=2;n<=6;n++){
  const token=hash(),time=slot(),statement=`SELECT public.create_stripe_process_session_v1('${h.processToken}','${time}',NULL,'${token}','live','${account}')`;
  const c=json(statement),before=booking(c.booking_id);assert.equal(c.package_session_number,n);assert.equal(before.requires_intake_snapshot,false);assert.equal(requires(c.booking_id),false);assert.equal(json(statement).booking_id,c.booking_id);assert.deepEqual(booking(c.booking_id),before);
 }
 assert.throws(()=>sql(`SELECT public.create_stripe_process_session_v1('${h.processToken}','${slot()}',NULL,'${hash()}','live','${account}')`),/process_sessions_exhausted/);
 }finally{sql("UPDATE public.services SET published=true WHERE slug='proceso'");}
 assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE process_id='${h.process_id}'`),'6');assert.equal(steps(h.booking_id)('completed').finalization_status,'completed');
});
test('historical package shared Intake is reused without token rotation; children retain NULL fallback',()=>{
 const original=activate(oldPackage.booking_id),c=json(`SELECT public.create_stripe_process_session_v1('${oldPackage.processToken}','${slot()}',NULL,'${hash()}','live','${account}')`);
 assert.equal(booking(c.booking_id).requires_intake_snapshot,null);assert.equal(requires(c.booking_id),true);assert.equal(activate(c.booking_id).form_id,original.form_id);
});
test('accidental form for an opt-out booking cannot save answers, activate Intake or claim a reminder',()=>{
 const a=bound(hold({slug:'dynamic-public'}));pay(a);steps(a.booking_id)('completed');
 const token=hash(),form=randomUUID();
 sql(`INSERT INTO public.booking_intake_forms(id,booking_id,source_type,status,access_token_hash,access_token_encrypted,expires_at)
 VALUES('${form}','${a.booking_id}','booking','active','${token}','${enc}',now()+interval '1 day');
 UPDATE public.bookings SET starts_at=now()+interval '59 minutes',ends_at=now()+interval '149 minutes' WHERE id='${a.booking_id}'`);
 const before=json(`SELECT to_jsonb(f) FROM public.booking_intake_forms f WHERE id='${form}'`);
 assert.equal(json(`SELECT public.save_intake_with_legal_consent_v1('${form}','${token}','{"age":30}',1,false,'2026-10-29.2',true)`).error_code,'booking_unavailable');
 assert.throws(()=>sql(`SELECT * FROM public.activate_booking_intake_v2('${a.booking_id}','${token}','${enc}','stripe','unused')`),/solo aplica/);
 assert.equal(json(`SELECT public.claim_stripe_intake_reminder_v2('live','${account}')`),null);
 assert.equal(json(`SELECT public.claim_stripe_intake_reminder_v1()`),null);
 assert.deepEqual(json(`SELECT to_jsonb(f) FROM public.booking_intake_forms f WHERE id='${form}'`),before);
});
test('manipulated payment amount grants no entitlement; matching dynamic payment remains idempotent',()=>{
 const bad=bound(hold({slug:'dynamic-public'}));assert.equal(pay(bad,undefined,{amount_total:1}).accepted,false);assert.equal(booking(bad.booking_id).payment_status,'pending');
 const a=bound(hold({slug:'dynamic-public'})),event='evt_'+randomUUID();pay(a,event);const before=booking(a.booking_id);assert.equal(pay(a,event).duplicate,true);assert.deepEqual(booking(a.booking_id),before);
});
test('concurrent identical private hold creates exactly one booking with unchanged deadline',async()=>{
 const token=hash(),time=slot(),id=serviceId('technical-private'),statement=`SELECT public.create_stripe_booking_hold_with_legal_v3('${id}','${time}','Fixture','fixture@example.test',NULL,NULL,'${token}',${j(legal)},'live','${account}','${origin}',NULL,NULL,'${admin}')`;
 const results=await Promise.all([pg.run(statement),pg.run(statement)]);assert.ok(results.every(r=>r.code===0),results.map(r=>r.errors).join('\n'));const [a,b]=results.map(r=>JSON.parse(r.output));assert.deepEqual(a,b);assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE booking_access_token_hash='${token}'`),'1');
});
test('sensitive RPC ACLs deny browser roles, internal bases deny service_role, and security paths are fixed',()=>{
 const names=['booking_requires_intake_v1','get_admin_available_slots_v1','create_stripe_booking_hold_with_legal_v3','activate_stripe_intake_v1','save_stripe_finalization_v1','save_stripe_finalization_v2'];
 const rows=json(`SELECT jsonb_agg(jsonb_build_object('name',p.proname,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'auth',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'path',p.proconfig)) FROM pg_proc p WHERE pronamespace='public'::regnamespace AND proname IN (${names.map(q).join(',')})`);
 assert.equal(rows.length,names.length);for(const r of rows){assert.equal(r.anon,false);assert.equal(r.auth,false);assert.equal(r.service,true);assert.equal(r.owner,'postgres');assert.equal(r.definer,true);assert.ok(r.path.includes('search_path=pg_catalog, pg_temp'));}
 for(const signature of ['dynamic_available_slots_base_v1(text,date)','dynamic_create_booking_base_v1(text,timestamptz,text,text,text,text)'])for(const role of ['anon','authenticated','service_role'])assert.equal(sql(`SELECT has_function_privilege('${role}','public.${signature}','EXECUTE')`),'f');
});
