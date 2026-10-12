import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

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

test('QR is one same-origin 302 hop; all unknown routes are actual 404s', async () => {
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
    '/m/missing',
    '/r/demo/extra',
    '/m/https://evil.example',
  ]) {
    const response = await fetch(origin + path, { redirect: 'manual' });
    assert.equal(response.status, 404, path);
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

test('sitemap contains only canonical fixture and forged Host cannot poison canonical', async () => {
  const xml = await (await fetch(origin + '/sitemap.xml')).text();
  const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  assert.deepEqual(
    [...doc.querySelectorAll('loc')].map((n) => n.textContent),
    [origin + '/r/demo'],
  );
  assert.doesNotMatch(xml, /\/m\/|admin|lastmod/);
  assert.match(
    await (await fetch(origin + '/robots.txt')).text(),
    /Sitemap: http:\/\/localhost:4000\/sitemap.xml/,
  );
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

test('all browser JavaScript together stays within the provisional 180 KiB gzip budget', () => {
  const folder = 'dist/digital-menu/browser';
  const bytes = readdirSync(folder)
    .filter((f) => f.endsWith('.js'))
    .reduce((total, file) => total + gzipSync(readFileSync(folder + '/' + file)).length, 0);
  console.log('All browser JS gzip bytes:', bytes);
  assert.ok(bytes <= 180 * 1024);
});
