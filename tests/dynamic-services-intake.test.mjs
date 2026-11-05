import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const id='11111111-1111-4111-8111-111111111111';
const site='http://localhost:3000';
const token='a'.repeat(64);
const scope={mode:'test',accountId:'acct_fixture'};

test('admin payment panel hides Intake and performs no link recovery for an explicit opt-out',()=>{
  const effects=[],sets=[];
  const modules=testModules({
    react:{useState:value=>[value,next=>sets.push(next)],useEffect:fn=>effects.push(fn)},
    'next/link':()=>null,'next/navigation':{useRouter:()=>({refresh(){}})},
  });
  const panel=modules.load('src/components/admin/BookingPaymentPanel.tsx').default;
  assert.equal(panel({bookingId:id,serviceName:'Sesión 1:1',initialPaymentStatus:'paid',requiresIntakeSnapshot:false}),null);
  for(const effect of effects)effect();
  assert.deepEqual(sets,['paid']);
});
test('required snapshot keeps the admin Intake panel independently of its display name',()=>{
  const modules=testModules({react:{useState:value=>[value,()=>{}],useEffect(){}},
    'next/link':()=>null,'next/navigation':{useRouter:()=>({refresh(){}})}});
  assert.notEqual(modules.load('src/components/admin/BookingPaymentPanel.tsx').default({
    bookingId:id,serviceName:'Renamed core service',initialPaymentStatus:'paid',requiresIntakeSnapshot:true,
  }),null);
});
test('direct admin form page rejects an opt-out before reading any accidental Intake',async()=>{
  let authorized=0,reads=0;
  const modules=testModules({
    '@/lib/admin/require-admin':{requireAdmin:async()=>{authorized++;}},
    'next/link':()=>null,'next/navigation':{notFound(){throw new Error('NOT_FOUND');}},
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>({from(table){
      reads++;assert.equal(table,'bookings');
      const query={select(columns){assert.match(columns,/requires_intake_snapshot/);return query;},eq(){return query;},
        maybeSingle:async()=>({data:{id,requires_intake_snapshot:false}})};return query;
    }})},
  });
  await assert.rejects(modules.load('src/app/admin/(protected)/reservas/[id]/formulario/page.tsx').default({params:Promise.resolve({id})}),/NOT_FOUND/);
  assert.equal(authorized,1);assert.equal(reads,1);
});

function destination(snapshot,{authorized=true,paid=true}={}) {
  let reads=0;
  const modules=testModules({
    '@/lib/stripe/access':{hasBookingAccess:()=>authorized},
    '@/lib/stripe/server':{getStripeBookingAdmin(){reads++;throw new Error('No Intake lookup expected');}},
  });
  const booking={id,booking_access_token_hash:'fixture-hash',payment_flow:'stripe',
    payment_status:paid?'paid':'pending',status:'confirmed',finalization_status:'completed',requires_intake_snapshot:snapshot};
  return {run:()=>modules.load('src/lib/bookings/intake-destination.ts').bookingIntakeDestination(booking,token),get reads(){return reads;}};
}

test('explicit no-Intake snapshot returns no destination or database lookup after authorized finalization',async()=>{
  const f=destination(false);
  assert.deepEqual(await f.run(),{status:'not_required',redirectIntakeUrl:null});
  assert.equal(f.reads,0);
});
for(const flags of [{authorized:false},{paid:false}])test(`no-Intake state still requires ownership and verified payment: ${Object.keys(flags)[0]}`,async()=>{
  const f=destination(false,flags);
  assert.deepEqual(await f.run(),{status:'waiting',redirectIntakeUrl:null});
  assert.equal(f.reads,0);
});

test('no-Intake confirmation never waits for or advertises a form',()=>{
  const state=testModules().load('src/lib/bookings/confirmation-state.ts').bookingConfirmationState;
  const booking={status:'confirmed',payment_status:'paid',payment_flow:'stripe',requires_intake_snapshot:false};
  for(const finalization_status of ['processing','retryable','completed']) {
    const result=state({...booking,finalization_status},'not_required');
    assert.equal(result.detail.includes('formulario'),false);
    assert.equal(result.refresh,finalization_status!=='completed');
  }
});
for(const snapshot of [null,undefined,true])test(`historical/required confirmation retains form preparation (${snapshot})`,()=>{
  const state=testModules().load('src/lib/bookings/confirmation-state.ts').bookingConfirmationState;
  const booking={status:'confirmed',payment_status:'paid',payment_flow:'stripe',finalization_status:'processing',requires_intake_snapshot:snapshot};
  assert.match(state(booking).detail,/formulario/);
  assert.equal(state({...booking,finalization_status:'completed'},'available').title,'Redirigiendo a tu formulario');
});

