import assert from 'node:assert/strict';
import { before, after, afterEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { localPostgres } from './helpers/local-postgres.mjs';
import { localSupabaseQuery } from './helpers/local-supabase-query.mjs';
import { testModules } from './helpers/load-typescript.mjs';
import * as ReactEmail from 'react-email';
import { render } from '@react-email/render';

const pg=localPostgres();
const migration=new URL('../supabase/migrations/20261029012540_decouple_intake_email_from_finalization.sql',import.meta.url);
const env={INTAKE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,11).toString('base64'),RESEND_FROM_EMAIL:'sender@example.test',COACH_EMAIL:'coach@example.test'};
const site='http://localhost:3000';
const rows=q=>JSON.parse(pg.sql(q)||'null');
let day=0;
before(()=>pg.start(new URL('./fixtures/stripe-local-schema.sql',import.meta.url),[
  new URL('../supabase/migrations/20261027000100_activate_booking_intake_v2.sql',import.meta.url),
  new URL('../supabase/migrations/20261028000100_stripe_test_booking_lifecycle.sql',import.meta.url),
  new URL('../supabase/migrations/20261028000200_intake_v2_stable_service_identity.sql',import.meta.url),
  new URL('../supabase/migrations/20261028201527_stripe_failed_attempt_recovery.sql',import.meta.url), migration,
]));
after(()=>pg.stop());
// Release occupancy between independent session-window scenarios in this
// isolated fixture; all assertions run before cleanup. Never a remote DB.
afterEach(()=>pg.sql("UPDATE public.bookings SET status='cancelled' WHERE status IN ('pending','confirmed')"));
function fixture({mailFailure=false,ambiguousEmail=null,reminderError=null,onReminder=null}={}) {
  const adapter=localSupabaseQuery(pg),emails=[],steps=[],wireRequests=[],accepted=new Map(),providerPhases=[];
  let ambiguous=Boolean(ambiguousEmail);
  const db={...adapter,async rpc(name,args){steps.push(args.p_step??name);
    if(ambiguousEmail==='persistence'&&ambiguous&&args.p_step==='customer_email') {
      ambiguous=false;return {data:null,error:{message:'simulated lost receipt persistence'}};
    }
    const r=await adapter.rpc(name,args);
    return name==='activate_booking_intake_v2'?{...r,data:r.data?[r.data]:null}:r;}};
  const components=Object.fromEntries(['Body','Button','Container','Head','Heading','Hr','Html','Preview','Section','Text'].map(n=>[n,n]));
  const modules=testModules({
    '@/lib/stripe/server':{getStripeBookingAdmin:()=>db,getStripeTestSiteUrl:()=>site},
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>db},
    '@/lib/google/calendar':{ensurePaidBookingCalendar:async()=>({eventId:'event-fixture',meetUrl:'https://meet.google.com/test-only',calendarUrl:'https://calendar.google.com/private-fixture'})},
    '@/lib/email/resend':{getResend:()=>({emails:{send:async(payload,options)=>{
      emails.push({payload,options});
      if(options.idempotencyKey.startsWith('intake-ready/')) {
        const formId=options.idempotencyKey.slice('intake-ready/'.length);
        const phase=rows(`SELECT to_jsonb(ready_email_error) FROM public.booking_intake_forms WHERE id='${formId}'`);
        assert.equal(phase,'reminder_delivery_pending_or_unknown','durable dispatch MUST precede every provider call');
        providerPhases.push(phase);
        if(onReminder)await onReminder();
        if(reminderError)return {data:null,error:reminderError};
      }
      if(ambiguousEmail) {
        // Mirror the installed Resend SDK's actual React→HTML conversion.
        const {react,...rest}=payload,wire={...rest,html:await render(react)};
        wireRequests.push({wire,key:options.idempotencyKey});
        const prior=accepted.get(options.idempotencyKey);
        if(prior) {
          assert.ok(JSON.stringify(wire)===JSON.stringify(prior.wire),'provider rejects a changed payload under the same key');
          return {data:{id:prior.id},error:null};
        }
        const id=`email-${accepted.size+1}`;accepted.set(options.idempotencyKey,{wire,id});
        if(ambiguousEmail==='response'&&ambiguous) {ambiguous=false;throw new Error('accepted response lost');}
        return {data:{id},error:null};
      }
      if(mailFailure)throw new Error('lost response');return {data:{id:`email-${emails.length}`},error:null};
    }}})},
    'react-email':ambiguousEmail?ReactEmail:components,
  },env);
  return {...modules.load('src/lib/bookings/finalize-paid-booking.ts'),
    ...modules.load('src/lib/intake/process-stripe-reminders.ts'),modules,db,emails,steps,wireRequests,accepted,providerPhases,stats:adapter.stats};
}
function paidBooking() {
  const id=randomUUID();day++;
  pg.sql(`INSERT INTO public.bookings(id,service_id,service_name_snapshot,duration_minutes_snapshot,session_count_snapshot,price_snapshot,currency_snapshot,
    customer_name,customer_email,starts_at,ends_at,payment_flow,payment_status,payment_provider,payment_reference,paid_at,finalization_status,next_finalization_at,payment_expires_at,booking_access_token_hash)
    SELECT '${id}',s.id,s.name,90,1,500,'MXN','Fixture','customer@example.test','2036-01-01'::timestamptz+interval '${day*2} days',
      '2036-01-01'::timestamptz+interval '${day*2} days 90 minutes','stripe','paid','stripe','pi_fixture',now(),'pending',now(),now()+interval '30 minutes','${randomBytes(32).toString('hex')}' FROM public.services s WHERE slug='sesion-1-1';`);
  return id;
}
const booking=id=>rows(`SELECT to_jsonb(b) FROM public.bookings b WHERE id='${id}'`);
const intake=id=>rows(`SELECT to_jsonb(f) FROM public.booking_intake_forms f WHERE booking_id='${id}'`);
async function complete() {const f=fixture(),id=paidBooking();assert.equal((await f.finalizePaidBooking(id)).completed,true);return {...f,id};}
const sessionIn=(id,minutes)=>pg.sql(`UPDATE public.bookings SET starts_at=clock_timestamp()+interval '${minutes} minutes',ends_at=clock_timestamp()+interval '${minutes+90} minutes' WHERE id='${id}'`);
const stopReminders=id=>pg.sql(`UPDATE public.booking_intake_forms SET status='submitted',submitted_at=now() WHERE booking_id='${id}'`);

