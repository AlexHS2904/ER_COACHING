import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const id='11111111-1111-4111-8111-111111111111';
const attemptId='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const token='a'.repeat(64),sessionId='cs_test_fixture',eventId='evt_fixture';
const access=testModules().load('src/lib/stripe/access.ts');

function fixture(options={}) {
  const now=Date.now(),legalAt=new Date(now-90_000).toISOString();
  const booking={id,booking_reference:'FIXTURE',created_at:new Date(now-120_000).toISOString(),
    status:'pending',payment_status:'pending',payment_flow:'stripe',finalization_status:'not_started',
    next_finalization_at:new Date(now-1000).toISOString(),
    expired_at:null,payment_expires_at:new Date(now+28*60_000).toISOString(),
    booking_access_token_hash:access.hashBookingAccess(token),price_snapshot:'500.00',currency_snapshot:'MXN',
    legal_terms_accepted_at:legalAt,legal_adult_confirmed_at:legalAt,
    legal_terms_version:'2026-10-29.2',legal_privacy_notice_version:'2026-10-29.2',...options.booking};
  const attempt={id:attemptId,booking_id:id,created_at:booking.created_at,amount_minor:50000,currency:'mxn',
    stripe_checkout_session_id:sessionId,stripe_payment_intent_id:null,...options.attempt};
  const session={id:sessionId,object:'checkout.session',livemode:false,mode:'payment',client_reference_id:id,
    metadata:{booking_id:id,payment_attempt_id:attemptId,booking_reference:'FIXTURE'},
    amount_total:50000,currency:'mxn',status:'complete',payment_status:'paid',payment_intent:'pi_fixture',
    ...options.session};
  const event={id:eventId,object:'event',livemode:false,type:'checkout.session.completed',
    data:{object:{...session,...options.eventSession}},...options.event};
  const calls={reads:[],retrieve:[],list:[],rpc:[],finalize:[],effects:0};
  const ledger=new Set();
  const originalLegal=()=>JSON.stringify(Object.fromEntries(Object.entries(booking).filter(([k])=>k.startsWith('legal_'))));
  const legalBaseline=originalLegal();
  const db={
    from(table) {
      const filters=[];
      const q={
        select(){return q;},eq(k,v){filters.push([k,v]);return q;},not(){return q;},order(){return q;},limit(){return q;},
        async maybeSingle(){
          calls.reads.push(table);
          if(options.dbError)return {data:null,error:{message:'private database failure'}};
          const row=table==='bookings'?booking:table==='booking_payment_attempts'&&!options.noAttempt?attempt:null;
          const match=row&&filters.every(([k,v])=>row[k]===v);
          return {data:match?{...row}:null,error:null};
        },
        update(){throw new Error('The return must not perform direct database writes');},
        insert(){throw new Error('The return must not insert business rows');},
      };
      return q;
    },
    async rpc(name,args) {
      calls.rpc.push({name,args});
      assert.equal(name,'apply_stripe_checkout_event_v1');
      assert.equal(args.p_event_id,eventId);
      if(options.persistError)return {data:null,error:{message:'private ledger failure'}};
      if(ledger.has(args.p_event_id))return {data:{booking_id:id,duplicate:true},error:null};
      ledger.add(args.p_event_id);
      booking.payment_status='paid';booking.payment_provider='stripe';booking.payment_reference='pi_fixture';
      booking.paid_at??=new Date(now).toISOString();
      if(booking.status==='cancelled'||Date.parse(booking.payment_expires_at)<=Date.now()) {
        booking.finalization_status='review_required';
        return {data:{booking_id:id,review_required:true,accepted:false},error:null};
      }
      booking.finalization_status='pending';
      return {data:{booking_id:id,accepted:true},error:null};
    },
  };
  const stripe={
    checkout:{sessions:{
      async retrieve(sid){calls.retrieve.push(sid);if(options.retrieveError)throw new Error('private Stripe response');return structuredClone(session);},
      async create(){throw new Error('A return must never create another Checkout');},
    }},
    events:{async list(params){calls.list.push(params);if(options.listError)throw new Error('private Stripe event response');
      return options.pages?options.pages[calls.list.length-1]:{data:options.noEvent?[]:[event],has_more:false};}},
  };
  const modules=testModules({
    '@/lib/stripe/server':{getStripeBookingAdmin:()=>db,getStripeTestClient:()=>stripe},
    '@/lib/bookings/finalize-paid-booking':{async finalizePaidBooking(bookingId){
      calls.finalize.push(bookingId);
      if(options.finalizerError)throw new Error('private finalization failure');
      if(booking.finalization_status==='completed')return {completed:false,skipped:true};
      calls.effects++;booking.status='confirmed';booking.finalization_status='completed';
      return {completed:true,skipped:false};
    }},
    '@/lib/bookings/intake-destination':{async bookingIntakeDestination(b,credential){
      assert.equal(credential,token);
      if(b.payment_status!=='paid'||b.status!=='confirmed'||b.finalization_status!=='completed')return {status:'waiting',redirectIntakeUrl:null};
      if(options.submitted)return {status:'submitted',redirectIntakeUrl:null};
      return {status:'available',redirectIntakeUrl:'http://localhost:3000/formulario/private-fixture-only'};
    }},
  });
  const helper=modules.load('src/lib/stripe/checkout-return.ts');
  return {booking,attempt,session,event,calls,ledger,legalBaseline,originalLegal,modules,
    run:(...args)=>helper.reconcileStripeCheckoutReturn(args.length>2?args[2]:id,args.length>1?args[1]:token,args.length?args[0]:sessionId),
    owned:(credential=token)=>helper.getOwnedStripeBooking(id,credential),
    webhook:()=>modules.load('src/lib/stripe/webhook.ts').applyStripeCheckoutEvent(event)};
}