function finalizer(snapshot,{process=false,paid=true,intakeFails=false,ambiguousCustomer=false}={}) {
  const effects=[],emails=[];
  let completed=false;
  const booking={id,status:'confirmed',payment_status:paid?'paid':'pending',payment_reference:'pi_fixture',
    finalization_status:'processing',requires_intake_snapshot:snapshot,stripe_site_origin:site,
    session_count_snapshot:process?6:1,process_id:process?'process-fixture':null,package_session_number:process?1:null,
    stripe_mode:scope.mode,stripe_account_id:scope.accountId,booking_reference:'ER-FIXTURE',
    customer_name:'Fixture',customer_email:'fixture@example.test',starts_at:'2035-01-01T12:00:00Z',
    ends_at:'2035-01-01T13:30:00Z',price_snapshot:process?2500:10,currency_snapshot:'MXN',
    stripe_customer_email_started_at:ambiguousCustomer?new Date().toISOString():null};
  const db={async rpc(name,args){
    if(name==='claim_stripe_finalization_v2') {
      assert.equal(args.p_stripe_account_id,scope.accountId);
      if(!paid)return {data:null,error:{message:'stripe_payment_required'}};
      return {data:completed?null:booking,error:null};
    }
    assert.equal(name,'save_stripe_finalization_v2');
    effects.push(args.p_step);
    if(args.p_step==='calendar')Object.assign(booking,{google_event_id:args.p_data.eventId,google_meet_url:args.p_data.meetUrl});
    if(args.p_step==='customer_email')booking.customer_email_id=args.p_data.id;
    if(args.p_step==='coach_email')booking.coach_email_id=args.p_data.id;
    if(args.p_step==='completed'){completed=true;booking.finalization_status='completed';}
    return {data:booking,error:null};
  },from(table){
    assert.equal(table,'coaching_processes');
    return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{id:'process-fixture',status:'active',total_sessions:6,
      stripe_mode:scope.mode,stripe_account_id:scope.accountId},error:null};}};
  }};
  const modules=testModules({
    '@/lib/stripe/server':{getStripeConfig:()=>scope,getStripeBookingAdmin:()=>db,assertStripeRecordScope(){}},
    '@/lib/google/calendar':{async ensurePaidBookingCalendar(){effects.push('calendar-provider');return {eventId:'event-fixture',meetUrl:'https://meet.google.com/fixture'};}},
    '@/lib/coaching/process-access':{recoverProcessAccessUrl:()=>`${site}/proceso/private-fixture`},
    '@/lib/intake/activate-booking-intake':{async activateBookingIntake(args){
      effects.push('intake-provider');assert.equal(args.requiresIntakeSnapshot,snapshot??undefined);
      if(intakeFails)throw new Error('intake unavailable');
      return {canonicalIntakeUrl:`${site}/formulario/private-fixture`};
    }},
    '@/lib/email/send-booking-emails':{async sendBookingEmails(args){
      const recipient=args.recipients[0];effects.push(`${recipient}-provider`);emails.push(args);
      return {[recipient]:{id:`${recipient}-receipt`,error:null}};
    }},
  });
  return {run:()=>modules.load('src/lib/bookings/finalize-paid-booking.ts').finalizePaidBooking(id,scope),effects,emails,booking};
}

