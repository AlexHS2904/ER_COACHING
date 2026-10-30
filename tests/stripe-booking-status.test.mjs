import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { testModules } from './helpers/load-typescript.mjs';
const legalAcceptance = testModules().load('src/lib/legal/acceptance.ts').currentBookingAcceptance;

const id='11111111-1111-4111-8111-111111111111',site='http://localhost:3000',token='a'.repeat(64);
const env={INTAKE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,11).toString('base64')};
function destinationFixture(changes={},formChanges={},access=token) {
  let reads=0;
  const db={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){reads++;return {data:form,error:null};}};}};
  const modules=testModules({'@/lib/stripe/server':{getStripeBookingAdmin:()=>db,getStripeTestSiteUrl:()=>site}},env);
  const crypto=modules.load('src/lib/intake/intake-token-crypto.ts');
  const hash=modules.load('src/lib/intake/intake-access.ts').hashIntakeToken(token);
  const form={booking_id:id,source_type:'booking',status:'active',submitted_at:null,expires_at:'2036-01-01',access_token_hash:hash,access_token_encrypted:crypto.encryptIntakeToken(token),...formChanges};
  const booking={id,booking_access_token_hash:hash,status:'confirmed',payment_status:'paid',payment_flow:'stripe',finalization_status:'completed',...changes};
  return {run:()=>modules.load('src/lib/bookings/intake-destination.ts').bookingIntakeDestination(booking,access),get reads(){return reads;}};
}

test('authorized paid finalized booking obtains its existing intake URL',async()=>{
  const f=destinationFixture();assert.deepEqual(await f.run(),{status:'available',redirectIntakeUrl:`${site}/formulario/${token}`});assert.equal(f.reads,1);
});
for(const access of [undefined,'ER-REFERENCE','b'.repeat(64)])test(`reference or missing/wrong cookie never obtains intake URL (${String(access).length})`,async()=>{
  const f=destinationFixture({}, {},access===undefined?null:access);assert.deepEqual(await f.run(),{status:'waiting',redirectIntakeUrl:null});assert.equal(f.reads,0);
});
for(const change of [{payment_status:'pending'},{status:'cancelled'},{finalization_status:'processing'},{finalization_status:'retryable'},{finalization_status:'review_required'}])test(`paid flow waits for secure finalization: ${JSON.stringify(change)}`,async()=>{
  const f=destinationFixture(change);assert.equal((await f.run()).redirectIntakeUrl,null);assert.equal(f.reads,0);
});
test('submitted intake shows completed state and never redirects',async()=>{
  const f=destinationFixture({}, {status:'submitted',submitted_at:'2026-10-28',access_token_encrypted:null});
  assert.deepEqual(await f.run(),{status:'submitted',redirectIntakeUrl:null});
});
for(const change of [{booking_id:'other'},{source_type:'manual'},{status:'revoked'},{expires_at:'2020-01-01'},{access_token_hash:'b'.repeat(64)},{access_token_encrypted:'corrupt'}])test(`unsafe intake never returns a token: ${Object.keys(change)[0]} ${String(Object.values(change)[0]).length}`,async()=>{
  assert.deepEqual(await destinationFixture({},change).run(),{status:'unavailable',redirectIntakeUrl:null});
});

test('countdown derives only from the original deadline across refresh and successor',()=>{
  const {holdRemainingSeconds,formatHoldRemaining}=testModules().load('src/lib/bookings/hold-countdown.ts');
  const start=Date.parse('2035-01-01T12:00:00Z'),deadline='2035-01-01T12:30:00Z';
  assert.equal(holdRemainingSeconds(deadline,start),1800);
  assert.equal(formatHoldRemaining(holdRemainingSeconds(deadline,start,79_000)),'28:41');
  const afterRefresh=start+120_000;assert.equal(holdRemainingSeconds(deadline,afterRefresh),1680);
  const afterSuccessor=start+180_000;assert.equal(holdRemainingSeconds(deadline,afterSuccessor),1620);
  assert.equal(holdRemainingSeconds(deadline,afterSuccessor,2_000_000),0);
});

