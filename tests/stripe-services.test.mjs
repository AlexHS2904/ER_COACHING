import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Stripe from "stripe";
import { createRequire } from "node:module";
import { testModules } from "./helpers/load-typescript.mjs";

const id="11111111-1111-4111-8111-111111111111";
const attemptId="22222222-2222-4222-8222-222222222222";
const site="http://localhost:3000";
const env={NEXT_PUBLIC_SITE_URL:site,NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54321",STRIPE_SECRET_KEY:"sk_test_fake_unit_only"};
const response=(data,init={})=>({data,status:init.status??200});
const SDKStripe = createRequire(import.meta.url)("stripe");

test("hold cookie flags support localhost HTTP and HTTPS without enabling Stripe Live",()=>{
  const {holdCookieOptions}=testModules().load("src/lib/stripe/access.ts");
  const deadline=new Date(Date.now()+7200000);
  for(const [url,secure] of [[site,false],["https://example.test",true]]) {
    const options=holdCookieOptions(url,deadline);
    assert.equal(options.httpOnly,true);assert.equal(options.sameSite,"lax");assert.equal(options.secure,secure);
    assert.equal(options.path,"/");assert.equal(options.expires,deadline);
    assert.ok(options.maxAge>7190&&options.maxAge<=7200);assert.equal(options.domain,undefined);
  }
  assert.equal(holdCookieOptions(site,new Date(0)).maxAge,0);
});

test("MXN conversion uses exact decimal/BigInt arithmetic",()=>{
  const {toStripeMinorUnits}=testModules().load("src/lib/stripe/money.ts");
  assert.equal(toStripeMinorUnits("500.00","MXN"),50000);
  assert.equal(toStripeMinorUnits("0.01","mxn"),1);
  for(const input of ["500.001","NaN","1e3","-1","0","900719925474099100"]) assert.throws(()=>toStripeMinorUnits(input,"mxn"));
  assert.throws(()=>toStripeMinorUnits("500","usd"));
});

test("Stripe rejects live keys and unapproved remote database/site configuration",()=>{
  for(const changes of [
    {STRIPE_SECRET_KEY:"sk_live_fake_rejected"},
    {NEXT_PUBLIC_SUPABASE_URL:"https://not-local.example.test"},
    {NEXT_PUBLIC_SITE_URL:"https://not-local.example.test"},
    {NEXT_PUBLIC_SUPABASE_URL:"https://other-project.supabase.co"},
    {NEXT_PUBLIC_SUPABASE_URL:"http://rysgpojjhiljrrwtjguy.supabase.co"},
    {NEXT_PUBLIC_SUPABASE_URL:"https://rysgpojjhiljrrwtjguy.supabase.co.evil.test"},
    {NEXT_PUBLIC_SUPABASE_URL:"https://user@rysgpojjhiljrrwtjguy.supabase.co"},
  ]) {
    const {getStripeTestClient,isStripeTestCheckoutEnabled}=testModules({"@/lib/supabase/admin":{}},{...env,...changes}).load("src/lib/stripe/server.ts");
    assert.throws(()=>getStripeTestClient()); assert.equal(isStripeTestCheckoutEnabled(),false);
  }
});

test("ER_COACHING accepts test keys only while the app remains local",()=>{
  for (const [changes,enabled] of [
    [{},true], [{STRIPE_SECRET_KEY:'sk_live_fake_rejected'},false],
    [{NEXT_PUBLIC_SITE_URL:'https://example.test'},false],
  ]) {
    const modules=testModules({'@/lib/supabase/admin':{}},{...env,
      NEXT_PUBLIC_SUPABASE_URL:'https://rysgpojjhiljrrwtjguy.supabase.co',...changes});
    assert.equal(modules.load('src/lib/stripe/server.ts').isStripeTestCheckoutEnabled(),enabled);
  }
});

function checkoutFixture({known=false,failOnce=false,sessionChanges={},creationError=null,requestCount=1,
  firstDispatch=true,saveError=null,recordError=null,retrieveError=null}={}) {
  const calls={create:[],retrieve:0,update:[],rpc:[]}; let failures=failOnce?1:0;
  const listeners=new Set(); let first=firstDispatch;
  const booking={id,booking_reference:"TEST-1",price_snapshot:"500.00",currency_snapshot:"MXN"};
  const storedPayload={mode:"payment",payment_method_types:["card"],expires_at:12345,
    line_items:[{quantity:1,price_data:{currency:'mxn',unit_amount:50000,product_data:{name:'Sesión 1:1'}}}],
    client_reference_id:id,metadata:{booking_id:id,payment_attempt_id:attemptId,booking_reference:'TEST-1'},
    success_url:`${site}/reservar/confirmada?booking=${id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:`${site}/reservar/confirmada?booking=${id}`};
  const attempt={id:attemptId,amount_minor:"50000",currency:"mxn",stripe_checkout_session_id:known?"cs_test_fixed":null,checkout_payload:storedPayload};
  const session={id:"cs_test_fixed",livemode:false,mode:"payment",status:"open",payment_status:"unpaid",amount_total:50000,currency:"mxn",client_reference_id:id,
    metadata:{booking_id:id,booking_reference:"TEST-1",payment_attempt_id:attemptId},url:"https://checkout.stripe.com/c/pay/cs_test_fixed",expires_at:2100000000,...sessionChanges};
  const stripe={on(event,fn){listeners.add(fn);},off(event,fn){listeners.delete(fn);},checkout:{sessions:{
    async create(payload,options){
      calls.create.push({payload,options});
      for(let n=0;n<requestCount;n++)for(const fn of listeners)fn({method:'POST',path:'/v1/checkout/sessions',idempotency_key:options.idempotencyKey});
      if(creationError)throw creationError;
      if(failures-->0)throw new Error("simulated timeout"); return session;
    },
    async retrieve(){calls.retrieve++;if(retrieveError)throw retrieveError;return session;},
  }}};
  const db={async rpc(name,args){
    calls.rpc.push({name,args});
    if(name==='claim_stripe_checkout_v1')return {data:{booking,attempt},error:null};
    if(name==='begin_stripe_checkout_creation_v1'){const data=first;first=false;return {data,error:null};}
    if(name==='record_stripe_checkout_failure_v1'){
      calls.update.push({status:args.p_status,last_error:args.p_error});return {data:!recordError,error:recordError};
    }
    if(name==='save_stripe_checkout_v1'&&saveError)throw saveError;
    return {data:true,error:null};},
    from(){return {update(value){calls.update.push(value);return {eq(){return this;},async in(){return {error:null};}};}};}};
  const modules=testModules({"@/lib/stripe/server":{getStripeBookingAdmin:()=>db,getStripeTestClient:()=>stripe,getStripeTestSiteUrl:()=>site},"@/lib/stripe/expire-hold":{expireStripeBookingHold:async()=>false}});
  return {...modules.load("src/lib/stripe/checkout.ts"),calls,storedPayload,listeners};
}
test('Checkout omits legacy payment methods without changing stored payload or financial/redirect fields',async()=>{
  const f=checkoutFixture();
  const before=structuredClone(f.storedPayload);
  await f.createOrRecoverCheckout(id,'a'.repeat(64));
  const {payment_method_types,...expected}=before;
  const sent=f.calls.create[0].payload;
  assert.equal(Object.hasOwn(sent,'payment_method_types'),false);
  assert.equal(Object.hasOwn(sent,'automatic_payment_methods'),false);
  assert.deepEqual(sent,expected);
  assert.deepEqual(f.storedPayload,before);
  assert.equal(f.calls.create[0].options.idempotencyKey,`booking-checkout/${attemptId}`);
});
test("Checkout retry uses original attempt payload and stable idempotency key after timeout",async()=>{
  const f=checkoutFixture({failOnce:true});
  await assert.rejects(f.createOrRecoverCheckout(id,"a".repeat(64)));
  const result=await f.createOrRecoverCheckout(id,"a".repeat(64));
  assert.equal(result.url,"https://checkout.stripe.com/c/pay/cs_test_fixed");
  assert.deepEqual(f.calls.create[0],f.calls.create[1]);
  assert.equal(f.calls.create[0].options.idempotencyKey,`booking-checkout/${attemptId}`);
  assert.equal(f.calls.update[0].status,"unknown");
});
test("known open Checkout is retrieved and reused without creating a second Session",async()=>{
  const f=checkoutFixture({known:true});
  const [first,second]=await Promise.all([f.createOrRecoverCheckout(id,"a".repeat(64)),f.createOrRecoverCheckout(id,"a".repeat(64))]);
  assert.equal(first.url,second.url); assert.equal(f.calls.create.length,0); assert.equal(f.calls.retrieve,2);
});

test('already bound paid Session requests reconciliation without another creation or save',async()=>{
  const f=checkoutFixture({known:true,sessionChanges:{status:'complete',payment_status:'paid',url:null}});
  await assert.rejects(f.createOrRecoverCheckout(id,'a'.repeat(64)),error=>error.code==='already_paid');
  assert.equal(f.calls.retrieve,1);assert.equal(f.calls.create.length,0);
  assert.deepEqual(f.calls.rpc.map(call=>call.name),['claim_stripe_checkout_v1']);
  assert.deepEqual(f.calls.update,[]);
});

test('paid idempotency replay binds a previously unbound Session before requesting reconciliation',async()=>{
  const f=checkoutFixture({firstDispatch:false,sessionChanges:{status:'complete',payment_status:'paid',url:null}});
  await assert.rejects(f.createOrRecoverCheckout(id,'a'.repeat(64)),error=>error.code==='already_paid');
  assert.equal(f.calls.retrieve,0);assert.equal(f.calls.create.length,1);
  assert.equal(f.calls.create[0].options.idempotencyKey,`booking-checkout/${attemptId}`);
  assert.deepEqual(f.calls.rpc.map(call=>call.name),[
    'claim_stripe_checkout_v1','begin_stripe_checkout_creation_v1','save_stripe_checkout_v1',
  ]);
  const [claim,,save]=f.calls.rpc;
  assert.equal(save.args.p_booking_id,id);assert.equal(save.args.p_attempt_id,attemptId);
  assert.equal(save.args.p_session_id,'cs_test_fixed');assert.equal(save.args.p_owner,claim.args.p_owner);
  assert.deepEqual(f.calls.update,[]);
});

test('lost paid Session binding remains unknown and cannot claim successful reconciliation',async()=>{
  const f=checkoutFixture({firstDispatch:false,sessionChanges:{status:'complete',payment_status:'paid',url:null},
    saveError:new Error('fixture storage unavailable')});
  await assert.rejects(f.createOrRecoverCheckout(id,'a'.repeat(64)),error=>error.code==='checkout_unavailable');
  assert.equal(f.calls.create.length,1);
  assert.deepEqual(f.calls.update,[{status:'unknown',last_error:'stripe_request_unknown'}]);
  assert.equal(f.calls.rpc.filter(call=>call.name==='save_stripe_checkout_v1').length,1);
});

for(const [label,error,status] of [
  ['invalid request',new SDKStripe.errors.StripeInvalidRequestError({type:'invalid_request_error',statusCode:400}),'failed'],
  ['authentication',new SDKStripe.errors.StripeAuthenticationError({statusCode:401}),'failed'],
  ['permission',new SDKStripe.errors.StripePermissionError({statusCode:403}),'failed'],
  ['timeout',new SDKStripe.errors.StripeConnectionError({message:'timeout'}),'unknown'],
  ['socket',Object.assign(new Error('socket'),{code:'ECONNRESET'}),'unknown'],
  ['5xx',new SDKStripe.errors.StripeAPIError({statusCode:500}),'unknown'],
  ['idempotency',new SDKStripe.errors.StripeIdempotencyError({statusCode:400}),'unknown'],
  ['unknown',new Error('unknown'),'unknown'],
])test(`Checkout creation persists ${label} as ${status}`,async()=>{
  const f=checkoutFixture({creationError:error});
  await assert.rejects(f.createOrRecoverCheckout(id,'a'.repeat(64)));
  assert.equal(f.calls.update[0].status,status);
  assert.equal(f.calls.rpc.some(r=>r.name==='save_stripe_checkout_v1'),false);
  assert.equal(f.listeners.size,0);
});

for(const changes of [{requestCount:2},{requestCount:0},{firstDispatch:false}])
test(`definitive error with insufficient dispatch certainty stays unknown ${JSON.stringify(changes)}`,async()=>{
  const f=checkoutFixture({...changes,creationError:new SDKStripe.errors.StripeInvalidRequestError({type:'invalid_request_error',statusCode:400})});
  await assert.rejects(f.createOrRecoverCheckout(id,'a'.repeat(64)));
  assert.equal(f.calls.update[0].status,'unknown');
});

test('Session returned then persistence throws: unknown, never failed even for SDK invalid-request error',async()=>{
  const f=checkoutFixture({saveError:new SDKStripe.errors.StripeInvalidRequestError({type:'invalid_request_error',statusCode:400})});
  await assert.rejects(f.createOrRecoverCheckout(id,'a'.repeat(64)));
  assert.equal(f.calls.create.length,1);assert.equal(f.calls.update[0].status,'unknown');
});
test('retrieval authentication error cannot mark an existing Session failed',async()=>{
  const f=checkoutFixture({known:true,retrieveError:new SDKStripe.errors.StripeAuthenticationError({statusCode:401})});
  await assert.rejects(f.createOrRecoverCheckout(id,'a'.repeat(64)));
  assert.equal(f.calls.update.length,0);assert.equal(f.calls.create.length,0);
});
test('failure persistence error is propagated without sending a replacement Session',async()=>{
  const f=checkoutFixture({creationError:new Error('timeout'),recordError:{message:'unavailable'}});
  await assert.rejects(f.createOrRecoverCheckout(id,'a'.repeat(64)));
  assert.equal(f.calls.create.length,1);assert.equal(f.listeners.size,0);
});
for(const [label,changes] of [["wrong amount",{amount_total:1}],["wrong currency",{currency:"usd"}],["wrong booking",{client_reference_id:randomUUID()}],["live session",{livemode:true}],["already paid",{status:"complete",payment_status:"paid"}],["foreign URL",{url:"https://attacker.example.test/pay"}]]) {
  test(`Checkout never returns a URL for ${label}`,async()=>{
    const f=checkoutFixture({known:true,sessionChanges:changes});
    await assert.rejects(f.createOrRecoverCheckout(id,"a".repeat(64)));
    assert.equal(f.calls.create.length,0);
  });
}

function googleFixture({timeout=false,pending=false,existing=false}={}) {
  let stored=existing?{id:"existing-event",status:"confirmed",start:{dateTime:"2035-01-01T12:00:00Z"},end:{dateTime:"2035-01-01T13:30:00Z"},hangoutLink:"https://meet.google.com/test-only"}:null;
  let creates=0;
  const events={
    async get(){if(!stored)throw {response:{status:404}};return {data:stored};},
    async insert(input){creates++; stored={...input.requestBody,status:"confirmed",htmlLink:"https://calendar.google.com/test-only",
      conferenceData:{createRequest:{status:{statusCode:pending?"pending":"success"}},entryPoints:pending?[]:[{entryPointType:"video",uri:"https://meet.google.com/test-only"}]}};
      if(timeout)throw new Error("simulated timeout after insert");return {data:stored};},
  };
  const modules=testModules({
    googleapis:{google:{calendar:()=>({events})}},
    "@/lib/google/oauth":{getGoogleOAuthClient:()=>({setCredentials(){}})},
    "@/lib/supabase/admin":{getSupabaseAdmin:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{refresh_token:"fake-test-only"},error:null})})})})})},
  });
  return {...modules.load("src/lib/google/calendar.ts"),get creates(){return creates;},get stored(){return stored;}};
}
const calendarInput={bookingId:id,bookingReference:"TEST-1",serviceName:"Sesión 1:1",customerName:"Test",customerEmail:"test@example.test",startsAt:"2035-01-01T12:00:00Z",endsAt:"2035-01-01T13:30:00Z"};
test("Google timeout after insert is recovered by the same stable event ID",async()=>{
  const f=googleFixture({timeout:true});
  const first=await f.ensurePaidBookingCalendar(calendarInput);
  const retry=await f.ensurePaidBookingCalendar(calendarInput);
  assert.equal(first.eventId,retry.eventId); assert.equal(f.creates,1);
  assert.match(first.eventId,/^[a-v0-9]{5,}$/);
});
test("existing google_event_id is retrieved without another insert",async()=>{
  const f=googleFixture({existing:true});
  assert.equal((await f.ensurePaidBookingCalendar({...calendarInput,existingEventId:"existing-event"})).eventId,"existing-event");
  assert.equal(f.creates,0);
});
test("pending Meet never creates a second Calendar event",async()=>{
  const f=googleFixture({pending:true});
  const first=await f.ensurePaidBookingCalendar(calendarInput);
  assert.equal(first.meetUrl,null);
  await f.ensurePaidBookingCalendar({...calendarInput,existingEventId:first.eventId});
  assert.equal(f.creates,1);
});

function finalizerFixture({googleFails=0,meetPending=0,emailFails=null,intakeFails=0,cancelled=false,review=false}={}) {
  const b={id,booking_reference:"TEST-1",payment_flow:"stripe",payment_status:"paid",status:cancelled?"cancelled":"pending",
    finalization_status:review?"review_required":"pending",payment_reference:"pi_test",service_name_snapshot:"Sesión 1:1",customer_name:"Test",customer_email:"test@example.test",customer_phone:null,
    starts_at:calendarInput.startsAt,ends_at:calendarInput.endsAt,duration_minutes_snapshot:90,session_count_snapshot:1,price_snapshot:500,currency_snapshot:"MXN",notes:null,
    google_event_id:null,google_meet_url:null,google_calendar_url:null,customer_email_id:null,coach_email_id:null};
  const calls={calendar:0,created:0,customer:0,coach:0,intake:0,intakeEmail:0},intakeArguments=[];
  let ready=false,formId=null,owner=null,failMail=emailFails;
  const db={async rpc(name,args){
    if(name==="claim_stripe_finalization_v1") {
      if(owner||b.status==="cancelled"||["review_required","completed"].includes(b.finalization_status))return {data:null,error:null};
      owner=args.p_owner;b.finalization_status="processing";return {data:{...b},error:null};
    }
    if(args.p_owner!==owner)return {data:null,error:{message:"lease_lost"}};
    const step=args.p_step,data=args.p_data;
    if(step==="calendar") {b.google_event_id=data.eventId;b.google_meet_url=data.meetUrl;b.google_calendar_url=data.calendarUrl;if(data.meetUrl)b.status="confirmed";}
    else if(step.endsWith("_email_start"))b[`stripe_${step.replace("_start","")}_started_at`]=new Date().toISOString();
    else if(step==="intake_start")b.stripe_intake_email_started_at=new Date().toISOString();
    else if(["customer_email","coach_email"].includes(step))b[`${step}_id`]=data.id;
    else if(["retryable","review_required","completed"].includes(step)){b.finalization_status=step;owner=null;}
    return {data:{...b},error:null};
  },from(){return {select(){return {eq(){return {maybeSingle:async()=>({data:ready?{ready_email_sent_at:new Date().toISOString()}:null,error:null})};}};}};}};
  const modules=testModules({
    "@/lib/stripe/server":{getStripeBookingAdmin:()=>db,getStripeTestSiteUrl:()=>site},
    "@/lib/google/calendar":{async ensurePaidBookingCalendar(input){calls.calendar++;if(googleFails-->0)throw new Error("simulated Google failure");if(!input.existingEventId)calls.created++;return {eventId:"stable-event",meetUrl:meetPending-->0?null:"https://meet.google.com/test-only",calendarUrl:"https://calendar.google.com/test-only"};}},
    "@/lib/email/send-booking-emails":{async sendBookingEmails(input){const who=input.recipients[0];calls[who]++;if(failMail===who){failMail=null;return {[who]:{id:null,error:"failure"}};}return {[who]:{id:`email-${who}`,error:null}};}},
    "@/lib/intake/activate-booking-intake":{async activateBookingIntake(args){intakeArguments.push(args);calls.intake++;if(intakeFails-->0)throw new Error("intake unavailable");if(!formId)formId="same-intake";if(!ready&&args.sendReadyEmail!==false){calls.intakeEmail++;ready=true;}return {formId,emailSent:ready,canonicalIntakeUrl:"http://localhost:3000/formulario/test-only",redirectIntakeUrl:"http://localhost:3000/formulario/test-only",intakeStatus:"active",submittedAt:null};}},
  });
  return {...modules.load("src/lib/bookings/finalize-paid-booking.ts"),b,calls,intakeArguments};
}
test("renamed booking keeps the finalizer intake interface and payment reference unchanged",async()=>{
  const f=finalizerFixture();f.b.service_name_snapshot="Consulta con nombre nuevo";
  const result=await f.finalizePaidBooking(id);
  assert.equal(result.completed,true);
  assert.deepEqual(f.intakeArguments,[{bookingId:id,provider:"stripe",paymentReference:"pi_test",siteUrl:site,sendReadyEmail:false}]);
});
test("finalizer confirms a paid booking and retries do not repeat completed effects",async()=>{
  const f=finalizerFixture(); await f.finalizePaidBooking(id);await f.finalizePaidBooking(id);
  assert.equal(f.b.status,"confirmed");assert.equal(f.b.finalization_status,"completed");
  assert.deepEqual(f.calls,{calendar:1,created:1,customer:1,coach:1,intake:1,intakeEmail:0});
});
test("concurrent finalizers cannot run the same work simultaneously",async()=>{
  const f=finalizerFixture();await Promise.all([f.finalizePaidBooking(id),f.finalizePaidBooking(id)]);
  assert.equal(f.calls.created,1);assert.equal(f.calls.intakeEmail,0);
});
test("Google failure keeps paid and pending; retry finishes without another payment",async()=>{
  const f=finalizerFixture({googleFails:1});await f.finalizePaidBooking(id);
  assert.equal(f.b.payment_status,"paid");assert.equal(f.b.status,"pending");assert.equal(f.b.finalization_status,"retryable");
  await f.finalizePaidBooking(id);assert.equal(f.b.status,"confirmed");assert.equal(f.calls.created,1);
});
test("Meet pending saves event identity, then reuses it on retry",async()=>{
  const f=finalizerFixture({meetPending:1});await f.finalizePaidBooking(id);
  assert.equal(f.b.google_event_id,"stable-event");assert.equal(f.b.status,"pending");
  await f.finalizePaidBooking(id);assert.equal(f.b.status,"confirmed");assert.equal(f.calls.created,1);
});
test("Resend failure preserves confirmed and paid; each recipient retries independently",async()=>{
  const f=finalizerFixture({emailFails:"coach"});await f.finalizePaidBooking(id);
  assert.equal(f.b.status,"confirmed");assert.equal(f.b.payment_status,"paid");assert.equal(f.calls.customer,1);
  await f.finalizePaidBooking(id);assert.equal(f.calls.customer,1);assert.equal(f.calls.coach,2);assert.equal(f.calls.created,1);
});
test("intake failure retries without duplicating booking emails or Calendar",async()=>{
  const f=finalizerFixture({intakeFails:1});await f.finalizePaidBooking(id);await f.finalizePaidBooking(id);
  assert.equal(f.calls.customer,1);assert.equal(f.calls.coach,1);assert.equal(f.calls.created,1);assert.equal(f.calls.intakeEmail,0);
});
test("cancelled and review-required bookings never activate intake or Calendar",async()=>{
  for(const flags of [{cancelled:true},{review:true}]){
    const f=finalizerFixture(flags);await f.finalizePaidBooking(id);assert.equal(f.calls.calendar,0);assert.equal(f.calls.intake,0);
  }
});
test("ambiguous email older than deduplication window requires review instead of duplicate send",async()=>{
  const f=finalizerFixture();f.b.stripe_customer_email_started_at="2020-01-01T00:00:00Z";
  await f.finalizePaidBooking(id);assert.equal(f.calls.customer,0);assert.equal(f.b.finalization_status,"review_required");
});

const signingStripe=new Stripe("sk_test_unit_only");
const signingSecret="whsec_unit_only_not_a_real_secret";
function webhookFixture(){
  let persisted=0,finalized=0;const scheduled=[];
  const modules=testModules({
    "next/server":{NextResponse:{json:response},after:fn=>scheduled.push(fn)},
    "@/lib/stripe/server":{getStripeTestClient:()=>signingStripe},
    "@/lib/stripe/webhook":{async applyStripeCheckoutEvent(){persisted++;return {accepted:true,booking_id:id};}},
    "@/lib/bookings/finalize-paid-booking":{async finalizePaidBooking(){finalized++;}},
  },{STRIPE_WEBHOOK_SECRET:signingSecret});
  return {...modules.load("src/app/api/webhooks/stripe/route.ts"),scheduled,get persisted(){return persisted;},get finalized(){return finalized;}};
}
test("webhook rejects invalid signature before persistence and side effects",async()=>{
  const f=webhookFixture();
  const result=await f.POST(new Request(`${site}/api/webhooks/stripe`,{method:"POST",headers:{"stripe-signature":"invalid"},body:"{}"}));
  assert.equal(result.status,400);assert.equal(f.persisted,0);assert.equal(f.finalized,0);
});
test("webhook verifies raw body, persists before scheduling finalization",async()=>{
  const f=webhookFixture(),payload=JSON.stringify({id:"evt_unit",type:"checkout.session.completed",livemode:false,data:{object:{}}});
  const signature=signingStripe.webhooks.generateTestHeaderString({payload,secret:signingSecret});
  const result=await f.POST(new Request(`${site}/api/webhooks/stripe`,{method:"POST",headers:{"stripe-signature":signature},body:payload}));
  assert.equal(result.status,200);assert.equal(f.persisted,1);assert.equal(f.finalized,0);
  await f.scheduled[0]();assert.equal(f.finalized,1);
});
test("even correctly signed live events are rejected in this local integration",async()=>{
  const f=webhookFixture(),payload=JSON.stringify({id:"evt_live_fake",livemode:true});
  const signature=signingStripe.webhooks.generateTestHeaderString({payload,secret:signingSecret});
  const result=await f.POST(new Request(`${site}/api/webhooks/stripe`,{method:"POST",headers:{"stripe-signature":signature},body:payload}));
  assert.equal(result.status,400);assert.equal(f.persisted,0);
});

for(const [label,booking,title] of [
  ["unpaid",{status:"pending",payment_status:"pending"},"Pago pendiente"],
  ["finalizing",{status:"pending",payment_status:"paid"},"Pago confirmado"],
  ["confirmed",{status:"confirmed",payment_status:"paid"},"Reserva confirmada"],
  ["expired",{status:"cancelled",payment_status:"pending",expired_at:"2026-01-01"},"El tiempo para completar el pago terminó"],
  ["review",{status:"pending",payment_status:"pending",finalization_status:"review_required"},"Estamos revisando tu pago"],
  ["Google error",{status:"pending",payment_status:"paid",finalization_status:"retryable"},"Pago confirmado"],
])test(`confirmation state: ${label}`,()=>{
  const {bookingConfirmationState}=testModules().load("src/lib/bookings/confirmation-state.ts");
  assert.equal(bookingConfirmationState(booking).title,title);
});

test("confirmation access requires the correct high-entropy credential, never a reference",()=>{
  const {hashBookingAccess,hasBookingAccess}=testModules().load("src/lib/stripe/access.ts");
  const token="a".repeat(64),hash=hashBookingAccess(token);
  assert.equal(hasBookingAccess(token,hash),true);
  assert.equal(hasBookingAccess("TEST-1",hash),false);
  assert.equal(hasBookingAccess("b".repeat(64),hash),false);
});

test("expired unknown Checkout is reconciled read-only, never created after hold deadline",async()=>{
  let creates=0,expires=0,applied=false;
  const booking={id,payment_flow:"stripe",payment_status:"pending",status:"pending",payment_expires_at:"2020-01-01",finalization_status:"not_started",
    stripe_expiration_last_attempt_at:null,stripe_expiration_reconciled_at:null};
  const attempt={id:attemptId,booking_id:id,stripe_checkout_session_id:null,amount_minor:50000,currency:"mxn",created_at:"2020-01-01"};
  const session={id:"cs_test_recovered",livemode:false,mode:"payment",client_reference_id:id,
    metadata:{booking_id:id,payment_attempt_id:attemptId},amount_total:50000,currency:"mxn",status:"open",expires_at:2100000000};
  const db={from(table){const q={select(){return q;},eq(){return q;},in(){return q;},neq(){return q;},lte(){return q;},order(){return q;},limit(){return q;},update(){return q;},is(){return q;},
    maybeSingle:async()=>({data:table==="bookings"?booking:attempt,error:null}),
    then(resolve){resolve({error:null});}};return q;},
    async rpc(name,args){assert.equal(name,"expire_stripe_booking_hold_v1");assert.equal(args.p_remote_expired,true);applied=true;return {data:true,error:null};}};
  const stripe={checkout:{sessions:{
    create(){creates++;throw new Error("must not create");},
    async list(){return {data:[session],has_more:false};},async expire(){expires++;return {...session,status:"expired"};},
  }}};
  const {expireStripeBookingHold}=testModules({"@/lib/stripe/server":{getStripeBookingAdmin:()=>db,getStripeTestClient:()=>stripe}}).load("src/lib/stripe/expire-hold.ts");
  assert.equal(await expireStripeBookingHold(id),true);assert.equal(creates,0);assert.equal(expires,1);assert.equal(applied,true);
});
