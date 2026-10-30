import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copySource, assertNoEnvFiles, required } from '../scripts/dev-stripe-test.mjs';
import { testModules } from './helpers/load-typescript.mjs';

test('isolated environment supplies the existing Intake submission recipient to the real email helper',async()=>{
  const config={RESEND_FROM_EMAIL:'sender@example.test',COACH_EMAIL:'booking-coach@example.test',CONTACT_TO_EMAIL:'intake-coach@example.test'};
  const isolated=Object.fromEntries(required.filter(name=>Object.hasOwn(config,name)).map(name=>[name,config[name]]));
  const calls=[];
  const modules=testModules({'@/lib/email/resend':{getResend:()=>({emails:{send:async payload=>{calls.push(payload);return {data:{id:'fixture-submission-email'},error:null};}}})}},isolated);
  const result=await modules.load('src/lib/email/send-intake-subimssion-mail.tsx').sendIntakeSubmissionEmail({form:{source_type:'booking',invitee_name:'Fixture',invitee_email:'customer@example.test'},bookingReference:'FIXTURE'});
  assert.equal(result.error,null);assert.equal(calls.length,1);
  assert.equal(calls[0].to,config.CONTACT_TO_EMAIL);assert.equal(calls[0].from,config.RESEND_FROM_EMAIL);
  assert.equal(calls[0].replyTo,'customer@example.test');
});

test('isolated preflight refuses to start when the Intake submission recipient is missing',()=>{
  const root=mkdtempSync(join(tmpdir(),'isolation-recipient-test-'));
  try {
    mkdirSync(join(root,'scripts'));
    writeFileSync(join(root,'scripts/dev-stripe-test.mjs'),readFileSync(new URL('../scripts/dev-stripe-test.mjs',import.meta.url)));
    const config={...Object.fromEntries(required.map(name=>[name,'synthetic-only'])),STRIPE_SECRET_KEY:'sk_test_synthetic_only',STRIPE_WEBHOOK_SECRET:'whsec_synthetic_only',NEXT_PUBLIC_SITE_URL:'http://localhost:3000',NEXT_PUBLIC_SUPABASE_URL:'https://rysgpojjhiljrrwtjguy.supabase.co',STRIPE_LOCAL_WORKER_SECRET:'s'.repeat(32),INTAKE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
    delete config.CONTACT_TO_EMAIL;
    writeFileSync(join(root,'.env.stripe-test'),Object.entries(config).map(([name,value])=>`${name}=${value}`).join('\n'));
    const result=spawnSync(process.execPath,[join(root,'scripts/dev-stripe-test.mjs'),'--check'],{cwd:root,env:{PATH:process.env.PATH},encoding:'utf8',timeout:15000});
    assert.equal(result.status,1);assert.match(result.stderr,/Missing names: CONTACT_TO_EMAIL/);
    assert.equal(result.stdout.includes('Isolated source verified'),false);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('isolated source excludes env files at every depth and source symlinks',()=>{
  const root=mkdtempSync(join(tmpdir(),'isolation-test-'));
  try {
    const source=join(root,'source'), target=join(root,'target');
    mkdirSync(join(source,'nested'),{recursive:true});
    writeFileSync(join(source,'.env.local'),'SYNTHETIC_ONLY=forbidden');
    writeFileSync(join(source,'nested','.env.stripe-test'),'SYNTHETIC_ONLY=forbidden');
    writeFileSync(join(source,'nested','safe.ts'),'export {};');
    symlinkSync(join(source,'.env.local'),join(source,'linked-secret'));
    copySource(source,target); assertNoEnvFiles(target);
    assert.equal(existsSync(join(target,'.env.local')),false);
    assert.equal(existsSync(join(target,'nested','.env.stripe-test')),false);
    assert.equal(existsSync(join(target,'linked-secret')),false);
    assert.equal(existsSync(join(target,'nested','safe.ts')),true);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