test('deadline zero never declares released until server records cancellation',()=>{
  const {bookingConfirmationState:state}=testModules().load('src/lib/bookings/confirmation-state.ts');
  const b={payment_flow:'stripe',status:'pending',payment_status:'pending',payment_expires_at:'2020-01-01'};
  const checking=state(b);assert.equal(checking.title,'Estamos verificando tu reserva');assert.equal(checking.refresh,true);
  const expired=state({...b,status:'cancelled',expired_at:'2020-01-01'});
  assert.match(expired.detail,/horario fue liberado/);assert.equal(expired.refresh,false);
});

test('paid UI waits, redirects, handles submitted and keeps review safe',()=>{
  const {bookingConfirmationState:state}=testModules().load('src/lib/bookings/confirmation-state.ts');
  const b={payment_flow:'stripe',status:'confirmed',payment_status:'paid',finalization_status:'processing'};
  assert.equal(state(b).title,'Pago confirmado');assert.equal(state(b).refresh,true);
  assert.match(state({...b,finalization_status:'completed'},'available').title,/Redirigiendo/);
  assert.equal(state({...b,finalization_status:'completed'},'submitted').title,'Formulario completado');
  assert.equal(state({...b,finalization_status:'review_required'},'available').refresh,false);
});

function actionsFixture(props={},accepted=false) {
  const effects=[],states=[],navigation=[];let stateIndex=0;
  const modules=testModules({
    react:{useRef:value=>({current:value}),useState:initial=>{const value=stateIndex++===2?accepted:(typeof initial==='function'?initial():initial);return [value,v=>states.push(v)];},useEffect:effect=>effects.push(effect)},
    'next/navigation':{useRouter:()=>({replace:url=>navigation.push(url),refresh:()=>navigation.push('refresh')})},
  });
  const component=modules.load('src/components/publico/reservar/BookingStatusActions.tsx').default;
  const tree=component({bookingId:id,refresh:false,canPay:false,paymentExpiresAt:null,serverNow:0,redirectIntakeUrl:null,legalAccepted:false,...props});
  return {tree,effects,states,navigation,LegalAcceptance:modules.load('src/components/legal/BookingLegalAcceptance.tsx').default};
}
function mockDocumentNavigation(t,replace,assign=()=>{}) {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{replace,assign,origin:site}}});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;});
}
test('authorized intake uses document navigation without waiting for App Router',t=>{
  const documents=[];mockDocumentNavigation(t,url=>documents.push(url));
  const url=`${site}/formulario/${token}`,f=actionsFixture({redirectIntakeUrl:url});
  f.effects[0]();assert.deepEqual(documents,[url]);assert.deepEqual(f.navigation,[]);
  const denied=actionsFixture();denied.effects[0]();assert.deepEqual(documents,[url]);assert.deepEqual(denied.navigation,[]);
});
test('authorized intake retains a usable link if automatic document navigation is blocked',t=>{
  mockDocumentNavigation(t,()=>{throw new Error('Browser blocked automatic navigation');});
  const url=`${site}/formulario/${token}`,f=actionsFixture({redirectIntakeUrl:url});
  assert.doesNotThrow(()=>f.effects[0]());
  const link=f.tree.props.children.find(child=>child?.type==='a');
  assert.equal(link.props.href,url);assert.equal(link.props.children,'Continuar al formulario');
  assert.equal(link.props.referrerPolicy,'no-referrer');assert.deepEqual(f.navigation,[]);
});
test('waiting or inaccessible intake never renders a private fallback link',()=>{
  for(const props of [{},{refresh:true}]) {
    const f=actionsFixture(props);
    assert.equal(f.tree.props.children.some(child=>child?.type==='a'),false);
  }
});
test('actual countdown ticks each second and refreshes server once at zero without making financial writes',t=>{
  let elapsed=0;t.mock.method(performance,'now',()=>elapsed);t.mock.timers.enable({apis:['setInterval']});
  const f=actionsFixture({canPay:true,paymentExpiresAt:'1970-01-01T00:00:02Z',serverNow:0});
  const cleanup=f.effects[1]();elapsed=1000;t.mock.timers.tick(1000);assert.equal(f.states.at(-1),1);
  elapsed=2000;t.mock.timers.tick(1000);assert.equal(f.states.at(-1),0);assert.deepEqual(f.navigation,['refresh']);
  elapsed=4000;t.mock.timers.tick(2000);assert.deepEqual(f.navigation,['refresh']);cleanup();
});
test('paid status has no countdown or payment button',()=>{
  const f=actionsFixture({refresh:true});const text=JSON.stringify(f.tree);
  assert.equal(text.includes('Tiempo restante'),false);assert.equal(text.includes('Reintentar pago'),false);
});