test('real finalizer: Calendar → stable intake → ticket emails → completed, without immediate intake email',async()=>{
  const f=await complete(),b=booking(f.id),form=intake(f.id);
  assert.equal(b.finalization_status,'completed');assert.equal(b.payment_status,'paid');assert.equal(b.status,'confirmed');
  assert.equal(form.status,'active');assert.equal(form.ready_email_sent_at,null);assert.equal(b.stripe_intake_email_started_at,null);
  assert.equal(f.emails.length,2);assert.ok(f.steps.indexOf('activate_booking_intake_v2')<f.steps.indexOf('customer_email_start'));
  const customer=f.emails.find(x=>x.payload.to==='customer@example.test'),serialized=JSON.stringify(customer.payload.react);
  const token=f.modules.load('src/lib/intake/intake-token-crypto.ts').decryptIntakeToken(form.access_token_encrypted);
  assert.ok(serialized.includes('Completar formulario'));assert.ok(serialized.includes(`/formulario/${token}`));
  assert.ok(serialized.includes('Agregar a Google Calendar'));assert.equal(serialized.includes('private-fixture'),false);
  for(const text of ['Sesión 1:1',b.booking_reference,'https://meet.google.com/test-only'])assert.ok(serialized.includes(text));
  await f.finalizePaidBooking(f.id);assert.equal(f.emails.length,2);assert.deepEqual(intake(f.id),form);
});

test('confirmation email retry preserves intake and does not send a dedicated intake email',async()=>{
  const f=fixture({mailFailure:true}),id=paidBooking();await f.finalizePaidBooking(id);
  const first=intake(id);assert.equal(booking(id).finalization_status,'retryable');assert.equal(first.ready_email_sent_at,null);
  const retry=fixture();assert.equal((await retry.finalizePaidBooking(id)).completed,true);
  assert.equal(intake(id).id,first.id);assert.equal(intake(id).access_token_encrypted,first.access_token_encrypted);
  assert.equal(retry.emails.length,2);assert.equal(booking(id).stripe_intake_email_started_at,null);
});

