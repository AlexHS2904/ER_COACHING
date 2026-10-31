import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { testModules } from './helpers/load-typescript.mjs';

const require=createRequire(import.meta.url);
const sdkSource=readFileSync(join(dirname(require.resolve('@vercel/firewall')),'rate-limit.js'),'utf8');
const canonical='www.ednarojocoaching.com',generated='er-coaching-fixture.vercel.app';
const secret='fixture-only-rate-limit-transport-secret';
const production={NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',VERCEL_URL:generated,
  NEXT_PUBLIC_SITE_URL:`https://${canonical}`,RATE_LIMIT_SECRET:secret};
const ip='203.0.113.20';
const request=()=>({headers:new Headers({'x-vercel-forwarded-for':ip,host:'attacker.example',
  authorization:'Bearer private-fixture-auth',cookie:'private-fixture-cookie'})});

function fixture({environment={},status=204,fetchError=null}={}) {
  const env={...production,...environment},calls=[],warnings=[];
  const module={exports:{}};
  // Execute the installed SDK unchanged with its actual HTTP/hash logic. The
  // VM supplies synthetic environment values and a transport with no network
  // fallback; process.env and all local/remote configuration stay untouched.
  runInNewContext(sdkSource,{module,exports:module.exports,process:{env},Headers,TextEncoder,
    AbortSignal,crypto:webcrypto,console:{warn:(...args)=>warnings.push(args)},
    fetch:async(url,options)=>{
      calls.push({url,options});
      if(fetchError)throw fetchError;
      const host=new URL(url).hostname;
      return {status:host===generated?302:status};
    }},{filename:'installed-vercel-firewall-rate-limit.js'});
  const modules=testModules({'@vercel/firewall':module.exports,
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    '@/lib/data/availability':{getAvailableSlots:async()=>[{starts_at:'2036-01-02T18:00:00Z'}]},
  },env);
  return {calls,warnings,sdk:module.exports,modules,
    enforce:modules.load('src/lib/security/public-abuse.ts').enforcePublicAbuse};
}

test('installed SDK reproduces the generated-host SSO failure without following its redirect',async()=>{
  const f=fixture();
  await assert.rejects(f.sdk.checkRateLimit('er-public-abuse-v1',{
    headers:new Headers({host:generated,'x-real-ip':ip}),rateLimitKey:'fixture-key',timeout:1000,
  }),/302/);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].options.redirect,'manual');
});

test('production guard uses the public canonical host through the real SDK without a bypass secret',async()=>{
  const f=fixture();
  assert.equal(await f.enforce(request(),'availability-read'),null);
  assert.equal(f.calls.length,1);
  const {url,options}=f.calls[0];
  assert.equal(url,`https://${canonical}/.well-known/vercel/rate-limit-api/er-public-abuse-v1`);
  assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');
  assert.equal(options.headers.get('x-vercel-protection-bypass'),'');
  assert.equal(options.headers.get('authorization'),null);assert.equal(options.headers.get('cookie'),null);
  assert.equal(options.headers.get('x-rr-host'),canonical);
  assert.equal(options.headers.get('x-rr-x-real-ip'),ip);
  assert.match(options.headers.get('x-vercel-rate-limit-key'),/^[a-f0-9]{64}-[a-f0-9]{64}$/);
  const wire=JSON.stringify({url,headers:[...options.headers]});
  for(const value of [secret,'private-fixture-auth','private-fixture-cookie','attacker.example'])assert.equal(wire.includes(value),false);
});

test('Production does not require or trust a new site URL environment variable',async()=>{
  const f=fixture({environment:{NEXT_PUBLIC_SITE_URL:undefined,VERCEL_URL:undefined}});
  assert.equal(await f.enforce(request(),'availability-read'),null);
  assert.equal(f.calls.length,1);
  assert.equal(new URL(f.calls[0].url).hostname,canonical);
});

test('availability GET reaches its existing reader after the real SDK returns 204',async()=>{
  const f=fixture(),GET=f.modules.load('src/app/api/availability/route.ts').GET;
  const response=await GET({...request(),nextUrl:new URL(`https://${canonical}/api/availability?service=sesion-1-1&date=2036-01-02`)});
  assert.equal(response.status,200);assert.equal(f.calls.length,1);
  assert.match(JSON.stringify(await response.json()),/2036-01-02T18:00:00Z/);
});

test('missing Production secret still rejects before any SDK transport request',async()=>{
  const f=fixture({environment:{RATE_LIMIT_SECRET:undefined}});
  const response=await f.enforce(request(),'availability-read');
  assert.equal(response.status,503);assert.equal(f.calls.length,0);
  assert.equal((await response.json()).error,'No fue posible procesar la solicitud. Intenta de nuevo más tarde.');
});

for(const status of [302,401,404,500])test(`real SDK HTTP ${status} remains a private fail-closed 503`,async()=>{
  const f=fixture({status}),response=await f.enforce(request(),'contact','private-fixture-recipient');
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
  const body=JSON.stringify(await response.json());
  for(const value of ['private-fixture-recipient',secret,String(status),canonical])assert.equal(body.includes(value),false);
  assert.equal(f.calls.length,1);
});

for(const status of [429,403])test(`real SDK HTTP ${status} still returns 429 without relaxing the limit`,async()=>{
  const f=fixture({status}),response=await f.enforce(request(),'booking-create');
  assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');
  assert.equal(f.calls.length,1);
});

for(const error of [new Error('private transport detail'),Object.assign(new Error('private timeout detail'),{name:'TimeoutError'})]){
  test(`real SDK ${error.name} is redacted and fails closed`,async()=>{
    const f=fixture({fetchError:error}),response=await f.enforce(request(),'contact');
    assert.equal(response.status,503);
    assert.equal(JSON.stringify(await response.json()).includes('private'),false);
    assert.equal(f.calls.length,1);
  });
}

test('protected Preview does not fall back to Production counters or bypass authentication',async()=>{
  const f=fixture({environment:{VERCEL_ENV:'preview'}});
  const response=await f.enforce(request(),'contact');
  assert.equal(response.status,503);assert.equal(f.calls.length,1);
  assert.equal(new URL(f.calls[0].url).hostname,generated);
  assert.equal(f.calls[0].options.headers.get('x-vercel-protection-bypass'),'');
});
