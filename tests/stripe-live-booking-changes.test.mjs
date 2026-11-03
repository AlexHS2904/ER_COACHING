import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';
import { stripeRuntimeFixture } from './helpers/stripe-runtime-fixture.mjs';

function fixture(options={}) {
  const calls=[],payloads=[];
  let job={id:'job-fixture',stripe_mode:'test',stripe_account_id:'acct_fixture',change_kind:'rescheduled',
    calendar_completed_at:null,email_started_at:null,email_id:null,status:'pending',
    booking_snapshot:{id:'booking-fixture',booking_reference:'REFERENCE',google_event_id:'same-event',
      starts_at:'2035-01-02T12:00:00Z',ends_at:'2035-01-02T13:30:00Z',google_meet_url:'https://meet.google.com/fixture',
      customer_name:'Fixture',customer_email:'customer@example.test',service_name_snapshot:'Package',duration_minutes_snapshot:90,
      session_count_snapshot:6,price_snapshot:'2500',currency_snapshot:'MXN',process_id:'process-fixture',package_session_number:2},...options.job};
  let failedCalendar=false,failedEmail=false;
  const db={rpc:async(name,args)=>{
    if(name==='request_stripe_booking_change_v1')return {data:{job_id:job.id,status:job.status},error:null};
    if(name==='claim_stripe_booking_change_v1') {
      assert.equal(args.p_stripe_mode,'test');assert.equal(args.p_stripe_account_id,'acct_fixture');
      return {data:job.status==='completed'?{claimed:false}:{claimed:true,job:structuredClone(job)},error:null};
    }
    assert.equal(name,'save_stripe_booking_change_v1');calls.push(args.p_action);
    if(args.p_action==='calendar_completed')job.calendar_completed_at='2030-01-01';
    if(args.p_action==='email_started')job.email_started_at??=new Date().toISOString();
    if(args.p_action==='email_sent')job.email_id=args.p_payload.id;
    if(['completed','retryable','review_required'].includes(args.p_action))job.status=args.p_action;
    return {data:structuredClone(job),error:null};
  }};
  const modules=testModules({
    '@/lib/stripe/server':stripeRuntimeFixture(db),
    '@/lib/google/calendar':{
      updateGoogleCalendarEvent:async payload=>{calls.push('calendar');assert.equal(payload.eventId,'same-event');
        if(options.failCalendar&&!failedCalendar){failedCalendar=true;throw new Error('temporary');}},
      deleteGoogleCalendarEvent:async id=>{calls.push('delete');assert.equal(id,'same-event');if(options.deletedAlready)throw {response:{status:404}};},
    },
    '@/lib/email/send-booking-emails':{sendBookingEmails:async payload=>{calls.push('email');payloads.push(payload);
      if(options.failEmail&&!failedEmail){failedEmail=true;throw new Error('response lost');}
      return {customer:{id:'same-receipt',error:null}};}},
  });
  return {...modules.load('src/lib/bookings/stripe-booking-changes.ts'),calls,payloads,get job(){return job;}};
}
test('a saved reschedule survives Calendar outage; recovery patches the same event before our one customer notice',async()=>{
  const f=fixture({failCalendar:true});
  const saved=await f.requestStripeBookingChange('booking-fixture','rescheduled','2035-01-02T12:00:00Z');
  assert.equal(saved.ok,true);assert.equal(saved.changeCompleted,false);assert.equal(f.job.status,'retryable');assert.equal(f.payloads.length,0);
  assert.equal((await f.processStripeBookingChange()).completed,true);
  assert.equal(f.job.email_id,'same-receipt');assert.equal(f.payloads[0].changeRevision,'job-fixture');
  assert.equal(f.payloads[0].notice,'rescheduled');assert.equal(f.payloads[0].priceTextOverride,'Incluido en tu proceso');
  assert.ok(f.calls.indexOf('calendar_completed')<f.calls.indexOf('email'));
  await f.processStripeBookingChange();assert.equal(f.payloads.length,1);
});
test('a lost email response reuses the immutable payload/key and never repeats Calendar',async()=>{
  const f=fixture({failEmail:true});await f.processStripeBookingChange();await f.processStripeBookingChange();
  assert.equal(f.calls.filter(x=>x==='calendar').length,1);assert.equal(f.payloads.length,2);
  assert.deepEqual(f.payloads[0],f.payloads[1]);assert.equal(f.job.status,'completed');
});
test('ambiguous email outside provider idempotency window requires review, never sends a new notice',async()=>{
  const f=fixture({job:{calendar_completed_at:'2030-01-01',email_started_at:'2000-01-01'}});
  await f.processStripeBookingChange();assert.equal(f.job.status,'review_required');assert.equal(f.payloads.length,0);
});
test('cancellation retries tolerate an already deleted event and send no Meet link or Google invite',async()=>{
  const f=fixture({deletedAlready:true,job:{change_kind:'cancelled'}});
  assert.equal((await f.processStripeBookingChange()).completed,true);
  assert.equal(f.payloads[0].meetUrl,null);assert.equal(f.payloads[0].notice,'cancelled');
  assert.equal(f.calls.includes('calendar'),false);
});
test('foreign-scope durable job cannot contact Calendar or email',async()=>{
  const f=fixture({job:{stripe_account_id:'acct_foreign'}});
  await f.processStripeBookingChange();assert.equal(f.job.status,'review_required');
  assert.equal(f.calls.includes('calendar'),false);assert.equal(f.payloads.length,0);
});