test('Google Calendar insert, reschedule and cancel never invite a customer or request all notifications',async()=>{
  const calls=[];
  const events={async insert(params){calls.push(params);return {data:{id:'fixture'}};},async patch(params){calls.push(params);return {data:{id:'fixture'}};},async delete(params){calls.push(params);}};
  const modules=testModules({
    googleapis:{google:{calendar:()=>({events})}},'@/lib/google/oauth':{getGoogleOAuthClient:()=>({setCredentials(){}})},
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{refresh_token:'fixture-only'},error:null})})})})})},
  });
  const calendar=modules.load('src/lib/google/calendar.ts');
  await calendar.createGoogleCalendarEvent({bookingReference:'FIXTURE',serviceName:'Servicio',customerName:'Fixture',customerEmail:'customer@example.test',startsAt:'2035-01-01T12:00:00Z',endsAt:'2035-01-01T13:30:00Z'});
  await calendar.updateGoogleCalendarEvent({eventId:'fixture',startsAt:'2035-01-02T12:00:00Z',endsAt:'2035-01-02T13:30:00Z'});
  await calendar.deleteGoogleCalendarEvent('fixture');
  assert.equal(calls.length,3);for(const c of calls){assert.equal(c.calendarId,'primary');assert.equal(c.sendUpdates,'none');assert.equal((c.requestBody?.attendees??[]).length,0);}
  assert.equal(calls[0].requestBody.conferenceData.createRequest.conferenceSolutionKey.type,'hangoutsMeet');
});

test('customer calendar template has correct times and Meet, without attendee or intake token',()=>{
  const {customerCalendarLink}=testModules().load('src/lib/google/calendar-link.ts');
  const url=new URL(customerCalendarLink({serviceName:'Servicio',bookingReference:'FIXTURE',startsAt:'2035-01-01T12:00:00Z',durationMinutes:90,meetUrl:'https://meet.google.com/test-only'}));
  assert.equal(url.searchParams.get('action'),'TEMPLATE');assert.equal(url.searchParams.get('dates'),'20350101T120000Z/20350101T133000Z');
  assert.equal(url.searchParams.get('ctz'),'America/Mexico_City');assert.equal(url.searchParams.has('add'),false);assert.equal(url.toString().includes('/formulario/'),false);
});

test('recovery button retries the existing booking and releases loading on safe status redirect',async t=>{
  const f=actionsFixture({canPay:true,paymentExpiresAt:'2035-01-01T12:30:00Z',serverNow:Date.parse('2035-01-01T12:00:00Z')},true);
  const group=f.tree.props.children.find(child=>child?.type==='div'&&child.props.className==='mx-auto max-w-lg');
  const button=group.props.children.find(child=>child?.type==='button');assert.ok(button);
  const posts=[];t.mock.method(globalThis,'fetch',async(url,options)=>{posts.push({url,body:JSON.parse(options.body)});return {ok:false,json:async()=>({statusUrl:'/reservar/confirmada?ref=FIXTURE',error:'Puedes reintentar el pago.'})};});
  await button.props.onClick();assert.deepEqual(posts,[{url:'/api/bookings/stripe/checkout',body:{bookingId:id,legalAcceptance}}]);
  assert.deepEqual(f.navigation,['/reservar/confirmada?ref=FIXTURE','refresh']);assert.equal(f.states.at(-1),'Puedes reintentar el pago.');assert.ok(f.states.includes(false));
});

const validHoldProps={canPay:true,paymentExpiresAt:'2035-01-01T12:30:00Z',serverNow:Date.parse('2035-01-01T12:00:00Z')};
function paymentGroup(f) {
  return f.tree.props.children.find(child=>child?.type==='div'&&child.props.className==='mx-auto max-w-lg');
}
function retryButton(f) { return paymentGroup(f)?.props.children.find(child=>child?.type==='button'); }