test('session more than one hour away performs no reminder writes or sends',async()=>{
  const f=await complete();sessionIn(f.id,61);const b=booking(f.id),form=intake(f.id),n=f.emails.length;
  assert.equal((await f.processStripeIntakeReminders()).sent,0);assert.equal(f.emails.length,n);
  assert.deepEqual(booking(f.id),b);assert.deepEqual(intake(f.id),form);stopReminders(f.id);
});

test('session enters the one-hour window: reminder sends once using the stored token and key',async()=>{
  const f=await complete();sessionIn(f.id,60);
  assert.equal((await f.processStripeIntakeReminders()).sent,1);
  const form=intake(f.id),b=booking(f.id),n=f.emails.length;
  assert.ok(form.ready_email_id);assert.ok(form.ready_email_sent_at);assert.equal(form.ready_email_error,null);
  assert.equal(f.emails.at(-1).options.idempotencyKey,`intake-ready/${form.id}`);
  assert.equal((await f.processStripeIntakeReminders()).sent,0);assert.equal(f.emails.length,n);
  assert.deepEqual(intake(f.id),form);assert.deepEqual(booking(f.id),b);
});

for(const [label,change] of [
  ['submitted',"status='submitted',submitted_at=now()"],['submitted timestamp',"submitted_at=now()"],
  ['expired',"expires_at=now()-interval '1 minute'"],['revoked',"status='revoked'"],
  ['already sent',"ready_email_sent_at=now(),ready_email_id='already'"],
])test(`${label} intake never receives a reminder`,async()=>{
  const f=await complete();sessionIn(f.id,30);pg.sql(`UPDATE public.booking_intake_forms SET ${change} WHERE booking_id='${f.id}'`);
  const b=booking(f.id),form=intake(f.id),n=f.emails.length;
  assert.equal((await f.processStripeIntakeReminders()).sent,0);assert.equal(f.emails.length,n);
  assert.deepEqual(booking(f.id),b);assert.deepEqual(intake(f.id),form);
});

test('concurrent workers atomically claim one reminder, never two emails',async()=>{
  const f=await complete();sessionIn(f.id,30);const form=intake(f.id);
  const query='SELECT public.claim_stripe_intake_reminder_v1();';
  const results=await Promise.all([pg.run(`BEGIN;${query}SELECT pg_sleep(0.15);COMMIT;`),pg.run(query)]);
  assert.ok(results.every(r=>r.code===0));assert.equal(results.filter(r=>r.output.includes(form.id)).length,1);
  assert.equal(rows(query),null);assert.equal(intake(f.id).ready_email_error,'reminder_claimed_not_started');
  stopReminders(f.id);
});

test('lost email response retains one-shot evidence and never redispatches after 24h',async()=>{
  const f=await complete();sessionIn(f.id,30);const failing=fixture({mailFailure:true});
  await failing.processStripeIntakeReminders();assert.equal(failing.emails.length,1);
  assert.equal(intake(f.id).ready_email_error,'reminder_delivery_requires_review');
  pg.sql(`UPDATE public.bookings SET stripe_intake_email_started_at=now()-interval '2 days' WHERE id='${f.id}'`);
  const b=booking(f.id),form=intake(f.id);await failing.processStripeIntakeReminders();
  assert.equal(failing.emails.length,1);assert.deepEqual(booking(f.id),b);assert.deepEqual(intake(f.id),form);stopReminders(f.id);
});

test('submission between claim and send is rechecked and suppresses the reminder',async()=>{
  const f=await complete();sessionIn(f.id,30);const original=f.db.rpc;
  f.db.rpc=async(name,args)=>{const r=await original(name,args);if(name==='claim_stripe_intake_reminder_v1'&&r.data)stopReminders(f.id);return r;};
  const before=f.emails.length;await f.processStripeIntakeReminders();assert.equal(f.emails.length,before);
  assert.equal(intake(f.id).ready_email_error,null);assert.equal(booking(f.id).stripe_intake_email_started_at,null);
});

