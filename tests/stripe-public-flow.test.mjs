import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { testModules } from "./helpers/load-typescript.mjs";
const legalAcceptance = testModules().load("src/lib/legal/acceptance.ts").currentBookingAcceptance;

const id="11111111-1111-4111-8111-111111111111",site="http://localhost:3000",token="a".repeat(64);
const flowId="22222222-2222-4222-8222-222222222222";
const hash=testModules().load("src/lib/stripe/access.ts").hashBookingAccess(token);
const fakeResponse={json:(data,init={})=>{const saved=[];return {data,status:init.status??200,cookies:{saved,set(...args){saved.push(args);}}};}};
function routeFixture(error=null,{creationFails=false}={}) {
  let holds=0,checkouts=0;const rpcArgs=[];
  const b={id,booking_reference:'PRIVATE-REFERENCE',created_at:'2026-10-29T12:00:00Z',
    booking_access_token_hash:hash,status:'pending',payment_status:'pending',payment_flow:'stripe',finalization_status:'not_started',
    payment_expires_at:'2035-01-01T12:30:00Z',expired_at:null,price_snapshot:'500.00',currency_snapshot:'MXN',
    legal_terms_accepted_at:'2026-10-29T12:00:00Z',legal_adult_confirmed_at:'2026-10-29T12:00:00Z',
    legal_terms_version:legalAcceptance.termsVersion,legal_privacy_notice_version:legalAcceptance.privacyNoticeVersion};
  const db={from(table){const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},
    not(){return q;},order(){return q;},limit(){return q;},async maybeSingle(){
      return {data:table==='bookings'&&filters.every(([k,v])=>b[k]===v)?{...b}:null,error:null};}};return q;},
    rpc:async(name,args)=>{
      if(name==='record_booking_legal_acceptance_v1') return {data:args.p_access_token_hash===hash,error:null};
      assert.equal(name,'create_stripe_booking_hold_with_legal_v1');
      assert.deepEqual(args.p_legal_acceptance,legalAcceptance);
      holds++;rpcArgs.push(args);return {data:{booking_id:id,booking_reference:'PRIVATE-REFERENCE',payment_expires_at:'2035-01-01T12:30:00Z'},error};}};
  const modules=testModules({
    "next/server":{NextResponse:fakeResponse},
    "@/lib/stripe/server":{getStripeTestSiteUrl:()=>site,getStripeTestClient:()=>({}),getStripeBookingAdmin:()=>db},
    "@/lib/bookings/finalize-paid-booking":{finalizePaidBooking:async()=>{throw new Error('Unpaid public flow must not finalize');}},
    "@/lib/stripe/checkout":{createOrRecoverCheckout:async()=>{checkouts++;if(creationFails)throw new Error("fixture checkout failure");return {url:"https://checkout.stripe.com/c/pay/cs_test_unit"};}},
    "@/lib/stripe/expire-hold":{expireDueStripeHolds:async()=>{}},
  });
  return {...modules.load("src/app/api/bookings/stripe/checkout/route.ts"),get holds(){return holds;},get checkouts(){return checkouts;},logs:modules.logs,rpcArgs};
}
const payload={service:"sesion-1-1",startsAt:"2035-01-01T12:00:00Z",name:"Test Customer",email:"test@example.test",flowId};
const request=(body=payload,origin=site,cookie=token)=>({headers:new Headers({origin}),json:async()=>({legalAcceptance,...body}),cookies:{get:()=>cookie?{value:cookie}:undefined}});
test("slot-conflict loser never reaches attempt/Checkout creation",async()=>{
  const f=routeFixture({message:"slot_conflict"});const result=await f.POST(request());
  assert.equal(result.status,409);assert.equal(result.data.code,"slot_conflict");assert.equal(f.holds,1);assert.equal(f.checkouts,0);
});
test("checkout route rejects client financial fields before creating any hold",async()=>{
  const f=routeFixture();const result=await f.POST(request({...payload,amount:1,currency:"usd",payment_status:"paid"}));
  assert.equal(result.status,409);assert.equal(f.holds,0);assert.equal(f.checkouts,0);
});
test("checkout route requires same-origin creation and does not log access credentials",async()=>{
  const f=routeFixture();const denied=await f.POST(request(payload,"https://other.example.test"));
  assert.equal(denied.status,403);assert.equal(f.holds,0);
  const allowed=await f.POST(request());assert.equal(allowed.status,200);assert.equal(f.checkouts,1);
  assert.equal(JSON.stringify(allowed.data).includes(token),false);
  assert.equal(JSON.stringify(f.logs).includes(token),false);
});

