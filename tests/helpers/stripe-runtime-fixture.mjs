// Test-only explicit Stripe environment. No application environment is read.
import { testModules } from './load-typescript.mjs';
export const stripeFixtureConfig = Object.freeze({mode:'test',accountId:'acct_fixture',
  siteUrl:'http://localhost:3000',newSalesEnabled:true,paymentMethodConfigurationId:'pmc_fixture'});
export const stripeFixtureScope = Object.freeze({stripe_mode:'test',stripe_account_id:'acct_fixture',stripe_site_origin:'http://localhost:3000'});
export const stripeFixtureCatalog = [
  {id:'11111111-1111-4111-8111-111111111110',slug:'sesion-1-1',service_type:'single',session_count:1,duration_minutes:90,price:500,currency:'MXN',active:true,published:true,requires_intake:true,booking_enabled:true,requires_quote:false},
  {id:'22222222-2222-4222-8222-222222222220',slug:'proceso',service_type:'package',session_count:6,duration_minutes:90,price:2500,currency:'MXN',active:true,published:true,requires_intake:false,booking_enabled:true,requires_quote:false},
];
export function stripeRuntimeFixture(db,stripe={},config=stripeFixtureConfig) {
  return {
    getStripeBookingAdmin:()=>db,getStripeConfig:()=>config,getStripeClient:()=>stripe,
    getVerifiedStripeContext:async()=>({config,stripe}),verifyImmediatePaymentMethods:async()=>{},
    assertStripeSalesReady:(c=config)=>{if(!c.newSalesEnabled)throw new Error("stripe_new_sales_not_ready");},
    assertStripeRecordScope:testModules({'@/lib/supabase/admin':{}}).load('src/lib/stripe/server.ts').assertStripeRecordScope,
    assertStripeCatalogReady:async()=>structuredClone(stripeFixtureCatalog),
    getStripeTestClient:()=>stripe,getStripeTestSiteUrl:()=>config.siteUrl,
  };
}