for(const [label,change] of [
  ['missing',null],['revoked',"status='revoked'"],['expired',"expires_at=now()-interval '1 minute'"],
  ['wrong source',"source_type='manual'"],['invalid hash',"access_token_hash='invalid'"],['invalid cipher',"access_token_encrypted='invalid'"],
  ['inconsistent submitted',"status='submitted',submitted_at=NULL"],
])test(`completed rejects ${label} required intake`,async()=>{
  const f=await complete();
  if(change)pg.sql(`UPDATE public.booking_intake_forms SET ${change} WHERE booking_id='${f.id}'`);
  else pg.sql(`DELETE FROM public.booking_intake_forms WHERE booking_id='${f.id}'`);
  pg.sql(`UPDATE public.bookings SET finalization_status='pending' WHERE id='${f.id}'`);
  const owner=randomUUID();pg.sql(`SELECT public.claim_stripe_finalization_v1('${f.id}','${owner}')`);
  assert.throws(()=>pg.sql(`SELECT public.save_stripe_finalization_v1('${f.id}','${owner}','completed')`),/incomplete_finalization/);
  pg.sql(`UPDATE public.bookings SET finalization_status='review_required' WHERE id='${f.id}'`);
});

test('submitted intake can complete finalization without requiring accessible tokens or ready email',async()=>{
  const f=await complete();stopReminders(f.id);
  pg.sql(`UPDATE public.booking_intake_forms SET access_token_encrypted=NULL WHERE booking_id='${f.id}';UPDATE public.bookings SET finalization_status='pending' WHERE id='${f.id}'`);
  assert.equal((await f.finalizePaidBooking(f.id)).completed,true);assert.equal(intake(f.id).ready_email_sent_at,null);
});

test('booking without intake requirement retains Calendar/email completion contract',async()=>{
  const f=await complete();
  pg.sql(`DELETE FROM public.booking_intake_forms WHERE booking_id='${f.id}';UPDATE public.bookings SET finalization_status='pending',service_id=(SELECT id FROM public.services WHERE slug='proceso') WHERE id='${f.id}'`);
  const owner=randomUUID();pg.sql(`SELECT public.claim_stripe_finalization_v1('${f.id}','${owner}')`);
  assert.equal(rows(`SELECT public.save_stripe_finalization_v1('${f.id}','${owner}','completed')`).finalization_status,'completed');
});

test('new Checkout cancel URL uses the same reference and successors keep the stored payload',()=>{
  const f=fixture(),access=f.modules.load('src/lib/stripe/access.ts'),token=access.createBookingAccess(),owner=randomUUID();day++;
  const h=rows(`SELECT public.create_stripe_booking_hold_v1('sesion-1-1','2036-01-01'::timestamptz+interval '${day*2} days','Fixture','customer@example.test',NULL,NULL,'${access.hashBookingAccess(token)}')`);
  const claim=()=>rows(`SELECT public.claim_stripe_checkout_v1('${h.booking_id}','${access.hashBookingAccess(token)}','${owner}','${site}')`);
  const first=claim();assert.equal(first.attempt.checkout_payload.cancel_url,`${site}/reservar/confirmada?ref=${first.booking.booking_reference}`);
  pg.sql(`SELECT public.begin_stripe_checkout_creation_v1('${h.booking_id}','${first.attempt.id}','${owner}');SELECT public.record_stripe_checkout_failure_v1('${h.booking_id}','${first.attempt.id}','${owner}','failed','stripe_invalid_request')`);
  const successor=claim();assert.notEqual(successor.attempt.id,first.attempt.id);
  assert.equal(successor.booking.payment_expires_at,first.booking.payment_expires_at);
  assert.equal(successor.attempt.checkout_payload.cancel_url,first.attempt.checkout_payload.cancel_url);
});