test("bootstrap sends a server-generated secret only in HttpOnly Set-Cookie, without creating a hold",async()=>{
  const f=routeFixture();
  const result=await f.POST(request(payload,site,null));
  assert.deepEqual(result.data,{requiresCookie:true});assert.equal(f.holds,0);assert.equal(f.checkouts,0);
  const [name,secret,options]=result.cookies.saved[0];
  assert.equal(name,`booking_flow_${flowId}`);assert.match(secret,/^[a-f0-9]{64}$/);
  assert.equal(options.httpOnly,true);assert.equal(options.sameSite,"lax");assert.equal(options.secure,false);
  assert.equal(options.path,"/api/bookings/stripe/checkout");assert.ok(options.maxAge>7190&&options.maxAge<=7200);
  assert.equal(JSON.stringify(result.data).includes(secret),false);assert.equal(JSON.stringify(f.logs).includes(secret),false);
  const next=await f.POST(request(payload,site,secret));
  assert.equal(f.holds,1);assert.equal(f.checkouts,1);
  const accessCookie=next.cookies.saved[0];
  assert.equal(accessCookie[0],`booking_access_${id}`);assert.equal(accessCookie[1],secret);
  assert.equal(f.rpcArgs[0].p_access_token_hash,testModules().load("src/lib/stripe/access.ts").hashBookingAccess(secret));
  assert.equal(JSON.stringify(next.data).includes(secret),false);
});

test("public flow ID and booking_reference alone cannot recover a private Checkout",async()=>{
  const f=routeFixture();
  for(const body of [{bookingId:id},{booking_reference:"PRIVATE-REFERENCE"},{bookingId:id,booking_reference:"PRIVATE-REFERENCE"},{...payload,flowToken:token}]) {
    const result=await f.POST(request(body,site,null));
    assert.notEqual(result.status,200);assert.equal(f.checkouts,0);assert.equal(f.holds,0);
  }
  const bootstrap=await f.POST(request(payload,site,null));
  assert.equal(bootstrap.data.checkoutUrl,undefined);assert.equal(f.checkouts,0);
});

test("Stripe hold cookie has fixed expiry and recovery does not renew it",async()=>{
  const f=routeFixture();
  const first=await f.POST(request());const retry=await f.POST(request());
  assert.equal(first.cookies.saved[0][2].expires.toISOString(),"2035-01-01T14:00:00.000Z");
  assert.equal(retry.cookies.saved[0][2].expires.getTime(),first.cookies.saved[0][2].expires.getTime());
  const recovered=await f.POST(request({bookingId:id}));
  assert.equal(recovered.status,200);assert.equal(recovered.cookies.saved.length,0);
});

test("checkout route passes the exact timestamp including microseconds to PostgreSQL",async()=>{
  const f=routeFixture();await f.POST(request({...payload,startsAt:"2035-01-01T12:00:00.123456Z"}));
  assert.equal(f.rpcArgs[0].p_starts_at,"2035-01-01T12:00:00.123456Z");
});

