import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const legal=testModules().load('src/lib/legal/acceptance.ts');
const evidence={
  legal_terms_accepted_at:'2026-10-30T20:45:35.123456+00:00',
  legal_adult_confirmed_at:'2026-10-30T20:45:35.123456+00:00',
  legal_terms_version:legal.currentBookingAcceptance.termsVersion,
  legal_privacy_notice_version:legal.currentBookingAcceptance.privacyNoticeVersion,
};

test('stored current contractual and adult evidence allows recovery without modifying its original values',()=>{
  const row=Object.freeze({...evidence,id:'fixture-booking',payment_status:'pending'});
  const before=JSON.stringify(row);
  assert.equal(legal.hasDurableCurrentBookingAcceptance(row),true);
  assert.equal(JSON.stringify(row),before);
});

for(const field of Object.keys(evidence)) {
  for(const value of [undefined,null,'']) {
    test(`incomplete durable evidence is not accepted: ${field}=${String(value)}`,()=>{
      assert.equal(legal.hasDurableCurrentBookingAcceptance({...evidence,[field]:value}),false);
    });
  }
}

for(const field of ['legal_terms_version','legal_privacy_notice_version']) {
  test(`a different ${field} is not treated as current acceptance`,()=>{
    assert.equal(legal.hasDurableCurrentBookingAcceptance({...evidence,[field]:'outdated-version'}),false);
  });
}

for(const field of ['legal_terms_accepted_at','legal_adult_confirmed_at']) {
  for(const value of ['not-a-timestamp',123,true]) {
    test(`invalid server timestamp cannot stand in for ${field}: ${typeof value}`,()=>{
      assert.equal(legal.hasDurableCurrentBookingAcceptance({...evidence,[field]:value}),false);
    });
  }
}

for(const value of [undefined,null,false,[],legal.currentBookingAcceptance]) {
  test(`browser declaration or non-row input is never durable consent (${Array.isArray(value)?'array':typeof value})`,()=>{
    assert.equal(legal.hasDurableCurrentBookingAcceptance(value),false);
  });
}