test('migration preserves rows and existing RPC signature/permissions when reapplied locally',()=>{
  const snapshot=()=>rows("SELECT jsonb_build_object('bookings',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.bookings b),'forms',(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.booking_intake_forms f))");
  const before=snapshot();const oid=pg.sql("SELECT 'public.save_stripe_finalization_v1(uuid,uuid,text,jsonb)'::regprocedure::oid");
  pg.sql(readFileSync(migration,'utf8'));assert.deepEqual(snapshot(),before);
  assert.equal(pg.sql("SELECT 'public.save_stripe_finalization_v1(uuid,uuid,text,jsonb)'::regprocedure::oid"),oid);
  for(const fn of ['save_stripe_finalization_v1(uuid,uuid,text,jsonb)','claim_stripe_intake_reminder_v1()','release_unstarted_stripe_intake_reminder_v1(uuid,timestamp with time zone)','mark_stripe_intake_reminder_dispatch_started_v1(uuid,uuid,timestamp with time zone,timestamp with time zone)','claim_stripe_checkout_v1(uuid,text,uuid,text)']) {
    assert.equal(pg.sql(`SELECT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, pg_temp'] FROM pg_proc WHERE oid='public.${fn}'::regprocedure`),'t');
    for(const role of ['anon','authenticated'])assert.equal(pg.sql(`SELECT has_function_privilege('${role}','public.${fn}','EXECUTE')`),'f');
    assert.equal(pg.sql(`SELECT has_function_privilege('service_role','public.${fn}','EXECUTE')`),'t');
  }
});

test('recent finalization and intake creation do not delay a future session already inside one hour',async()=>{
  const f=await complete();sessionIn(f.id,15);
  assert.equal((await f.processStripeIntakeReminders()).sent,1);
});

test('worker cycle runs reminder independently and a repeated cycle makes no reminder writes',async()=>{
  const f=await complete();sessionIn(f.id,30);
  const worker=f.modules.load('src/lib/stripe/process-pending.ts');
  const result=await worker.processPendingStripeBookings();assert.equal(result.remindersSent,1);
  const b=booking(f.id),form=intake(f.id),n=f.emails.length;
  const second=await worker.processPendingStripeBookings();assert.equal(second.remindersSent,0);
  assert.equal(f.emails.length,n);assert.deepEqual(booking(f.id),b);assert.deepEqual(intake(f.id),form);
});

test('our reschedule/cancel notices use revision keys and do not send a Google invitation',async()=>{
  const f=await complete(),send=f.modules.load('src/lib/email/send-booking-change-email.ts').sendBookingChangeEmail;
  assert.equal(await send(f.id,'rescheduled'),null);
  assert.match(f.emails.at(-1).payload.subject,/reprogramada/);assert.match(f.emails.at(-1).options.idempotencyKey,/rescheduled/);
  assert.ok(JSON.stringify(f.emails.at(-1).payload.react).includes('Agregar a Google Calendar'));
  assert.equal(await send(f.id,'cancelled'),null);
  const mail=f.emails.at(-1);assert.match(mail.payload.subject,/cancelada/);
  assert.equal(JSON.stringify(mail.payload.react).includes('Entrar a Google Meet'),false);
  assert.equal(JSON.stringify(mail.payload.react).includes('Agregar a Google Calendar'),false);
});

test('our change notification failure preserves the saved booking and records a safe diagnostic',async()=>{
  const f=await complete(),b=booking(f.id),failing=fixture({mailFailure:true});
  const warning=await failing.modules.load('src/lib/email/send-booking-change-email.ts').sendBookingChangeEmail(f.id,'rescheduled');
  assert.ok(warning);assert.equal(booking(f.id).integration_error,'booking_change_email_requires_review');
  for(const key of ['status','payment_status','paid_at','google_event_id','finalization_status'])assert.equal(booking(f.id)[key],b[key]);
});

