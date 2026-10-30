// Builds and serves a disposable production copy on loopback only. Never opens
// or copies .env*, and never prints HTML, legal contact details, or raw errors.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const target = mkdtempSync(join(tmpdir(), 'coaching-legal-delivery-'));
const legalPaths = ['/aviso-de-privacidad', '/terminos-y-condiciones'];
const excluded = new Set([
  'node_modules', '.git', '.next', '.aws', '.codex', '.agents', '.vercel',
  'out', 'build', 'coverage', '.cache', '.temp', 'tmp', 'temp',
  'test-results', 'playwright-report', '.verification-home',
]);
const visibleHeaders = ['x-robots-tag', 'cache-control', 'cdn-cache-control', 'vercel-cdn-cache-control', 'pragma', 'expires'];
const children = new Set();
let interrupted = false;

function terminate(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch { /* The child may already have stopped. */ }
}

function stopForSignal() {
  interrupted = true;
  for (const child of children) terminate(child);
}
process.once('SIGINT', stopForSignal);
process.once('SIGTERM', stopForSignal);

function start(command, args, env) {
  const child = spawn(command, args, {
    cwd: target, env, stdio: 'ignore', detached: process.platform !== 'win32',
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function run(command, args, env) {
  const child = start(command, args, env);
  await new Promise((resolveRun, reject) => {
    child.once('error', () => reject(new Error('command_failed')));
    child.once('exit', code => code === 0 && !interrupted ? resolveRun() : reject(new Error('command_failed')));
  });
}

async function freePort() {
  const socket = createServer();
  await new Promise((resolveListen, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolveListen);
  });
  const port = socket.address().port;
  await new Promise(resolveClose => socket.close(resolveClose));
  return port;
}

function headersOf(response) {
  return Object.fromEntries(visibleHeaders.map(name => [name, response.headers.get(name)]));
}

function curlHead(base, path, env) {
  // -q is deliberately first: never read a user's .curlrc. No proxy or shell.
  // Capture everything privately, then expose only the explicit header allowlist.
  const output = execFileSync('curl', ['-q', '--head', '--silent', '--show-error',
    '--max-time', '10', '--noproxy', '*', `${base}${path}`], {
    cwd: target, env, encoding: 'utf8', maxBuffer: 128 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const block = output.trim().split(/\r?\n\r?\n/).at(-1) ?? '';
  const lines = block.split(/\r?\n/);
  const status = Number(lines.shift()?.match(/^HTTP\/\S+\s+(\d{3})/)?.[1] ?? 0);
  const headers = new Headers();
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    if (visibleHeaders.includes(name)) headers.append(name, line.slice(separator + 1).trim());
  }
  return { status, headers: Object.fromEntries(visibleHeaders.map(name => [name, headers.get(name)])) };
}

function contentOfMeta(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return tags.find(tag => new RegExp(`\\bname=["']${name}["']`, 'i').test(tag))
    ?.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? '';
}

function containsAll(value, directives) {
  const values = new Set(value.toLowerCase().split(',').map(item => item.trim()));
  return directives.every(directive => values.has(directive));
}

function providerValues() {
  // Parse public source constants without evaluating the module or printing them.
  const source = ts.createSourceFile('provider.ts', readFileSync(join(target, 'src/lib/legal/provider.ts'), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const values = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'legalProvider') {
      let object = node.initializer;
      while (object && (ts.isAsExpression(object) || ts.isSatisfiesExpression(object) || ts.isParenthesizedExpression(object))) {
        object = object.expression;
      }
      if (object && ts.isObjectLiteralExpression(object)) {
        for (const property of object.properties) {
          if (ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer)) {
            values[property.name.getText(source).replace(/^["']|["']$/g, '')] = property.initializer.text;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!['legalName', 'address', 'phone', 'publicContactEmail'].every(key => typeof values[key] === 'string' && values[key].length > 5)) {
    throw new Error('provider_constants_not_readable');
  }
  return values;
}

function searchable(value) {
  return value.replace(/\\u\{([a-f\d]+)\}|\\u([a-f\d]{4})|\\x([a-f\d]{2})/gi,
    (all, full, unicode, hex) => {
      const point = parseInt(full ?? unicode ?? hex, 16);
      return point <= 0x10ffff ? String.fromCodePoint(point) : all;
    })
    .replace(/&#(?:x([a-f\d]+)|(\d+));/gi,
      (all, hex, decimal) => {
        const point = parseInt(hex ?? decimal, hex ? 16 : 10);
        return point <= 0x10ffff ? String.fromCodePoint(point) : all;
      })
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function staticScripts(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return staticScripts(file);
    return entry.isFile() && /\.js(?:\.map)?$/.test(entry.name) ? [file] : [];
  });
}

async function request(base, path, method, timeout = 10_000) {
  return fetch(`${base}${path}`, {
    method, redirect: 'manual', signal: AbortSignal.timeout(timeout),
    headers: { 'Cache-Control': 'no-cache' },
  });
}

try {
  cpSync(root, target, { recursive: true, filter(source) {
    const parts = relative(root, source).split('/');
    return !parts.some(part => excluded.has(part) || part.startsWith('.env')) &&
      !['.npmrc', '.DS_Store'].includes(basename(source)) &&
      !/\.(?:log(?:\.[\w.-]+)?|tmp|temp)$/i.test(basename(source)) &&
      !(parts[0] === 'supabase' && parts[1] === '.temp');
  } });
  symlinkSync(join(root, 'node_modules'), join(target, 'node_modules'), 'dir');
  const fixtureHome = join(target, '.verification-home');
  mkdirSync(fixtureHome);
  const userConfig = join(fixtureHome, 'user.npmrc');
  const globalConfig = join(fixtureHome, 'global.npmrc');
  writeFileSync(userConfig, '');
  writeFileSync(globalConfig, '');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const env = {
    PATH: process.env.PATH,
    HOME: fixtureHome,
    TMPDIR: target,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    npm_config_userconfig: userConfig,
    npm_config_globalconfig: globalConfig,
    npm_config_cache: join(fixtureHome, 'npm-cache'),
    NEXT_PUBLIC_SITE_URL: base,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-build-placeholder',
    SUPABASE_SECRET_KEY: 'test-build-placeholder',
  };
  await run('npm', ['run', 'build', '--', '--webpack'], env);
  const provider = providerValues();
  // Derive the street identifier from the configured address; do not repeat it
  // as a literal in this verifier or reveal it in a failing assertion/log.
  const streetIdentifier = provider.address.match(/(?:^|\s)(?:calle|avenida|av\.?|calz\.?|boulevard|blvd\.?)\s+([^\s,]+)/iu)?.[1] ??
    provider.address.split(/[\s,]+/).find(word => /^\p{L}{5,}/u.test(word));
  if (!streetIdentifier) throw new Error('address_identifier_not_readable');
  const sensitiveValues = [provider.legalName, provider.address, streetIdentifier].map(searchable);
  const scripts = staticScripts(join(target, '.next/static'));
  const bundlesWithoutLegalDetails = scripts.length > 0 && scripts.every(file => {
    const contents = searchable(readFileSync(file, 'utf8'));
    return sensitiveValues.every(value => !contents.includes(value));
  });
  console.log(JSON.stringify({ build: true, isolatedEnvironment: true, bundlesWithoutLegalDetails }));
  const server = start(process.execPath, [join(target, 'node_modules', 'next', 'dist', 'bin', 'next'),
    'start', '--hostname', '127.0.0.1', '--port', String(port)], env);
  let startupFailed = false;
  server.once('error', () => { startupFailed = true; });
  let ready = false;
  const startupDeadline = Date.now() + 25_000;
  for (let attempt = 0; attempt < 100 && Date.now() < startupDeadline; attempt++) {
    if (interrupted || startupFailed || server.exitCode !== null || server.signalCode !== null) break;
    try {
      const response = await request(base, '/contacto', 'HEAD', 500);
      if (response.status === 200) { ready = true; break; }
    } catch { /* Only this local disposable server is contacted. */ }
    await delay(250);
  }
  if (!ready) throw new Error('local_server_not_ready');
  let verified = bundlesWithoutLegalDetails;
  for (const path of legalPaths) {
    // Run literal curl HEAD as well as fetch HEAD; GET checks emitted HTML.
    const curl = curlHead(base, path, env);
    const head = await request(base, path, 'HEAD');
    const get = await request(base, path, 'GET');
    const html = await get.text();
    const searchableHtml = searchable(html);
    const headerValues = headersOf(head);
    const checks = {
      headOk: head.status === 200,
      curlHeadOk: curl.status === 200,
      curlHeadersMatch: visibleHeaders.every(name => curl.headers[name] === head.headers.get(name)),
      getOk: get.status === 200,
      headerRobots: containsAll(headerValues['x-robots-tag'] ?? '', ['noindex', 'nofollow', 'noarchive', 'nosnippet', 'noimageindex']),
      privateNoStore: containsAll(headerValues['cache-control'] ?? '', ['private', 'no-store', 'no-cache', 'max-age=0', 'must-revalidate']),
      cdnNoStore: headerValues['cdn-cache-control'] === 'no-store',
      vercelCdnNoStore: headerValues['vercel-cdn-cache-control'] === 'no-store',
      legacyNoCache: headerValues.pragma === 'no-cache' && headerValues.expires === '0',
      htmlRobots: containsAll(contentOfMeta(html, 'robots'), ['noindex', 'nofollow']),
      googleRobots: containsAll(contentOfMeta(html, 'googlebot'), ['noindex', 'nofollow', 'noimageindex']),
      htmlContainsConfiguredAddress: searchableHtml.includes(searchable(provider.address)),
      htmlContainsConfiguredName: searchableHtml.includes(searchable(provider.legalName)),
      htmlContainsConfiguredPhone: searchableHtml.includes(searchable(provider.phone)),
      htmlContainsConfiguredEmail: searchableHtml.includes(searchable(provider.publicContactEmail)),
      noRfcLabel: !/\brfc\b/i.test(searchableHtml),
      noDraftOrPendingMarkers: !/\bborrador\b|\bpendiente\s+(?:de\s+)?confirmar\b|\[[a-z_ ]{3,}\]/i.test(searchableHtml),
      getHeadersMatch: visibleHeaders.every(name => get.headers.get(name) === head.headers.get(name)),
      securityHeaders: head.headers.get('x-content-type-options') === 'nosniff' &&
        head.headers.get('x-frame-options') === 'DENY',
    };
    verified &&= Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ route: path, headers: headerValues, curlI: curl.headers, ...checks }));
  }
  const controlCurl = curlHead(base, '/contacto', env);
  const control = await request(base, '/contacto', 'HEAD');
  const controlPage = await request(base, '/contacto', 'GET');
  const controlHtml = await controlPage.text();
  const controlChecks = {
    normalRouteOk: control.status === 200 && controlPage.status === 200,
    curlHeadOk: controlCurl.status === 200,
    curlHeadersMatch: visibleHeaders.every(name => controlCurl.headers[name] === control.headers.get(name)),
    noAddressInNormalHtml: !searchable(controlHtml).includes(searchable(provider.address)) &&
      !searchable(controlHtml).includes(searchable(streetIdentifier)),
    legalRobotsAbsent: !control.headers.has('x-robots-tag'),
    legalCdnHeadersAbsent: !control.headers.has('cdn-cache-control') && !control.headers.has('vercel-cdn-cache-control'),
    legalLegacyHeadersAbsent: !control.headers.has('pragma') && !control.headers.has('expires'),
  };
  verified &&= Object.values(controlChecks).every(Boolean);
  console.log(JSON.stringify({ route: '/contacto', headers: headersOf(control), curlI: controlCurl.headers, ...controlChecks }));
  console.log(JSON.stringify({ verified }));
  if (!verified) process.exitCode = 1;
} catch {
  // Next/build errors may contain rendered documents or private URLs. No raw log.
  console.log(JSON.stringify({ verified: false }));
  process.exitCode = 1;
} finally {
  for (const child of children) terminate(child);
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([new Promise(resolveExit => child.once('exit', resolveExit)), delay(3_000)]);
      if (child.exitCode === null && child.signalCode === null) {
        try {
          if (process.platform === 'win32') child.kill('SIGKILL');
          else process.kill(-child.pid, 'SIGKILL');
        } catch { /* A stopped process needs no further action. */ }
      }
    }
  }
  rmSync(target, { recursive: true, force: true });
  process.removeListener('SIGINT', stopForSignal);
  process.removeListener('SIGTERM', stopForSignal);
}
