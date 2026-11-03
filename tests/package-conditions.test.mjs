import assert from 'node:assert/strict';
import {test} from 'node:test';
import {testModules} from './helpers/load-typescript.mjs';

test('expiry closes scheduling at the exact boundary without imposing a term on historical packages',()=>{
  const {isProcessWithinValidity}=testModules().load('src/lib/coaching/process-entitlement.ts');
  const deadline='2035-01-01T12:00:00Z',instant=Date.parse(deadline);
  assert.equal(isProcessWithinValidity(deadline,instant-1),true);
  assert.equal(isProcessWithinValidity(deadline,instant),false);
  assert.equal(isProcessWithinValidity(deadline,instant+1),false);
  assert.equal(isProcessWithinValidity(null,instant),true);
  assert.equal(isProcessWithinValidity('invalid',instant),false);
});
test('a pending cancellation reserves its ordinal; approved replacement is reusable exactly once',()=>{
  const {nextProcessSessionNumber:next}=testModules().load('src/lib/coaching/process-entitlement.ts');
  const rows=Array.from({length:6},(_,i)=>({id:`booking-${i}`,package_session_number:i+1,session_resolution:null}));
  rows[1].session_resolution='late_cancel_pending';assert.equal(next(6,rows),null);
  rows[1].session_resolution='replacement_approved';assert.equal(next(6,rows),2);
  rows.push({id:'replacement',package_session_number:2,replaces_booking_id:rows[1].id});assert.equal(next(6,rows),null);
});
test('new terms are required for a new declaration while previously stored acceptance stays valid for recovery',()=>{
  const legal=testModules().load('src/lib/legal/acceptance.ts');
  assert.equal(legal.currentBookingAcceptance.termsVersion,'2026-10-31.1');
  assert.equal(legal.hasCurrentBookingAcceptance({...legal.currentBookingAcceptance,termsVersion:'2026-10-29.2'}),false);
  const prior={legal_terms_version:'2026-10-29.2',legal_privacy_notice_version:'2026-10-29.2',
    legal_terms_accepted_at:'2026-10-29T22:00:00Z',legal_adult_confirmed_at:'2026-10-29T22:00:00Z'};
  assert.equal(legal.hasDurableCurrentBookingAcceptance(prior),true);
  assert.equal(legal.hasDurableCurrentBookingAcceptance({...prior,legal_terms_accepted_at:null}),false);
});

const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',booking='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',site='https://fixture.example.test';
function adminFixture(identity='admin') {
  const calls=[];
  const modules=testModules({
    'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},
    '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:identity==='anonymous'?{}:{sub:actor}}})},
      from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:identity==='user'?null:{active:identity==='admin'},error:null})})})},
    '@/lib/supabase/admin':{getSupabaseAdmin:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{status:'no_show',session_resolution:'no_show'},error:null};}})},
    '@/lib/stripe/server':{getStripeConfig:()=>({mode:'test',accountId:'acct_fixture',siteUrl:site})},
    '@/lib/bookings/stripe-booking-changes':{requestStripeBookingChange:()=>{throw new Error('unexpected side effect');}},
    '@/lib/google/calendar':{deleteGoogleCalendarEvent:()=>{throw new Error('unexpected Calendar');}},
    '@/lib/email/send-booking-change-email':{sendBookingChangeEmail:()=>{throw new Error('unexpected email');}},
  });
  const POST=modules.load('src/app/api/bookings/[id]/cancel/route.ts').POST;
  return {calls,run:(body={action:'no_show'},origin=site)=>POST({headers:new Headers({'content-type':'application/json',origin}),json:async()=>body},
    {params:Promise.resolve({id:booking})})};
}
for(const identity of ['anonymous','user','inactive'])test(`session decisions deny ${identity} before privileged operations`,async()=>{
  const f=adminFixture(identity);assert.equal((await f.run()).status,identity==='anonymous'?401:403);assert.equal(f.calls.length,0);
});
test('session decision records authenticated admin identity, rejects forged actor and cross-origin requests',async()=>{
  const f=adminFixture();assert.equal((await f.run()).status,200);
  assert.equal(f.calls[0].name,'resolve_stripe_session_v1');assert.equal(f.calls[0].args.p_admin_user_id,actor);
  assert.equal((await f.run({action:'no_show',p_admin_user_id:booking})).status,400);
  assert.equal((await f.run({action:'no_show'},'https://foreign.example.test')).status,403);
  assert.equal(f.calls.length,1);
});