for(const loss of ['response','persistence'])for(const nextStatus of ['active','submitted']) {
  test(`ambiguous principal email (${loss}), active → ${nextStatus}: exact payload survives finalization retry`,async()=>{
    const f=fixture({ambiguousEmail:loss}),id=paidBooking();
    assert.equal((await f.finalizePaidBooking(id)).completed,false);
    const before=intake(id),b=booking(id);assert.equal(b.customer_email_id,null);
    assert.equal(f.accepted.size,1);assert.equal(b.finalization_status,'retryable');
    const activate=f.modules.load('src/lib/intake/activate-booking-intake.ts').activateBookingIntake;
    const params={bookingId:id,provider:'stripe',paymentReference:b.payment_reference,siteUrl:site,sendReadyEmail:false};
    const active=await activate(params);assert.ok(active.canonicalIntakeUrl);assert.ok(active.redirectIntakeUrl===active.canonicalIntakeUrl);
    if(nextStatus==='submitted')stopReminders(id);
    const next=await activate(params);
    assert.ok(next.canonicalIntakeUrl===active.canonicalIntakeUrl,'canonical URL must remain identical');
    assert.equal(next.intakeStatus,nextStatus);
    assert.equal(next.redirectIntakeUrl===null,nextStatus==='submitted');
    assert.equal((await f.finalizePaidBooking(id)).completed,true);
    const customer=f.wireRequests.filter(r=>r.key===`booking/${id}/customer`);
    assert.equal(customer.length,2);
    const [first,retry]=customer;
    assert.ok(first.key===retry.key,'same idempotency key');
    for(const field of ['subject','to','from','html','text'])assert.ok(first.wire[field]===retry.wire[field],`${field} must be identical`);
    assert.ok(first.wire.html.includes('Completar formulario'));assert.ok(first.wire.html.includes(active.canonicalIntakeUrl));
    assert.ok(first.wire.html.includes('https://meet.google.com/test-only'));
    assert.ok(first.wire.html.includes('calendar.google.com/calendar/render'));
    assert.ok(JSON.stringify(first.wire)===JSON.stringify(retry.wire),'entire provider request must match byte-for-byte');
    assert.equal(f.accepted.size,2);assert.equal(booking(id).finalization_status,'completed');
    assert.ok(intake(id).access_token_hash===before.access_token_hash);assert.ok(intake(id).access_token_encrypted===before.access_token_encrypted);
    assert.equal(intake(id).id,before.id);assert.equal(intake(id).ready_email_sent_at,null);
  });
}

for(const minutes of [0,-15])test(`started/past session (${minutes}) never receives a reminder`,async()=>{
  const f=await complete();sessionIn(f.id,minutes);const b=booking(f.id),form=intake(f.id),n=f.emails.length;
  assert.equal((await f.processStripeIntakeReminders()).sent,0);assert.equal(f.emails.length,n);
  assert.deepEqual(booking(f.id),b);assert.deepEqual(intake(f.id),form);
});

test('cancelled session never receives a reminder even inside the hour',async()=>{
  const f=await complete();sessionIn(f.id,30);pg.sql(`UPDATE public.bookings SET status='cancelled' WHERE id='${f.id}'`);
  const b=booking(f.id),form=intake(f.id),n=f.emails.length;
  assert.equal((await f.processStripeIntakeReminders()).sent,0);assert.equal(f.emails.length,n);
  assert.deepEqual(booking(f.id),b);assert.deepEqual(intake(f.id),form);
});

test('reschedule before claim moves eligibility automatically to the current starts_at',async()=>{
  const f=await complete();sessionIn(f.id,1440);const n=f.emails.length;
  assert.equal((await f.processStripeIntakeReminders()).sent,0);
  sessionIn(f.id,2880);assert.equal((await f.processStripeIntakeReminders()).sent,0);
  assert.equal(booking(f.id).stripe_intake_email_started_at,null);assert.equal(f.emails.length,n);
  sessionIn(f.id,45);assert.equal((await f.processStripeIntakeReminders()).sent,1);
  const original=intake(f.id);sessionIn(f.id,55);assert.equal((await f.processStripeIntakeReminders()).sent,0);
  assert.equal(intake(f.id).ready_email_id,original.ready_email_id);assert.equal(f.emails.length,n+1);
});

test('an ineligible booking does not block another session inside the reminder window',async()=>{
  const future=await complete(),due=await complete();sessionIn(due.id,30);
  const before=booking(future.id),form=intake(future.id);
  assert.equal((await due.processStripeIntakeReminders()).sent,1);
  assert.equal(intake(due.id).ready_email_sent_at!==null,true);
  assert.deepEqual(booking(future.id),before);assert.deepEqual(intake(future.id),form);
});

for(const change of ["status='cancelled'","starts_at=now()-interval '1 second',ends_at=now()+interval '89 minutes'","starts_at=now()+interval '2 days',ends_at=now()+interval '2 days 90 minutes'"]) {
  test(`booking eligibility is rechecked between claim and dispatch: ${change.split('=')[0]}`,async()=>{
    const f=await complete();sessionIn(f.id,30);const original=f.db.rpc;
    f.db.rpc=async(name,args)=>{const r=await original(name,args);if(name==='claim_stripe_intake_reminder_v1'&&r.data)pg.sql(`UPDATE public.bookings SET ${change} WHERE id='${f.id}'`);return r;};
    const n=f.emails.length;await f.processStripeIntakeReminders();assert.equal(f.emails.length,n);
    if(change.includes('2 days')) {
      assert.equal(intake(f.id).ready_email_error,null);assert.equal(booking(f.id).stripe_intake_email_started_at,null);
    } else assert.equal(intake(f.id).ready_email_error,null);assert.equal(booking(f.id).stripe_intake_email_started_at,null);
  });
}