test('durable current acceptance hides repeated checkboxes and permits retry without a new declaration',async t=>{
  const f=actionsFixture({...validHoldProps,legalAccepted:true});
  assert.equal(paymentGroup(f).props.children.some(child=>child?.type===f.LegalAcceptance),false);
  assert.equal(retryButton(f).props.disabled,false);
  const requests=[],documents=[];
  mockDocumentNavigation(t,()=>{},url=>documents.push(url));
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    requests.push({url,body:JSON.parse(options.body)});
    return {ok:true,json:async()=>({checkoutUrl:'https://checkout.stripe.com/c/pay/fixture-only'})};
  });
  await retryButton(f).props.onClick();
  assert.deepEqual(requests,[{url:'/api/bookings/stripe/checkout',body:{bookingId:id}}]);
  assert.deepEqual(documents,['https://checkout.stripe.com/c/pay/fixture-only']);
});

test('retry still needs an explicit unchecked acceptance when durable evidence is absent',async t=>{
  const f=actionsFixture(validHoldProps);
  assert.equal(paymentGroup(f).props.children.some(child=>child?.type===f.LegalAcceptance),true);
  assert.equal(retryButton(f).props.disabled,true);
  const requests=[];t.mock.method(globalThis,'fetch',async()=>requests.push('unexpected'));
  await retryButton(f).props.onClick();
  assert.deepEqual(requests,[]);
  assert.match(f.states.at(-1),/Lee y acepta/);
});

test('an already paid retry follows its successful status response without claiming a failed payment',async t=>{
  const f=actionsFixture({...validHoldProps,legalAccepted:true});
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({statusUrl:'/reservar/confirmada?ref=FIXTURE'})}));
  await retryButton(f).props.onClick();
  assert.deepEqual(f.navigation,['/reservar/confirmada?ref=FIXTURE','refresh']);
  assert.equal(f.states.some(value=>typeof value==='string'&&value.length>0),false);
});

test('an authorized paid response opens the existing Intake instead of another Checkout',async t=>{
  const f=actionsFixture({...validHoldProps,legalAccepted:true}),documents=[];
  mockDocumentNavigation(t,url=>documents.push(url));
  const url=`${site}/formulario/${token}`;
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({redirectIntakeUrl:url})}));
  await retryButton(f).props.onClick();
  assert.deepEqual(documents,[url]);assert.deepEqual(f.navigation,[]);
});

for(const redirectIntakeUrl of ['https://example.test/formulario/'+token,'javascript:alert(1)',site+'/formulario/invalid',site+'/formulario/'+token+'?copy=1']) {
  test(`retry rejects an unsafe Intake destination (${redirectIntakeUrl.startsWith(site)?'invalid private path':'external origin'})`,async t=>{
    const f=actionsFixture({...validHoldProps,legalAccepted:true}),documents=[];
    mockDocumentNavigation(t,url=>documents.push(url));
    t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({redirectIntakeUrl})}));
    await retryButton(f).props.onClick();
    assert.deepEqual(documents,[]);assert.deepEqual(f.navigation,[]);
    assert.ok(f.states.some(value=>typeof value==='string'&&/verificar el acceso/.test(value)));
  });
}

test('payment processing hides retry and repeated acceptance even with a stale canPay prop',()=>{
  const f=actionsFixture({...validHoldProps,processing:true});
  assert.equal(paymentGroup(f),undefined);
  assert.ok(f.tree.props.children.some(child=>child?.type==='span'&&child.props.role==='status'));
});