function confirmationFixture({valid=true,sessionMatches=true}={}) {
  const intakeToken='c'.repeat(64),destination=`${site}/formulario/${intakeToken}`;
  const b={id,booking_reference:"PRIVATE-REFERENCE",booking_access_token_hash:hash,status:"confirmed",payment_status:"paid",payment_flow:"stripe",finalization_status:"completed"};
  const attempt={id:'fixture-attempt',booking_id:id,stripe_checkout_session_id:'cs_test_fixture'};
  let form;
  const db={from(table){const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},
    not(){return q;},order(){return q;},limit(){return q;},async maybeSingle(){
      const row=table==='bookings'?b:table==='booking_intake_forms'?form:sessionMatches?attempt:null;
      return {data:row&&filters.every(([k,v])=>row[k]===v)?row:null,error:null};}};return q;}};
  const modules=testModules({
    "next/link":{default:()=>null},"next/headers":{cookies:async()=>({get:()=>({value:valid?token:"b".repeat(64)})})},
    "next/navigation":{redirect:url=>{throw Object.assign(new Error('NEXT_REDIRECT'),{location:url});}},
    "@/components/publico/Header":{default:()=>null},"@/components/publico/Footer":{default:()=>null},
    "@/components/publico/reservar/BookingStatusActions":{default:()=>null},
    "@/lib/supabase/admin":{getSupabaseAdmin:()=>db},"@/lib/stripe/server":{getStripeBookingAdmin:()=>db,getStripeTestSiteUrl:()=>site},
    "@/lib/bookings/finalize-paid-booking":{finalizePaidBooking:async()=>{throw new Error('Completed booking must not finalize again');}},
  },{INTAKE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64')});
  form={booking_id:id,source_type:'booking',status:'active',submitted_at:null,expires_at:'2099-01-01',
    access_token_hash:modules.load('src/lib/intake/intake-access.ts').hashIntakeToken(intakeToken),
    access_token_encrypted:modules.load('src/lib/intake/intake-token-crypto.ts').encryptIntakeToken(intakeToken)};
  return {page:modules.load("src/app/reservar/confirmada/page.tsx").default,destination};
}
test("confirmation page never exposes another booking from reference/session ID alone",async()=>{
  const {page}=confirmationFixture({valid:false});
  for(const params of [{ref:"PRIVATE-REFERENCE"},{booking:id,session_id:"cs_other"}]) {
    const result=JSON.stringify(await page({searchParams:Promise.resolve(params)}));
    assert.equal(result.includes("PRIVATE-REFERENCE"),false);assert.equal(result.includes("Reserva confirmada"),false);
    assert.equal(result.includes(token),false);assert.equal(result.includes(hash),false);
  }
});
test("confirmation page cross-checks session to authorized booking",async()=>{
  const {page}=confirmationFixture({sessionMatches:false});
  const result=JSON.stringify(await page({searchParams:Promise.resolve({booking:id,session_id:"cs_test_other"})}));
  assert.equal(result.includes("PRIVATE-REFERENCE"),false);
});
test("authorized paid confirmation redirects to its existing Intake without rendering payment HTML",async()=>{
  const {page,destination}=confirmationFixture();
  await assert.rejects(()=>page({searchParams:Promise.resolve({booking:id})}),error=>error.message==='NEXT_REDIRECT'&&error.location===destination);
});

const source=readFileSync(new URL("../src/components/publico/reservar/BookingFlow.tsx",import.meta.url),"utf8");
const ast=ts.createSourceFile("BookingFlow.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;
(function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==="handleConfirmReservation")handler=node;ts.forEachChild(node,visit);})(ast);
const compiled=ts.transpileModule(handler.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function browserFixture({packageFlow=false,free=false,stripeCheckoutEnabled=true,failFirst=false,bootstrap=false,name="Sesión 1:1",knownBooking=null,failAfterHold=false,accepted=true,recoveredStatus=null}={}) {
  const calls={posts:[],state:[],navigations:[],remembered:[],errors:[]},lock={current:false};let failed=false,bootstrapped=false;
  const currentService={slug:packageFlow?"proceso":"sesion-1-1",name:packageFlow?"Proceso":name,
    service_type:packageFlow?"package":"single",session_count:packageFlow?6:1,price:free?0:packageFlow?2500:500};
  const paymentPolicy=testModules().load("src/lib/bookings/payment-policy.ts");
  const currentServiceRequiresPayment=paymentPolicy.serviceRequiresPayment(currentService.price);
  const currentServiceCanUseStripe=paymentPolicy.canUsePublicStripeCheckout(currentService,stripeCheckoutEnabled);
  const context={
    termsAccepted:accepted,currentBookingAcceptance:legalAcceptance,
    reservationSubmissionLock:lock,submitting:false,setSubmitting:value=>calls.state.push(value),setFormError:message=>calls.errors.push(message),
    currentService,currentServiceRequiresPayment,currentServiceCanUseStripe,
    currentServicePaymentUnavailable:currentServiceRequiresPayment&&!currentServiceCanUseStripe,
    selectedDate:"2035-01-01",selectedSlot:{starts_at:"2035-01-01T12:00:00Z"},
    customerName:"Test Customer",customerEmail:"test@example.test",customerEmailConfirm:"test@example.test",customerPhone:"",customerNotes:"",isValidEmail:()=>true,
    stripeCheckoutEnabled,reservationRestartId:undefined,getBookingFlowId:async()=>flowId,
    withBookingFlowLock:async(_,work)=>work(),getBookingForFlow:()=>knownBooking,rememberBookingForFlow:(...args)=>calls.remembered.push(args),
    fetch:async(url,options)=>{calls.posts.push({url,body:JSON.parse(options.body)});if(failFirst&&!failed){failed=true;return {ok:false,json:async()=>({error:"temporary failure",...(failAfterHold?{bookingId:id,statusUrl:"/reservar/confirmada?ref=PRIVATE-REFERENCE"}:{})})};}if(bootstrap&&!bootstrapped){bootstrapped=true;return {ok:true,json:async()=>({requiresCookie:true})};}if(recoveredStatus)return {ok:true,json:async()=>({bookingId:id,...recoveredStatus})};return {ok:true,json:async()=>free?{bookingReference:"FREE-1"}:packageFlow?{bookingReference:"PACKAGE-1"}:{bookingId:id,checkoutUrl:"https://checkout.stripe.com/c/pay/cs_test_unit"}};},
    router:{replace:url=>calls.navigations.push(url)},window:{location:{assign:url=>calls.navigations.push(url)}},console:{error(){}},
  };
  const run=new Function(...Object.keys(context),`${compiled}\nreturn handleConfirmReservation;`)(...Object.values(context));
  return {calls,lock,run:()=>run({preventDefault(){}})};
}
test("Stripe browser double click sends one POST and keeps lock through external redirect",async()=>{
  const f=browserFixture();await Promise.all([f.run(),f.run()]);await f.run();
  assert.equal(f.calls.posts.length,1);assert.equal(f.calls.posts[0].url,"/api/bookings/stripe/checkout");
  assert.equal(f.calls.posts[0].body.flowId,flowId);assert.equal(f.calls.posts[0].body.price,undefined);
  assert.equal(JSON.stringify(f.calls.posts).includes(token),false);
  assert.equal(f.lock.current,true);assert.deepEqual(f.calls.state,[true]);
});
test("Stripe browser real failure releases lock and retry retains public flow identity",async()=>{
  const f=browserFixture({failFirst:true});await f.run();assert.equal(f.lock.current,false);await f.run();
  assert.equal(f.calls.posts.length,2);assert.equal(f.calls.posts[0].body.flowId,f.calls.posts[1].body.flowId);
  assert.equal(f.lock.current,true);
});
test("paid package cannot fall through to the legacy booking endpoint",async()=>{
  const f=browserFixture({packageFlow:true});await f.run();
  assert.deepEqual(f.calls.posts,[]);assert.deepEqual(f.calls.navigations,[]);
  assert.match(f.calls.errors.at(-1),/pago en línea no está disponible/);assert.equal(f.lock.current,false);
});

test("paid 1:1 does not create a legacy confirmed booking when public Stripe is unavailable",async()=>{
  const f=browserFixture({stripeCheckoutEnabled:false});await f.run();
  assert.deepEqual(f.calls.posts,[]);assert.deepEqual(f.calls.navigations,[]);
  assert.match(f.calls.errors.at(-1),/No se creó una reserva/);assert.equal(f.lock.current,false);
});

test("an explicitly free service retains its legacy booking path",async()=>{
  const f=browserFixture({free:true});await f.run();
  assert.equal(f.calls.posts[0].url,"/api/bookings");
  assert.deepEqual(f.calls.navigations,["/reservar/confirmada?ref=FREE-1"]);
  assert.equal(f.lock.current,true);
});

test("renamed service still follows Stripe branch and cookie bootstrap stays under submission lock",async()=>{
  const f=browserFixture({name:"Consulta personalizada",bootstrap:true});
  await Promise.all([f.run(),f.run()]);
  assert.equal(f.calls.posts.length,2);assert.deepEqual(f.calls.posts[0],f.calls.posts[1]);
  assert.equal(f.calls.posts[0].body.flowId,flowId);assert.equal(JSON.stringify(f.calls.posts).includes(token),false);
  assert.deepEqual(f.calls.remembered,[[flowId,id]]);assert.deepEqual(f.calls.state,[true]);
});

test("another tab resumes using public booking ID and browser cookie rather than sending a secret",async()=>{
  const f=browserFixture({knownBooking:id});await f.run();
  assert.deepEqual(f.calls.posts[0].body,{bookingId:id,legalAcceptance});
  assert.equal(JSON.stringify(f.calls).includes(token),false);
});

for(const state of ['paid','processing'])test(`existing ${state} booking follows its successful status response without demanding another Checkout`,async()=>{
  const statusUrl='/reservar/confirmada?ref=PRIVATE-REFERENCE';
  const privateIntakeUrl=`http://localhost:3000/formulario/${'d'.repeat(64)}`;
  const f=browserFixture({knownBooking:id,recoveredStatus:{statusUrl,
    ...(state==='paid'?{redirectIntakeUrl:privateIntakeUrl}:{})}});
  await Promise.all([f.run(),f.run()]);await f.run();
  assert.deepEqual(f.calls.posts,[{url:'/api/bookings/stripe/checkout',body:{bookingId:id,legalAcceptance}}]);
  assert.deepEqual(f.calls.navigations,[statusUrl]);
  assert.deepEqual(f.calls.remembered,[[flowId,id]]);
  assert.equal(f.calls.errors.filter(Boolean).length,0);
  assert.equal(f.lock.current,true);
  assert.deepEqual(f.calls.state,[true]);
  assert.equal(JSON.stringify(f.calls).includes(privateIntakeUrl),false);
});

for(const statusUrl of ['https://other.example.test/reservar/confirmada','//other.example.test/reservar/confirmada','/reservar/confirmada-other?ref=PRIVATE-REFERENCE'])test(`recovery does not navigate to an invalid status destination (${statusUrl})`,async()=>{
  const f=browserFixture({knownBooking:id,recoveredStatus:{statusUrl}});
  await f.run();
  assert.deepEqual(f.calls.navigations,[]);
  assert.equal(f.calls.posts.length,1);
  assert.equal(f.lock.current,false);
  assert.match(f.calls.errors.at(-1),/No fue posible preparar el pago/);
});

test("reload and two tabs reuse the same browser flow identity",async()=>{
  const descriptors=Object.fromEntries(["crypto","navigator","localStorage"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const values=new Map(),queues=new Map();
  Object.defineProperty(globalThis,"crypto",{configurable:true,value:webcrypto});
  Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{get length(){return values.size;},key:i=>[...values.keys()][i]??null,removeItem:key=>values.delete(key),getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}});
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{locks:{request(key,callback){const next=(queues.get(key)??Promise.resolve()).then(callback);queues.set(key,next);return next;}}}});
  try {
    const module=()=>testModules().load("src/lib/stripe/browser-flow.ts");
    const get=()=>module().getBookingFlowId;
    values.set("edna-booking-flow/old-implementation",token);
    const [first,second]=await Promise.all([get()(payload),get()(payload)]);
    assert.equal(first,second);assert.equal(await get()(payload),first);assert.equal(values.size,1);
    assert.match(first,/^[a-f0-9-]{36}$/);assert.equal([...values.values()].includes(token),false);
    module().rememberBookingForFlow(first,id);
    assert.equal(module().getBookingForFlow(first),id);
    assert.ok([...values.values()].every(value=>/^[a-f0-9-]{36}$/.test(value)));
    assert.equal(JSON.stringify([...values]).includes(token),false);
    const order=[];
    await Promise.all([module().withBookingFlowLock(first,async()=>{order.push(1);await new Promise(resolve=>setTimeout(resolve,10));order.push(2);}),module().withBookingFlowLock(first,async()=>{order.push(3);})]);
    assert.deepEqual(order,[1,2,3]);
    assert.notEqual(await get()({...payload,restart:id}),first);
  } finally {
    for(const [key,descriptor] of Object.entries(descriptors)){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  }
});