test('known unstarted reminder deferred by a concurrent reschedule is eligible again at the new session window',async()=>{
  const f=await complete();sessionIn(f.id,30);const original=f.db.rpc;let moved=false;
  f.db.rpc=async(name,args)=>{const r=await original(name,args);if(name==='claim_stripe_intake_reminder_v1'&&r.data&&!moved){moved=true;sessionIn(f.id,1440);}return r;};
  const n=f.emails.length;assert.equal((await f.processStripeIntakeReminders()).sent,0);assert.equal(f.emails.length,n);
  assert.equal(booking(f.id).stripe_intake_email_started_at,null);assert.equal(intake(f.id).ready_email_error,null);
  f.db.rpc=original;sessionIn(f.id,30);
  assert.equal((await f.processStripeIntakeReminders()).sent,1);
  assert.equal((await f.processStripeIntakeReminders()).sent,0);assert.equal(f.emails.length,n+1);
});

test('stale release cannot clear a newer reminder claim, and ambiguous sends never invoke release',async()=>{
  const f=await complete();sessionIn(f.id,30);
  const first=rows('SELECT public.claim_stripe_intake_reminder_v1()');sessionIn(f.id,1440);
  const release=stamp=>rows(`SELECT to_jsonb(public.release_unstarted_stripe_intake_reminder_v1('${f.id}','${stamp}'))`);
  assert.equal(release(first.claim_started_at),true);sessionIn(f.id,30);
  const second=rows('SELECT public.claim_stripe_intake_reminder_v1()');assert.notEqual(second.claim_started_at,first.claim_started_at);
  sessionIn(f.id,1440);assert.equal(release(first.claim_started_at),false);
  assert.equal(release(second.claim_started_at),true);sessionIn(f.id,30);
  const failing=fixture({mailFailure:true});await failing.processStripeIntakeReminders();
  assert.equal(failing.emails.length,1);
  assert.equal(failing.stats.rpcs.some(r=>r.fn==='release_unstarted_stripe_intake_reminder_v1'),false);
  sessionIn(f.id,1440);
  const marker=booking(f.id).stripe_intake_email_started_at;
  assert.equal(release(marker),false);assert.equal(intake(f.id).ready_email_error,'reminder_delivery_requires_review');
});

test('missing canonical access after an ambiguous principal email requires review without changing the request',async()=>{
  const f=fixture({ambiguousEmail:'persistence'}),id=paidBooking();await f.finalizePaidBooking(id);
  stopReminders(id);pg.sql(`UPDATE public.booking_intake_forms SET access_token_encrypted=NULL WHERE booking_id='${id}'`);
  assert.equal((await f.finalizePaidBooking(id)).completed,false);
  assert.equal(booking(id).finalization_status,'review_required');assert.equal(f.wireRequests.length,1);
});

test('two actual worker invocations dispatch at most one reminder',async()=>{
  const f=await complete();sessionIn(f.id,30);const other=fixture(),n=f.emails.length;
  const results=await Promise.all([f.processStripeIntakeReminders(),other.processStripeIntakeReminders()]);
  assert.equal(results.reduce((sum,r)=>sum+r.sent,0),1);
  assert.equal(f.emails.length-n+other.emails.length,1);assert.ok(intake(f.id).ready_email_sent_at);
});