test('paid Session before webhook uses the real Stripe Event and common finalizer, preserving legal evidence',async()=>{
  const f=fixture(),r=await f.run();
  assert.equal(r.observation,'paid');assert.equal(r.booking.payment_status,'paid');assert.equal(r.booking.status,'confirmed');
  assert.equal(r.intake.status,'available');assert.match(r.intake.redirectIntakeUrl,/\/formulario\//);
  assert.equal(f.calls.rpc.length,1);assert.equal(f.calls.rpc[0].args.p_event_id,eventId);assert.deepEqual(f.calls.finalize,[id]);
  assert.equal(f.originalLegal(),f.legalBaseline);assert.deepEqual(f.calls.retrieve,[sessionId]);
  assert.equal(f.calls.list[0].type,'checkout.session.completed');assert.equal(f.calls.list[0].limit,100);
});

test('refresh and subsequent real webhook preserve one ledger entry and one finalization',async()=>{
  const f=fixture();await f.run();const paidAt=f.booking.paid_at,reference=f.booking.payment_reference;
  await f.run();const replay=await f.webhook();await f.run();
  assert.equal(replay.duplicate,true);assert.equal(f.ledger.size,1);assert.equal(f.calls.effects,1);assert.equal(f.calls.finalize.length,1);
  assert.equal(f.calls.retrieve.length,1);assert.equal(f.booking.paid_at,paidAt);assert.equal(f.booking.payment_reference,reference);
  assert.equal(f.originalLegal(),f.legalBaseline);
});

test('simultaneous webhook and two success returns converge on the same receipt and finalization',async()=>{
  const f=fixture();await Promise.all([f.run(),f.webhook(),f.run()]);
  assert.equal(f.ledger.size,1);assert.equal(f.calls.effects,1);assert.equal(f.booking.payment_status,'paid');
  assert.equal(f.booking.status,'confirmed');assert.equal(f.booking.finalization_status,'completed');
  assert.equal(f.originalLegal(),f.legalBaseline);
});

test('webhook first reuses its financial state and existing intake without Stripe requests or duplicate finalization',async()=>{
  const f=fixture({booking:{status:'confirmed',payment_status:'paid',finalization_status:'completed'}});
  const r=await f.run();assert.equal(r.observation,'paid');assert.equal(r.intake.status,'available');
  assert.equal(f.calls.retrieve.length,0);assert.equal(f.calls.list.length,0);assert.equal(f.calls.rpc.length,0);assert.equal(f.calls.finalize.length,0);
});

test('paid booking awaiting finalization uses common finalizer and reloads its final state',async()=>{
  const f=fixture({booking:{payment_status:'paid',finalization_status:'retryable'}}),r=await f.run();
  assert.equal(r.booking.finalization_status,'completed');assert.equal(r.intake.status,'available');assert.equal(f.calls.effects,1);assert.equal(f.calls.rpc.length,0);
});

test('repeated return refreshes during persisted finalization backoff perform no writes or provider retries',async()=>{
  const f=fixture({booking:{payment_status:'paid',finalization_status:'retryable',
    next_finalization_at:new Date(Date.now()+60_000).toISOString(),updated_at:'2026-10-30T19:25:45Z'}});
  const baseline=JSON.stringify(f.booking);
  for(let i=0;i<3;i++){
    const r=await f.run();assert.equal(r.observation,'paid');assert.equal(r.intake.status,'waiting');
    assert.equal(r.booking.finalization_status,'retryable');
  }
  assert.equal(f.calls.finalize.length,0);assert.equal(f.calls.rpc.length,0);assert.equal(f.calls.effects,0);
  assert.equal(f.calls.retrieve.length,0);assert.equal(JSON.stringify(f.booking),baseline);
});

test('return may retry finalization once its persisted deadline is due',async()=>{
  const f=fixture({booking:{payment_status:'paid',finalization_status:'retryable',
    next_finalization_at:new Date(Date.now()-1000).toISOString()}}),r=await f.run();
  assert.equal(f.calls.finalize.length,1);assert.equal(f.calls.effects,1);assert.equal(r.booking.finalization_status,'completed');
  assert.equal(r.intake.status,'available');assert.equal(f.calls.rpc.length,0);
});

for(const next of [null,'invalid-timestamp'])test(`retryable return with unusable persisted deadline never bypasses backoff (${next})`,async()=>{
  const f=fixture({booking:{payment_status:'paid',finalization_status:'retryable',next_finalization_at:next}});
  await f.run();assert.equal(f.calls.finalize.length,0);assert.equal(f.calls.rpc.length,0);assert.equal(f.calls.effects,0);
});

for(const credential of [undefined,null,'ER-FIXTURE','b'.repeat(64)])test(`missing/invalid/other booking cookie rejects before Stripe or effects (${String(credential).length})`,async()=>{
  const f=fixture();await assert.rejects(()=>f.run(sessionId,credential),e=>e.code==='invalid_access');
  assert.equal(f.calls.retrieve.length,0);assert.equal(f.calls.rpc.length,0);assert.equal(f.calls.finalize.length,0);
});

test('a booking A credential cannot operate booking B',async()=>{
  const f=fixture();await assert.rejects(()=>f.run(sessionId,token,other),e=>e.code==='invalid_access');assert.equal(f.calls.retrieve.length,0);
});

for(const sid of ['cs_test_other','cs_live_fixture','invalid',''])test(`foreign or invalid Session is rejected without disclosing provider information (${sid})`,async()=>{
  const f=fixture();await assert.rejects(()=>f.run(sid),e=>e.code==='invalid_access'&&!e.message.includes('Stripe response'));
  assert.equal(f.calls.retrieve.length,0);assert.equal(f.calls.rpc.length,0);
});

for(const change of [
  {livemode:true},{mode:'subscription'},{object:'payment_intent'},{client_reference_id:other},
  {metadata:{booking_id:other,payment_attempt_id:attemptId,booking_reference:'FIXTURE'}},
  {metadata:{booking_id:id,payment_attempt_id:other,booking_reference:'FIXTURE'}},
  {metadata:{booking_id:id,payment_attempt_id:attemptId,booking_reference:'WRONG'}},
  {amount_total:1},{currency:'usd'},{payment_intent:'invalid'},
])test(`verified Stripe Session rejects conflicting identity (${Object.keys(change)[0]} ${JSON.stringify(change).length})`,async()=>{
  const f=fixture({session:change});await assert.rejects(()=>f.run(),e=>e.code==='invalid_access');assert.equal(f.calls.rpc.length,0);assert.equal(f.calls.effects,0);
});

test('known PaymentIntent cannot be replaced',async()=>{
  const f=fixture({attempt:{stripe_payment_intent_id:'pi_other'}});await assert.rejects(()=>f.run(),e=>e.code==='invalid_access');assert.equal(f.calls.rpc.length,0);
});

test('cancel return without session_id retrieves only its own existing open Session and leaves retry available',async()=>{
  const f=fixture({session:{status:'open',payment_status:'unpaid',payment_intent:null}}),r=await f.run(undefined);
  assert.equal(r.observation,'unpaid');assert.equal(r.booking.payment_status,'pending');assert.equal(f.calls.list.length,0);assert.equal(f.calls.rpc.length,0);
  assert.equal(r.booking.payment_expires_at,f.booking.payment_expires_at);assert.equal(f.originalLegal(),f.legalBaseline);
});

test('cancel return may also discover a genuinely paid Session, without trusting URL flags',async()=>{
  const f=fixture(),r=await f.run(undefined);assert.equal(r.observation,'paid');assert.equal(f.calls.effects,1);
});

for(const change of [{noEvent:true},{listError:true},{persistError:true}])test(`paid observation with temporarily unavailable event/ledger stays processing (${Object.keys(change)[0]})`,async()=>{
  const f=fixture(change),r=await f.run();assert.equal(r.observation,'processing');assert.equal(r.booking.payment_status,'pending');
  assert.equal(r.intake.redirectIntakeUrl,null);assert.equal(f.calls.effects,0);
});

test('Stripe retrieval failure keeps unknown state and never exposes private error data',async()=>{
  const f=fixture({retrieveError:true}),r=await f.run();assert.equal(r.observation,'unknown');assert.equal(f.calls.rpc.length,0);
  assert.equal(JSON.stringify(r).includes('private Stripe response'),false);assert.equal(f.calls.effects,0);
});

test('completed but unpaid delayed payment stays processing rather than allowing another charge',async()=>{
  const f=fixture({session:{payment_status:'unpaid',payment_intent:null}}),r=await f.run();
  assert.equal(r.observation,'processing');assert.equal(f.calls.rpc.length,0);assert.equal(f.calls.effects,0);
});

test('events are paginated with a strict bound, and absence does not fabricate financial certainty',async()=>{
  const page={data:[{id:'evt_unrelated',type:'checkout.session.completed',data:{object:{id:'cs_test_unrelated'}}}],has_more:true};
  const f=fixture({pages:[page,page,page]}),r=await f.run();assert.equal(r.observation,'processing');assert.equal(f.calls.list.length,3);
  assert.equal(f.calls.list[1].starting_after,'evt_unrelated');assert.equal(f.calls.rpc.length,0);
});

for(const options of [{event:{livemode:true}},{event:{id:'invented_receipt'}},{eventSession:{amount_total:1}},{eventSession:{payment_intent:'pi_other'}}])test(`real Event is independently validated before common persistence (${JSON.stringify(options)})`,async()=>{
  const f=fixture(options);await assert.rejects(()=>f.run(),e=>e.code==='invalid_access');assert.equal(f.calls.rpc.length,0);
});

for(const booking of [
  {status:'cancelled',expired_at:'2020-01-01'},
  {payment_expires_at:'2020-01-01'},
])test(`late or cancelled paid receipt follows existing review path without resurrection (${JSON.stringify(booking)})`,async()=>{
  const f=fixture({booking}),r=await f.run();assert.equal(r.observation,'paid');assert.equal(r.booking.finalization_status,'review_required');
  assert.equal(f.calls.effects,0);assert.equal(f.calls.finalize.length,0);assert.equal(r.intake.redirectIntakeUrl,null);
});

test('submitted intake remains submitted and never produces an editable redirect',async()=>{
  const f=fixture({submitted:true,booking:{status:'confirmed',payment_status:'paid',finalization_status:'completed'}}),r=await f.run();
  assert.equal(r.intake.status,'submitted');assert.equal(r.intake.redirectIntakeUrl,null);assert.equal(f.calls.effects,0);
});

test('a return without any Session never creates one or writes the booking',async()=>{
  const f=fixture({noAttempt:true}),r=await f.run(undefined);assert.equal(r.observation,'unpaid');assert.equal(f.calls.retrieve.length,0);
  assert.equal(f.calls.rpc.length,0);assert.equal(f.calls.effects,0);
});
