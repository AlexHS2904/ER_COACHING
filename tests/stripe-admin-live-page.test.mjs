import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const path='src/app/admin/(protected)/reservas/page.tsx';
const services=[
  {id:'single',slug:'sesion-1-1',name:'Sesión 1:1',service_type:'single',price:500,session_count:1},
  {id:'package',slug:'proceso',name:'Proceso',service_type:'package',price:2500,session_count:6},
  {id:'other',slug:'other',name:'Other',service_type:'group',price:0,session_count:1},
];
function fixture({authorized=true,mode='live',ready=true}={}) {
  const calls=[];
  function BookingFlow() {}
  function ReservationsClient() {}
  const modules=testModules({
    '@/lib/admin/require-admin':{requireAdmin:async()=>{calls.push('admin');if(!authorized)throw new Error('admin_required');}},
    '@/components/admin/ReservationsClient':ReservationsClient,
    '@/components/publico/reservar/BookingFlow':BookingFlow,
    '@/lib/supabase/server':{createClient:async()=>{calls.push('bookings');return {from:()=>({select:()=>({order:async()=>({data:[],error:null})})})};}},
    '@/lib/data/services':{getActiveServices:async()=>{calls.push('services');return services;}},
    '@/lib/stripe/server':{
      getStripeConfig:()=>{calls.push('config');return {mode,newSalesEnabled:false};},
      getVerifiedStripeContext:async options=>{calls.push(['stripe',options]);if(!ready)throw new Error('private_provider_detail');return {config:{mode,newSalesEnabled:false},stripe:{}};},
      verifyImmediatePaymentMethods:async()=>{calls.push('methods');},
      assertStripeCatalogReady:async()=>{calls.push('catalog');return services.slice(0,2);},
    },
  });
  return {page:modules.load(path).default,calls,BookingFlow,ReservationsClient};
}
function elements(node) {
  if(Array.isArray(node))return node.flatMap(elements);
  if(!node||typeof node!=='object')return [];
  return [node,...elements(node.props?.children)];
}
const privateProps={searchParams:Promise.resolve({checkoutLiveTest:'1'})};
test('private page authorizes admin before catalog, provider or booking reads',async()=>{
  const f=fixture({authorized:false});
  await assert.rejects(f.page(privateProps),/admin_required/);
  assert.deepEqual(f.calls,['admin']);
});
test('private page reuses BookingFlow with Live checks and only eligible paid catalog',async()=>{
  const f=fixture(),tree=await f.page(privateProps);
  const flow=elements(tree).find(node=>node.type===f.BookingFlow);
  assert.equal(f.calls[0],'admin');assert.equal(f.calls.includes('bookings'),false);
  assert.deepEqual(f.calls.find(call=>Array.isArray(call)),['stripe',{forNewSale:true,privateLiveTest:true}]);
  assert.equal(flow.props.privateLiveTest,true);assert.equal(flow.props.stripeCheckoutEnabled,true);
  assert.deepEqual(flow.props.services,services.slice(0,2));
  assert.match(JSON.stringify(tree),/cobro real/);
});
for(const options of [{mode:'test'},{ready:false}])test(`private page fails closed without provider details: ${JSON.stringify(options)}`,async()=>{
  const f=fixture(options),tree=await f.page(privateProps);
  const flow=elements(tree).find(node=>node.type===f.BookingFlow);
  assert.equal(flow.props.stripeCheckoutEnabled,false);
  assert.equal(f.calls.includes('bookings'),false);
  assert.equal(JSON.stringify(tree).includes('private_provider_detail'),false);
});
test('normal admin reservations page stays unchanged without private intention',async()=>{
  const f=fixture(),tree=await f.page({});
  assert.equal(elements(tree).some(node=>node.type===f.ReservationsClient),true);
  assert.equal(elements(tree).some(node=>node.type===f.BookingFlow),false);
  assert.deepEqual(f.calls,['admin','bookings']);
});
