// Test-only Stripe SDK transport. It has no network fallback or environment
// switches, and application/launcher code never imports it.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const Stripe=createRequire(import.meta.url)('stripe');

export function stripeCheckoutTransport({rejectFirstCreate=false}={}) {
  const sessions=new Map(),calls={requests:[],rejections:0,created:[]};
  let reject=rejectFirstCreate;
  const response=(status,body)=>({getStatusCode:()=>status,
    getHeaders:()=>({'request-id':'req_fixture_transport','stripe-should-retry':'false'}),
    getRawResponse:()=>({}),toStream:()=>{throw new Error('JSON fixture only');},
    toJSON:async()=>structuredClone(body)});
  const client=new Stripe('sk_test_fixture_only',{timeout:10_000,maxNetworkRetries:1,httpClient:{
    getClientName:()=> 'test-only-checkout-transport',
    async makeRequest(_host,_port,path,method,headers,body){
      const key=headers['Idempotency-Key'];calls.requests.push({method,path,key});
      if(method==='GET'&&path.startsWith('/v1/checkout/sessions/')){
        const session=[...sessions.values()].find(s=>s.id===path.split('/').pop());
        if(!session)throw new Error('Unknown fixture Session');
        return response(200,session);
      }
      if(method!=='POST'||path!=='/v1/checkout/sessions')throw new Error('Unsupported fixture operation');
      if(reject){reject=false;calls.rejections++;return response(400,{error:{type:'invalid_request_error',
        code:'parameter_invalid_enum',param:'fixture_parameter',message:'Deterministic fixture rejection'}});}
      if(!sessions.has(key)){
        const form=new URLSearchParams(body),metadata={};
        for(const [name,value] of form)if(name.startsWith('metadata['))metadata[name.slice(9,-1)]=value;
        const session={id:`cs_test_${randomUUID().replaceAll('-','')}`,object:'checkout.session',livemode:false,
          mode:form.get('mode'),status:'open',payment_status:'unpaid',metadata,
          client_reference_id:form.get('client_reference_id'),
          amount_total:Number(form.get('line_items[0][price_data][unit_amount]')),
          currency:form.get('line_items[0][price_data][currency]'),expires_at:Number(form.get('expires_at')),
          url:'https://checkout.stripe.com/c/pay/fixture'};
        sessions.set(key,session);calls.created.push({id:session.id,key});
      }
      return response(200,sessions.get(key));
    },
  }});
  return {client,calls,sessions};
}
