// Only this explicitly selected env file is read; Next runs in a sanitized copy.
import { cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';

export const required = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_SITE_URL',
  'STRIPE_LOCAL_WORKER_SECRET', 'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI',
  'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'COACH_EMAIL', 'CONTACT_TO_EMAIL', 'INTAKE_TOKEN_ENCRYPTION_KEY',
];
const excluded = new Set(['node_modules', '.git', '.next', '.aws', '.codex', '.agents']);
export function copySource(root, target) {
  cpSync(root, target, { recursive: true, filter(source) {
    const parts = relative(root, source).split(/[\\/]/);
    if (parts.some(part => part.startsWith('.env') || excluded.has(part))) return false;
    // Do not follow source symlinks into environment files or other trees.
    return !lstatSync(source).isSymbolicLink();
  } });
}
export function assertNoEnvFiles(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.env') || entry.isSymbolicLink()) throw new Error('Unsafe isolated source tree');
    if (entry.isDirectory()) assertNoEnvFiles(join(root, entry.name));
  }
}
export function assertNoRetiredE2EConfiguration(config) {
  if (Object.keys(config).some(name => name.startsWith('STRIPE_E2E_'))) {
    throw new Error('Remove retired STRIPE_E2E_ variables; runtime fault injection has been removed.');
  }
}
async function main() {
  const root = resolve(import.meta.dirname, '..');
  let config;
  try { config = parseEnv(readFileSync(join(root, '.env.stripe-test'), 'utf8')); }
  catch { console.error('Missing or unreadable .env.stripe-test. Required names:', required.join(', ')); process.exitCode = 1; return; }
  const missing = required.filter(name => !config[name]?.trim());
  if (missing.length) { console.error('Missing names:', missing.join(', ')); process.exitCode = 1; return; }
  assertNoRetiredE2EConfiguration(config);
  const site = new URL(config.NEXT_PUBLIC_SITE_URL);
  const database = new URL(config.NEXT_PUBLIC_SUPABASE_URL);
  if (site.origin !== 'http://localhost:3000' || site.href !== site.origin + '/' ||
      database.href !== 'https://rysgpojjhiljrrwtjguy.supabase.co/' ||
      !config.STRIPE_SECRET_KEY.startsWith('sk_test_') ||
      !config.STRIPE_WEBHOOK_SECRET.startsWith('whsec_') ||
      config.STRIPE_LOCAL_WORKER_SECRET.length < 32 ||
      Buffer.from(config.INTAKE_TOKEN_ENCRYPTION_KEY, 'base64').length !== 32) {
    throw new Error('Invalid test configuration (values withheld)');
  }
  const target = mkdtempSync(join(tmpdir(), 'coaching-stripe-dev-'));
  try {
    copySource(root, target);
    assertNoEnvFiles(target);
    console.log('Isolated source verified: no .env files or source symlinks. Configuration names complete.');
    if (process.argv.includes('--check')) return;
    symlinkSync(join(root, 'node_modules'), join(target, 'node_modules'), 'dir');
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' };
    // No inherited app credentials, NODE_OPTIONS, or arbitrary file overrides.
    for (const name of required) env[name] = config[name];
    const child = spawn(process.execPath, [join(target, 'node_modules/next/dist/bin/next'),
      'dev', '--webpack', '--hostname', 'localhost', '--port', '3000'], { cwd: target, env, stdio: 'inherit' });
    const stop = () => child.kill('SIGTERM');
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    try {
      await new Promise((res, rej) => { child.on('error', rej); child.on('exit', code => { process.exitCode = code ?? 1; res(); }); });
    } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
  } finally { rmSync(target, { recursive: true, force: true }); }
}
if (basename(process.argv[1] ?? '') === 'dev-stripe-test.mjs') {
  main().catch(() => { console.error('Isolated startup failed (details withheld to protect configuration).'); process.exitCode = 1; });
}
