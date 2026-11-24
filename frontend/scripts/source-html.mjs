import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';

const origin = 'http://localhost:4000';
test('raw source contains the public fixture and truthful SEO metadata without executing JS', async () => {
  const response = await fetch(origin + '/r/demo');
  assert.equal(response.status, 200);
  const html = await response.text();
  const doc = new JSDOM(html).window.document; // Scripts are never enabled.
  assert.equal(doc.documentElement.lang, 'ar');
  assert.equal(doc.documentElement.dir, 'rtl');
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.equal(doc.querySelector('h1').textContent, 'مطعم التجربة');
  assert.match(doc.querySelector('main').textContent, /قهوة عربية/);
  assert.match(doc.title, /مطعم التجربة/);
  assert.ok(doc.querySelector('meta[name="description"]').content.length > 15);
  assert.equal(doc.querySelectorAll('link[rel="canonical"]').length, 1);
  assert.equal(doc.querySelector('link[rel="canonical"]').href, origin + '/r/demo');
  assert.equal(doc.querySelector('meta[name="robots"]').content, 'index,follow');
  assert.equal(doc.querySelectorAll('[hreflang]').length, 0);
  const schema = JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent);
  assert.equal(schema['@type'], 'Restaurant');
  assert.equal(schema.name, doc.querySelector('h1').textContent);
  assert.equal(schema.menu, origin + '/r/demo');
  assert.doesNotMatch(html, /UserId|RestaurantId|password|draft-product/);
});

test('QR is one same-origin 302 hop; well-formed unknown routes are actual 404s', async () => {
  const qr = await fetch(origin + '/m/demo-code', { redirect: 'manual' });
  assert.equal(qr.status, 302);
  assert.equal(qr.headers.get('location'), '/r/demo');
  assert.equal(
    (await fetch(new URL(qr.headers.get('location'), origin), { redirect: 'manual' })).status,
    200,
  );
  for (const path of [
    '/r/missing',
    '/missing',
    '/m/' + '0'.repeat(20), // Well-formed and absent from the SQL fixtures.
    '/r/demo/extra',
    '/m/https://evil.example',
  ]) {
    const response = await fetch(origin + path, { redirect: 'manual' });
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('location'), null, path);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.doesNotMatch(await response.text(), /مطعم التجربة|قهوة عربية/);
  }
});

test('malformed QR codes and invalid QR locales return 400 without redirects', async () => {
  for (const path of ['/m/missing', '/m/invalid', '/m/' + '0'.repeat(20) + '?lang=fr']) {
    const response = await fetch(origin + path, { redirect: 'manual' });
    assert.equal(response.status, 400, path);
    assert.equal(response.headers.get('location'), null, path);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.doesNotMatch(await response.text(), /مطعم التجربة|قهوة عربية/);
  }
});

test('marketing is prerendered, admin is CSR and noindex, proxy reaches .NET', async () => {
  assert.match(readFileSync('dist/digital-menu/browser/index.html', 'utf8'), /القائمة الرقمية/);
  const admin = await fetch(origin + '/admin');
  assert.match(admin.headers.get('x-robots-tag'), /noindex/);
  assert.doesNotMatch(await admin.text(), /تسجيل الدخول غير متاح/);
  assert.equal(await (await fetch(origin + '/api/health/live')).text(), 'Healthy');
  assert.equal((await fetch(origin + '/api/admin/restaurant')).status, 401);
  assert.equal((await fetch(origin + '/api/openapi/v1.json')).status, 200);
});

test('sitemap is disabled by default, robots does not advertise it, and forged Host cannot poison anything', async () => {
  const sitemap = await fetch(origin + '/sitemap.xml');
  assert.equal(sitemap.status, 404);
  assert.doesNotMatch(await sitemap.text(), /<url|\/r\/demo/);
  assert.doesNotMatch(await (await fetch(origin + '/robots.txt')).text(), /Sitemap:/);
  const response = await fetch(origin + '/r/demo', { headers: { host: 'evil.example' } });
  assert.ok([200, 400, 403, 421].includes(response.status));
  if (response.status === 200) assert.doesNotMatch(await response.text(), /evil\.example/);
});