for(const process of [false,true])test(`new ${process?'package':'dynamic single'} finalizes without Intake or CTA, preserving Calendar and emails`,async()=>{
  const f=finalizer(false,{process,ambiguousCustomer:true});
  assert.equal((await f.run()).completed,true);
  assert.equal(f.effects.includes('intake-provider'),false);
  assert.deepEqual(f.effects.filter(x=>x.endsWith('-provider')),['calendar-provider','customer-provider','coach-provider']);
  assert.equal(f.emails.length,2);
  for(const email of f.emails){assert.equal(email.canonicalIntakeUrl,null);assert.equal(Boolean(email.processAccessUrl),process);}
  const before=[...f.effects];
  assert.equal((await f.run()).skipped,true);
  assert.deepEqual(f.effects,before,'duplicate finalization performs no provider work');
});
for(const snapshot of [null,undefined,true])test(`existing/required single keeps valid Intake before principal email (${snapshot})`,async()=>{
  const f=finalizer(snapshot);
  assert.equal((await f.run()).completed,true);
  assert.ok(f.effects.indexOf('intake-provider')<f.effects.indexOf('customer-provider'));
  assert.ok(f.emails.every(email=>email.canonicalIntakeUrl));
});
test('historical package keeps its shared Intake and private process link',async()=>{
  const f=finalizer(null,{process:true});
  assert.equal((await f.run()).completed,true);
  assert.ok(f.effects.includes('intake-provider'));
  assert.ok(f.emails.every(email=>email.canonicalIntakeUrl&&email.processAccessUrl));
});
test('required Intake failure prevents emails and completed',async()=>{
  const f=finalizer(true,{intakeFails:true});
  assert.equal((await f.run()).completed,false);
  assert.equal(f.emails.length,0);
  assert.equal(f.effects.includes('completed'),false);
  assert.equal(f.effects.at(-1),'retryable');
});
test('no-Intake snapshot does not bypass the verified financial claim',async()=>{
  const f=finalizer(false,{paid:false});
  await assert.rejects(f.run(),/finalization_claim_failed/);
  assert.deepEqual(f.effects,[]);assert.deepEqual(f.emails,[]);
});

test('activation helper refuses explicit no-Intake before proposing tokens or calling providers',async()=>{
  const modules=testModules({
    '@/lib/supabase/admin':{getSupabaseAdmin(){throw new Error('No database access expected');}},
    '@/lib/email/send-intake-form-ready-email':{sendIntakeFormReadyEmail(){throw new Error('No provider access expected');}},
  });
  const activate=modules.load('src/lib/intake/activate-booking-intake.ts').activateBookingIntake;
  await assert.rejects(activate({bookingId:id,provider:'stripe',siteUrl:site,requiresIntakeSnapshot:false}),/intake_ineligible/);
});

function tokenFixture(snapshot,{manual=false}={}) {
  const form={id:'form-fixture',booking_id:manual?null:id,process_id:null,source_type:manual?'manual':'booking'};
  const modules=testModules({
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>({from(table){return {select(){return this;},eq(){return this;},async maybeSingle(){return {error:null,
      data:table==='booking_intake_forms'?form:{id,requires_intake_snapshot:snapshot}};}};}})},
  });
  return ()=>modules.load('src/lib/intake/get-intake-by-token.ts').getIntakeByToken(token);
}
test('public Intake token lookup rejects an accidental form for explicit no-Intake booking',async()=>{
  assert.equal(await tokenFixture(false)(),null);
});
for(const snapshot of [null,undefined,true])test(`existing/required token lookup remains available (${snapshot})`,async()=>{
  assert.equal((await tokenFixture(snapshot)()).booking.id,id);
});
test('manual invitations remain independent of booking Intake policy',async()=>{
  const result=await tokenFixture(false,{manual:true})();
  assert.equal(result.booking,null);assert.equal(result.form.source_type,'manual');
});

test('admin link endpoint refuses accidental no-Intake form before retrieving its access',async()=>{
  const reads=[];
  const modules=testModules({
    'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status??200})}},
    '@/lib/admin/is-active-admin':{isActiveAdmin:async()=>true},
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>({from(table){reads.push(table);assert.equal(table,'bookings');
      return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{id,payment_status:'paid',requires_intake_snapshot:false},error:null};}};
    }})},
  });
  const {GET}=modules.load('src/app/api/admin/intake/by-booking/[bookingId]/link/route.ts');
  const result=await GET({url:site},{params:Promise.resolve({bookingId:id})});
  assert.equal(result.status,409);assert.equal(result.body.formUrl,undefined);
  assert.deepEqual(reads,['bookings']);
});
