import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const id='11111111-1111-4111-8111-111111111111',token='a'.repeat(64);
const acceptance=testModules().load('src/lib/legal/acceptance.ts').currentBookingAcceptance;
const hash=testModules().load('src/lib/stripe/access.ts').hashBookingAccess(token);
class Redirect extends Error { constructor(url){super('redirect');this.url=url;} }

function fixture({changes={},observation='unpaid',intake={status:'waiting',redirectIntakeUrl:null},cookie=token,invalidSession=false}={}) {
  const booking={id,booking_reference:'PRIVATE-REFERENCE',booking_access_token_hash:hash,
    payment_flow:'stripe',status:'pending',payment_status:'pending',finalization_status:'not_started',
    payment_expires_at:'2099-01-01T12:30:00Z',expired_at:null,
    legal_terms_accepted_at:'2026-10-30T12:00:00Z',legal_adult_confirmed_at:'2026-10-30T12:00:00Z',
    legal_terms_version:acceptance.termsVersion,legal_privacy_notice_version:acceptance.privacyNoticeVersion,...changes};
  const calls=[];
  const db={from(){const query={select(){return query;},eq(){return query;},maybeSingle:async()=>({data:booking,error:null})};return query;}};
  const Actions=()=>null;
  const modules=testModules({
    'next/navigation':{redirect:url=>{throw new Redirect(url);}},
    'next/link':{default:()=>null},'next/headers':{cookies:async()=>({get:()=>cookie?{value:cookie}:undefined})},
    '@/components/publico/Header':{default:()=>null},'@/components/publico/Footer':{default:()=>null},
    '@/components/publico/reservar/BookingStatusActions':{__esModule:true,default:Actions},
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>db},'@/lib/stripe/server':{getStripeBookingAdmin:()=>db},
    '@/lib/stripe/checkout-return':{reconcileStripeCheckoutReturn:async(bookingId,access,sessionId)=>{
      calls.push({bookingId,access,sessionId});
      if(invalidSession)throw new Error('Session mismatch');
      return {booking,intake,observation};
    }},
  });
  return {calls,Actions,run:params=>modules.load('src/app/reservar/confirmada/page.tsx').default({searchParams:Promise.resolve({ref:booking.booking_reference,...params})})};
}
function nodes(node){if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}

for(const label of ['payment reconciled on return','webhook already finalized','refresh'])test(`${label} redirects server-side without rendering payment or legal controls`,async()=>{
  const url=`http://localhost:3000/formulario/${'b'.repeat(64)}`;
  const f=fixture({changes:{status:'confirmed',payment_status:'paid',finalization_status:'completed'},
    observation:'paid',intake:{status:'available',redirectIntakeUrl:url}});
  await assert.rejects(f.run({session_id:'cs_test_fixture'}),error=>error instanceof Redirect&&error.url===url);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].sessionId,'cs_test_fixture');
});

test('pending and canceled Checkout retain the existing contract without repeating checkboxes',async()=>{
  const f=fixture(),tree=await f.run();
  assert.match(JSON.stringify(tree),/Pago pendiente/);
  const action=nodes(tree).find(node=>node.type===f.Actions);
  assert.equal(action.props.legalAccepted,true);
  assert.equal(action.props.canPay,true);
  assert.equal(action.props.paymentExpiresAt,'2099-01-01T12:30:00Z');
});

for(const observation of ['processing','unknown'])test(`${observation} never renders pending payment or permits retry`,async()=>{
  const f=fixture({observation}),tree=await f.run();
  assert.match(JSON.stringify(tree),/Pago en proceso/);
  assert.equal(JSON.stringify(tree).includes('Pago pendiente'),false);
  const action=nodes(tree).find(node=>node.type===f.Actions);
  assert.equal(action.props.canPay,false);assert.equal(action.props.processing,true);
  assert.equal(action.props.paymentExpiresAt,null);
});

test('expired canceled hold offers a new slot and never reuses the old hold',async()=>{
  const f=fixture({changes:{status:'cancelled',expired_at:'2026-10-30T12:30:00Z',payment_expires_at:'2026-10-30T12:30:00Z'}});
  const tree=await f.run();assert.match(JSON.stringify(tree),/Elegir otro horario/);
  assert.equal(nodes(tree).find(node=>node.type===f.Actions).props.canPay,false);
});

test('submitted Intake stays completed and does not redirect to an editable form',async()=>{
  const f=fixture({changes:{status:'confirmed',payment_status:'paid',finalization_status:'completed'},observation:'paid',
    intake:{status:'submitted',redirectIntakeUrl:null}});
  const tree=await f.run();assert.match(JSON.stringify(tree),/Formulario completado/);
  assert.equal(nodes(tree).find(node=>node.type===f.Actions).props.canPay,false);
});

test('reference alone and mismatched Session never expose private booking information',async()=>{
  for(const flags of [{cookie:null},{cookie:'c'.repeat(64)},{invalidSession:true}]){
    const f=fixture(flags),tree=await f.run({session_id:'cs_test_other'});
    const serialized=JSON.stringify(tree);
    assert.equal(serialized.includes('PRIVATE-REFERENCE'),false);
    assert.equal(serialized.includes('redirectIntakeUrl'),false);
    if(!flags.invalidSession)assert.equal(f.calls.length,0);
  }
});