test('parallel public and missing requests do not mix metadata or fixture content', async () => {
  await Promise.all(
    Array.from({ length: 20 }, async (_, i) => {
      const response = await fetch(origin + (i % 2 ? '/r/demo' : '/r/other'));
      const html = await response.text();
      assert.equal(response.status, i % 2 ? 200 : 404);
      assert.equal(html.includes('مطعم التجربة'), Boolean(i % 2));
    }),
  );
});

// Aggregate gate: sums EVERY emitted browser JS file (lazy admin chunks included), default gzip
// level. History: provisional 180 KiB (184,320 B). The lead-intake feature measured +5,004 B
// (base 8f4d422 = 181,329 B, tip a2da5f7 = 186,333 B, same algorithm, which failed the old
// budget by 2,013 B). Reviewed allowance for that feature: 5 KiB (5,120 B). Do not grow per feature
// without a new measured delta and review.
const AGGREGATE_BASE_BYTES = 180 * 1024;
const LEAD_FEATURE_ALLOWANCE_BYTES = 5 * 1024;

test('all browser JavaScript together stays within the reviewed aggregate gzip budget', () => {
  const folder = 'dist/digital-menu/browser';
  const bytes = readdirSync(folder)
    .filter((f) => f.endsWith('.js'))
    .reduce((total, file) => total + gzipSync(readFileSync(folder + '/' + file)).length, 0);
  console.log('All browser JS gzip bytes:', bytes);
  assert.ok(bytes <= AGGREGATE_BASE_BYTES + LEAD_FEATURE_ALLOWANCE_BYTES);
});

test('bootstrap-static JavaScript (entry script plus static imports only; NOT public first-load, see route-js-gate.mjs) stays within 180 KiB gzip', () => {
  const folder = 'dist/digital-menu/browser';
  const html = readFileSync(folder + '/index.csr.html', 'utf8');
  const entry = /<script[^>]+src="([^"]+\.js)"/.exec(html)?.[1];
  assert.ok(entry, 'entry script not found');
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(folder + '/' + file, 'utf8');
    // static imports only: import"./x.js" and from"./x.js"; dynamic import("./x.js") is lazy.
    for (const m of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) visit(m[1]);
  };
  visit(entry);
  const bytes = [...seen].reduce(
    (total, file) => total + gzipSync(readFileSync(folder + '/' + file)).length,
    0,
  );
  console.log('Initial JS gzip bytes:', bytes, 'files:', seen.size);
  assert.ok(bytes <= 180 * 1024);
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// node:http, not fetch: fetch silently drops a caller-supplied Host header.
function rawGet(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, headers: { host }, timeout: 5000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    req.end();
  });
}

test('with sitemap disabled (default) robots has no Sitemap line and a forged Host changes nothing', async () => {
  const configured = 'https://menu.example.test';
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/digital-menu/server/server.mjs'], {
    env: { ...process.env, F01_LOCAL_ONLY: '1', PORT: String(port), PUBLIC_ORIGIN: configured, SITEMAP_ENABLED: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    // Ready only when this child says so, so another listener cannot satisfy the wait.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('second server did not start')), 15000);
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error('second server exited early with code ' + code));
      });
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('Local SSR listening')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const forged = 'evil.example';
    const robots = await rawGet(port, '/robots.txt', forged);
    assert.equal(robots.status, 200);
    assert.match(robots.headers['content-type'], /^text\/plain/);
    assert.doesNotMatch(robots.body, /Sitemap:|localhost|127\.0\.0\.1|evil\.example/);
    const sitemap = await rawGet(port, '/sitemap.xml', forged);
    assert.equal(sitemap.status, 404);
    assert.doesNotMatch(sitemap.body, /<url|localhost|127\.0\.0\.1|evil\.example/);
  } finally {
    child.kill();
    await exited;
  }
});