function changeRouteFixture(kind,{dbFailure=false,emailWarning=null,stripe=false}={}) {
  const calls=[],b={id,status:'confirmed',payment_flow:stripe?'stripe':null,booking_reference:'FIXTURE',customer_name:'Fixture',google_event_id:'event',starts_at:'2035-01-01T12:00:00Z',ends_at:'2035-01-01T13:30:00Z'};
  const db={from(){let update=false;const q={select(){return q;},eq(){return q;},in(){return q;},update(){calls.push('save');update=true;return q;},async maybeSingle(){return update?{data:dbFailure?null:{...b,status:kind==='cancel'?'cancelled':'confirmed'},error:dbFailure?{message:'test storage error'}:null}:{data:b,error:null};}};return q;},rpc:async()=>({data:[{starts_at:'2035-01-02T12:00:00Z',ends_at:'2035-01-02T13:30:00Z'}],error:null})};
  const auth={auth:{getClaims:async()=>({data:{claims:{sub:'admin'}}})},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{user_id:'admin',active:true},error:null})})};
  const modules=testModules({
    'next/server':{NextResponse:{json:(data,init={})=>({data,status:init.status??200})}},
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>db},'@/lib/supabase/server':{createClient:async()=>auth},
    '@/lib/google/calendar':{updateGoogleCalendarEvent:async()=>calls.push('calendar'),deleteGoogleCalendarEvent:async()=>calls.push('calendar')},
    '@/lib/email/send-booking-change-email':{sendBookingChangeEmail:async(bookingId,notice)=>{assert.equal(bookingId,id);calls.push(`email:${notice}`);return emailWarning;}},
  });
  const route=modules.load(`src/app/api/bookings/[id]/${kind}/route.ts`);
  return {calls,run:()=>route.POST({json:async()=>({startsAt:'2035-01-02T12:00:00Z'})},{params:Promise.resolve({id})})};
}
for(const [kind,notice] of [['reschedule','rescheduled'],['cancel','cancelled']]) {
  test(`${kind} sends our email after saving, and preserves success with an email warning`,async()=>{
    const f=changeRouteFixture(kind,{emailWarning:'Correo pendiente de revisión'}),r=await f.run();
    assert.equal(r.status,200);assert.equal(r.data.emailWarning,'Correo pendiente de revisión');
    assert.ok(f.calls.indexOf(`email:${notice}`)>f.calls.indexOf('save'));
  });
  test(`${kind} does not send mail when the business save fails or Stripe admin guard applies`,async()=>{
    for(const flags of [{dbFailure:true},{stripe:true}]) {
      const f=changeRouteFixture(kind,flags),r=await f.run();assert.notEqual(r.status,200);
      assert.equal(f.calls.some(c=>c.startsWith('email:')),false);
    }
  });
}

function submittedIntakeFixture({expired=false}={}) {
  let writes=0;
  const modules=testModules({
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>({from:table=>{
      let found=false;
      const q={select(){return q;},eq(column,value){found=table==='bookings'?value===id:column==='access_token_hash'&&value===hash;return q;},
        async maybeSingle(){return {data:found?(table==='bookings'?{id,status:'confirmed',payment_status:'paid',customer_name:'Fixture',customer_email:'customer@example.test'}:form):null,error:null};},
        update(){writes++;throw new Error('submitted intake must not be changed');}};
      return q;
    }})},
    'next/navigation':{notFound(){throw new Error('notFound');}},
    'next/server':{NextResponse:{json:(data,init={})=>({data,status:init.status??200})}},
    '@/components/intake/IntakeFormWizard':{default:()=>null},
    '@/lib/email/send-intake-subimssion-mail':{sendIntakeSubmissionEmail:()=>{throw new Error('no second email');}},
  });
  const hash=modules.load('src/lib/intake/intake-access.ts').hashIntakeToken(token);
  const form={id:'fixture',booking_id:id,source_type:'booking',invitee_name:'Fixture',invitee_email:'customer@example.test',status:'submitted',submitted_at:'2026-10-28',expires_at:expired?'2020-01-01':'2036-01-01'};
  return {page:modules.load('src/app/formulario/[token]/page.tsx').default,api:modules.load('src/app/api/intake/[token]/route.ts'),get writes(){return writes;}};
}
for(const expired of [false,true])test(`canonical URL shows completed intake without reopening it (expired=${expired})`,async()=>{
  const f=submittedIntakeFixture({expired});
  const page=await f.page({params:Promise.resolve({token})});
  assert.equal(page.props.title,'Este formulario ya fue completado.');assert.equal(f.writes,0);
});
test('submitted intake rejects a second final submission and progress save before any write',async()=>{
  const f=submittedIntakeFixture(),params={params:Promise.resolve({token})};
  const request={json:async()=>{throw new Error('must not even read a second submission');}};
  for(const method of ['POST','PATCH'])assert.equal((await f.api[method](request,params)).status,409);
  assert.equal(f.writes,0);
});
test('canonical submitted page and API still require the original private token',async()=>{
  const f=submittedIntakeFixture();
  await assert.rejects(f.page({params:Promise.resolve({token:'b'.repeat(64)})}),/notFound/);
  assert.equal((await f.api.POST({}, {params:Promise.resolve({token:'ER-REFERENCE'})})).status,404);
  assert.equal(f.writes,0);
});