for(const loss of ['returned error','thrown response','non-boolean response'])test(`lost dispatch confirmation (${loss}) never calls Resend or release`,async()=>{
  const f=await complete();sessionIn(f.id,30);const original=f.db.rpc;
  f.db.rpc=async(name,args)=>{
    const r=await original(name,args);
    if(name==='mark_stripe_intake_reminder_dispatch_started_v1'&&r.data===true) {
      if(loss==='thrown response')throw new Error('response lost after commit');
      return loss==='returned error'?{data:null,error:{message:'response lost'}}:{data:'true',error:null};
    }
    return r;
  };
  const n=f.emails.length;
  await assert.rejects(f.processStripeIntakeReminders());
  const b=booking(f.id),form=intake(f.id);
  assert.equal(f.emails.length,n);assert.equal(form.ready_email_error,'reminder_delivery_pending_or_unknown');
  assert.ok(b.stripe_intake_email_started_at);
  assert.equal(f.stats.rpcs.some(x=>x.fn==='release_unstarted_stripe_intake_reminder_v1'),false);
  f.db.rpc=original;assert.equal((await f.processStripeIntakeReminders()).sent,0);
  assert.deepEqual(booking(f.id),b);assert.deepEqual(intake(f.id),form);
});

test('accepted reminder with lost receipt persistence remains unknown and cannot release after rescheduling',async()=>{
  const f=await complete();sessionIn(f.id,30);
  const original=f.db.from;
  f.db.from=table=>{
    const q=original(table),update=q.update;
    q.update=data=>{
      if(table==='booking_intake_forms'&&data.ready_email_id) {
        const rejected={eq(){return rejected;},is:async()=>({error:{message:'simulated lost persistence'}})};
        return rejected;
      }
      return update(data);
    };
    return q;
  };
  const n=f.emails.length;
  await assert.rejects(f.processStripeIntakeReminders(),/storage_requires_review/);
  const form=intake(f.id),marker=booking(f.id).stripe_intake_email_started_at;
  assert.equal(f.emails.length,n+1);assert.equal(f.providerPhases.length,1);
  assert.equal(form.ready_email_id,null);assert.equal(form.ready_email_sent_at,null);
  assert.equal(form.ready_email_error,'reminder_delivery_pending_or_unknown');
  sessionIn(f.id,1440);
  assert.equal(rows(`SELECT to_jsonb(public.release_unstarted_stripe_intake_reminder_v1('${f.id}','${marker}'))`),false);
  assert.equal(rows('SELECT public.claim_stripe_intake_reminder_v1()'),null);
  sessionIn(f.id,30);f.db.from=original;
  assert.equal((await f.processStripeIntakeReminders()).sent,0);assert.equal(f.emails.length,n+1);
  assert.equal(booking(f.id).stripe_intake_email_started_at,marker);assert.deepEqual(intake(f.id),form);
});

for(const [status,code] of [[400,'reminder_delivery_rejected'],[500,'reminder_delivery_requires_review']])test(`provider HTTP ${status} is terminal without automatic retry`,async()=>{
  const f=fixture({reminderError:{statusCode:status,name:'fixture_provider_error',message:'fixture'}}),id=paidBooking();
  assert.equal((await f.finalizePaidBooking(id)).completed,true);sessionIn(id,30);
  const n=f.emails.length;assert.equal((await f.processStripeIntakeReminders()).sent,0);
  assert.equal(f.emails.length,n+1);assert.equal(intake(id).ready_email_error,code);
  const marker=booking(id).stripe_intake_email_started_at;
  assert.equal(rows(`SELECT to_jsonb(public.release_unstarted_stripe_intake_reminder_v1('${id}','${marker}'))`),false);
  assert.equal((await f.processStripeIntakeReminders()).sent,0);assert.equal(f.emails.length,n+1);
});

for(const change of ['submitted','rescheduled','cancelled'])test(`${change} after durable dispatch allows only the single reminder already in flight`,async()=>{
  let id;
  const f=fixture({onReminder:()=>{
    if(change==='submitted')stopReminders(id);
    else if(change==='rescheduled')sessionIn(id,1440);
    else pg.sql(`UPDATE public.bookings SET status='cancelled' WHERE id='${id}'`);
  }});
  id=paidBooking();assert.equal((await f.finalizePaidBooking(id)).completed,true);sessionIn(id,30);
  const n=f.emails.length;assert.equal((await f.processStripeIntakeReminders()).sent,1);
  assert.equal(f.emails.length,n+1);assert.ok(intake(id).ready_email_sent_at);
  assert.equal((await f.processStripeIntakeReminders()).sent,0);assert.equal(f.emails.length,n+1);
});
