import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';
import { existsSync, readFileSync } from 'node:fs';

const legalPaths = ['/aviso-de-privacidad', '/terminos-y-condiciones'];
const nextConfig = () => testModules().load('next.config.ts').default;

test('legal routes remain outside any declared sitemap', () => {
  for (const name of ['public/sitemap.xml', 'src/app/sitemap.ts', 'src/app/sitemap.tsx', 'src/app/sitemap.xml/route.ts']) {
    const file = new URL(`../${name}`, import.meta.url);
    if (existsSync(file)) {
      const content = readFileSync(file, 'utf8');
      for (const path of legalPaths) assert.equal(content.includes(path), false, `${name} must exclude legal routes`);
    }
  }
});

test('no declared robots file blocks crawling the legal noindex instructions', () => {
  for (const name of ['public/robots.txt', 'src/app/robots.ts', 'src/app/robots.txt/route.ts']) {
    const file = new URL(`../${name}`, import.meta.url);
    if (existsSync(file)) {
      const content = readFileSync(file, 'utf8');
      assert.doesNotMatch(content, /Disallow\s*:\s*\/(?:aviso-de-privacidad|terminos-y-condiciones)/i);
      assert.doesNotMatch(content, /disallow\s*:\s*(?:\[[^\]]*)?["']\/(?:aviso-de-privacidad|terminos-y-condiciones)/i);
    }
  }
});

function effectiveHeaders(rules, path) {
  return Object.fromEntries(rules.filter(rule => rule.source === '/:path*' || rule.source === path)
    .flatMap(rule => rule.headers).map(header => [header.key.toLowerCase(), header.value]));
}

test('only the two legal documents receive noindex and all no-store response headers', async () => {
  const rules = await nextConfig().headers();
  const exclusions = rules.filter(rule => rule.headers.some(header => header.key.toLowerCase() === 'x-robots-tag'));
  assert.deepEqual(exclusions.map(rule => rule.source).sort(), [...legalPaths].sort());
  for (const path of legalPaths) {
    const headers = effectiveHeaders(rules, path);
    assert.equal(headers['x-robots-tag'], 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    assert.equal(headers['cache-control'], 'private, no-store, no-cache, max-age=0, must-revalidate');
    assert.equal(headers['cdn-cache-control'], 'no-store');
    assert.equal(headers['vercel-cdn-cache-control'], 'no-store');
    assert.equal(headers.pragma, 'no-cache');
    assert.equal(headers.expires, '0');
  }
  for (const path of ['/', '/servicios', '/reservar', '/api/bookings/stripe/checkout', '/api/webhooks/stripe']) {
    const headers = effectiveHeaders(rules, path);
    assert.equal(headers['x-robots-tag'], undefined);
    assert.equal(headers['cdn-cache-control'], undefined);
    assert.equal(headers['vercel-cdn-cache-control'], undefined);
    assert.equal(headers.pragma, undefined);
    assert.equal(headers.expires, undefined);
  }
});

test('legal document response headers retain the existing browser security policies', async () => {
  const rules = await nextConfig().headers();
  for (const path of legalPaths) {
    const headers = effectiveHeaders(rules, path);
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.match(headers['strict-transport-security'], /max-age=/);
    assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.match(headers['permissions-policy'], /camera=\(\)/);
  }
});

for (const path of legalPaths) {
  test(`${path} keeps legal content dynamic and uses shared search exclusion metadata`, () => {
    const modules = testModules({ 'next/link': { default: () => null } });
    const documents = modules.load('src/lib/legal/documents.ts');
    const page = modules.load(`src/app${path}/page.tsx`);
    assert.equal(page.dynamic, 'force-dynamic');
    assert.equal(page.revalidate, 0);
    assert.deepEqual(page.metadata.robots, documents.legalRobotsMetadata);
    assert.equal(page.metadata.robots.index, false);
    assert.equal(page.metadata.robots.follow, false);
    // SEO must describe the document, without publishing contact/address data.
    const serialized = JSON.stringify(page.metadata);
    assert.doesNotMatch(serialized, /streetAddress|postalCode|latitude|longitude|mailto:|\[PENDIENTE|domicilio/i);
    const { legalProvider } = modules.load('src/lib/legal/provider.ts');
    for (const field of ['address', 'phone', 'publicContactEmail']) {
      const value = legalProvider[field];
      if (typeof value === 'string' && value.length > 0) {
        assert.equal(serialized.includes(value), false, `${field} is kept out of search metadata`);
      }
    }
    assert.equal(typeof page.metadata.title, 'string');
    assert.equal(typeof page.metadata.description, 'string');
  });
}

function allElements(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(allElements);
  if (typeof node !== 'object') return [];
  return [node, ...allElements(node.props?.children)];
}

function renderedText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join(' ');
  return node && typeof node === 'object' ? renderedText(node.props?.children) : '';
}

for (const path of legalPaths) {
  test(`${path} displays the configured provider contacts without draft or tax placeholders`, () => {
    const modules = testModules({ 'next/link': { __esModule: true, default: () => null } });
    const { legalProvider } = modules.load('src/lib/legal/provider.ts');
    const text = renderedText(modules.load(`src/app${path}/page.tsx`).default()).replace(/\s+/g, ' ');
    for (const field of ['legalName', 'phone', 'publicContactEmail']) {
      assert.equal(typeof legalProvider[field], 'string');
      assert.ok(legalProvider[field].length > 5);
      assert.equal(text.includes(legalProvider[field]), true, `${field} remains visible in the legal document`);
    }
    assert.doesNotMatch(text, /\brfc\b|\bborrador\b|\bpendiente\s+(?:de\s+)?confirmar\b|\[[A-Z_ ]{3,}\]/i);
  });
}

test('footer legal links use ordinary navigation without router prefetch', () => {
  const NextLink = () => null;
  const modules = testModules({ 'next/link': { __esModule: true, default: NextLink } });
  const nodes = allElements(modules.load('src/components/publico/Footer.tsx').default());
  for (const href of legalPaths) {
    const node = nodes.find(element => element.props?.href === href);
    assert.ok(node);
    assert.equal(node.type, 'a');
    assert.equal(node.props.prefetch, undefined);
  }
  assert.ok(nodes.some(node => node.type === NextLink && node.props.href === '/'),
    'unrelated site navigation keeps its existing Next Link');
});

for (const path of legalPaths) {
  test(`${path} keeps inter-document legal navigation out of the client router cache`, () => {
    const NextLink = () => null;
    const modules = testModules({ 'next/link': { __esModule: true, default: NextLink } });
    const nodes = allElements(modules.load(`src/app${path}/page.tsx`).default());
    const otherPath = legalPaths.find(candidate => candidate !== path);
    const node = nodes.find(element => element.props?.href === otherPath);
    assert.ok(node);
    assert.equal(node.type, 'a');
    assert.equal(node.props.prefetch, undefined);
  });
}

const react = {
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect() {},
  useMemo: callback => callback(),
};

for (const [name, file, props] of [
  ['contact', 'src/components/publico/contacto/ContactoForm.tsx', {}],
  ['review', 'src/components/reviews/ReviewForm.tsx', { token: 'fixture-token', customerName: 'Fixture', serviceName: 'Coaching' }],
  ['process scheduling', 'src/components/publico/proceso/ProcessSessionsScheduler.tsx', { token: 'fixture-token', serviceSlug: 'process', sessionNumber: 2, serviceName: 'Coaching', durationMinutes: 60 }],
]) {
  test(`${name} shows the integral Privacy Notice link beside data collection`, () => {
    const modules = testModules({
      react,
      'next/navigation': { useRouter: () => ({ push() {}, replace() {}, refresh() {} }) },
      '@/components/reviews/ReviewAvatar': { default: () => null },
    });
    const nodes = allElements(modules.load(file).default(props));
    assert.ok(nodes.some(node => node.type === 'form'));
    const notice = nodes.find(node => node.type === 'a' && node.props.href === '/aviso-de-privacidad');
    assert.ok(notice, 'the privacy notice remains reachable from the actual form render');
    assert.equal(notice.props.children, 'Aviso de Privacidad');
    // Existing-process scheduling is not a second acceptance of sales terms.
    if (name === 'process scheduling') {
      assert.equal(nodes.some(node => node.props?.href === '/terminos-y-condiciones'), false);
      assert.equal(nodes.some(node => node.type === 'input' && node.props.type === 'checkbox'), false);
    }
    if (name === 'review') {
      const checkbox = nodes.find(node => node.type === 'input' && node.props.type === 'checkbox');
      assert.equal(checkbox.props.checked, false);
    }
  });
}