test("Checkout failure after hold returns same-booking reference URL and private cookie",async()=>{
  const f=routeFixture(null,{creationFails:true}),result=await f.POST(request());
  assert.equal(result.status,409);assert.equal(f.holds,1);assert.equal(f.checkouts,1);
  assert.equal(result.data.statusUrl,"/reservar/confirmada?ref=PRIVATE-REFERENCE");
  assert.equal(result.cookies.saved[0][0],`booking_access_${id}`);
  assert.equal(JSON.stringify(result.data).includes(token),false);
});
test("failure before creating hold stays in form; post-hold failure navigates automatically",async()=>{
  const before=browserFixture({failFirst:true});await before.run();
  assert.deepEqual(before.calls.navigations,[]);assert.equal(before.calls.errors.at(-1),"temporary failure");
  const after=browserFixture({failFirst:true,failAfterHold:true});await after.run();
  assert.deepEqual(after.calls.navigations,["/reservar/confirmada?ref=PRIVATE-REFERENCE"]);
  assert.deepEqual(after.calls.remembered,[[flowId,id]]);assert.equal(after.calls.errors.filter(Boolean).length,0);
});
test("Stripe booking form labels payment and explains the hold without starting a countdown",()=>{
  assert.match(source,/Proceder al pago/);assert.match(source,/Preparando pago…/);
  assert.match(source,/Tu horario quedará apartado 30 minutos mientras completas el pago\./);
  assert.doesNotMatch(source,/holdRemainingSeconds|payment_expires_at/);
});

test("booking form refuses creation and recovery before the unchecked terms are accepted",async()=>{
  for(const options of [{},{knownBooking:id},{packageFlow:true}]) {
    const f=browserFixture({...options,accepted:false});await f.run();
    assert.deepEqual(f.calls.posts,[]);assert.deepEqual(f.calls.navigations,[]);
    assert.match(f.calls.errors.at(-1),/Términos y Condiciones/);
    assert.equal(f.lock.current,false);
  }
});
