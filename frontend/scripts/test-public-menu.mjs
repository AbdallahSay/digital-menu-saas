import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const origin = process.env.S01_ORIGIN;
assert.ok(origin, 'Run through PublicSsrTests with real SQL fixtures.');
const privateIds = process.env.S01_PRIVATE_IDS.split(',');
const a = 'مطعم ألف <script>globalThis.s01Canary=true</script>';
const b = 'مطعم باء';
function raw(path, encoding = 'gzip', method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request(
      origin + path,
      {
        method,
        headers: {
          'Accept-Encoding': encoding,
          Cookie: 'private-cookie',
          Authorization: 'Bearer private-token',
          'X-Tenant-Id': 'forged',
          'X-Role': 'PlatformAdmin',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const bytes = Buffer.concat(chunks);
            const body = (
              res.headers['content-encoding'] === 'gzip' && method !== 'HEAD'
                ? gunzipSync(bytes)
                : bytes
            ).toString('utf8');
            resolve({ status: res.statusCode, headers: res.headers, body });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}
test('real SQL A/B source HTML, locale/fallback/order, exact decimal prices, escaping and public allowlist', async () => {
  for (const language of ['ar', 'en']) {
    const result = await raw('/r/s01-a?lang=' + language);
    assert.equal(result.status, 200);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.headers['set-cookie'], undefined);
    mkdirSync('.lighthouseci', { recursive: true });
    writeFileSync('.lighthouseci/s01-a-' + language + '.source.html', result.body);
    const doc = new JSDOM(result.body).window.document;
    assert.equal(doc.documentElement.lang, language);
    assert.equal(doc.documentElement.dir, language === 'ar' ? 'rtl' : 'ltr');
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.equal(doc.querySelector('h1').textContent, a);
    assert.ok(doc.title.includes(a));
    assert.equal(doc.querySelector('link[rel=canonical]').href, origin + '/r/s01-a');
    assert.deepEqual(
      [...doc.querySelectorAll('h2')].map((n) => n.textContent),
      language === 'ar' ? ['قسم سابق', 'قسم ألف'] : ['Earlier A', 'First A'],
    );
    assert.ok(doc.querySelectorAll('h3')[0].textContent.includes('صنف أول'));
    assert.ok(doc.querySelector('main').textContent.includes('9999999999999999.99'));
    assert.ok(doc.querySelector('main').textContent.includes('12.50'));
    assert.ok(
      doc.querySelector('main').textContent.includes(language === 'en' ? 'EGP' : 'جنيه مصري'),
    );
    assert.ok(
      doc.querySelector('main').textContent.includes(language === 'ar' ? 'صنف ألف' : 'Item A'),
    );
    assert.ok(
      doc
        .querySelector('main')
        .textContent.includes('</script><script>globalThis.s01Canary=true</script>'),
    );
    assert.equal(doc.querySelectorAll('img').length, 0);
    const executable = [...doc.querySelectorAll('script:not([src])')].filter(
      (node) => node.type !== 'application/json',
    );
    const cssLoader =
      "document.querySelectorAll('link[data-beasties-media]').forEach(function(l){l.media=l.getAttribute('data-beasties-media');l.removeAttribute('data-beasties-media')})";
    assert.ok(
      executable.every((node) => node.textContent === cssLoader),
      'Unexpected executable inline script',
    );
    for (const forbidden of [
      ...privateIds,
      'S01_SECRET',
      'private-cookie',
      'private-token',
      'restaurantId',
      'userId',
      'objectKey',
      'logoUrl',
      'imageUrl',
      b,
    ])
      assert.ok(!result.body.includes(forbidden), 'Private/foreign content: ' + forbidden);
  }
  const empty = await raw('/r/s01-empty');
  assert.equal(empty.status, 200);
  assert.ok(empty.body.includes('المنيو فاضي'));
});
test('GET/HEAD gzip/identity statuses, validated one-hop QR and trusted canonical', async () => {
  for (const encoding of ['gzip', 'identity'])
    for (const method of ['GET', 'HEAD']) {
      for (const [path, status] of [
        ['/r/s01-b', 200],
        ['/r/nonexistent', 404],
        ['/r/s01-hidden', 404],
        ['/r/s01-suspended', 404],
        ['/r/s01-a?lang=fr', 400],
        ['/r/s01-a?lang=', 400],
        ['/r/s01-a?lang=ar&lang=en', 400],
        ['/r/INVALID', 400],
        ['/m/' + 'a'.repeat(20), 302],
        ['/m/' + 'd'.repeat(20), 404],
        ['/m/' + 'e'.repeat(20), 404],
        ['/m/' + 'f'.repeat(20), 503],
        ['/m/invalid', 400],
      ]) {
        const result = await raw(path, encoding, method);
        assert.equal(result.status, status, path + ' ' + method + ' ' + encoding);
        if (status === 302) {
          assert.equal(result.headers.location, '/r/s01-a');
          assert.equal((await raw(result.headers.location)).status, 200);
        } else if (status !== 200) {
          assert.ok(result.headers['x-robots-tag'].includes('noindex'));
          assert.ok(!result.body.includes('S01_SECRET'));
        }
        if (method === 'HEAD') assert.equal(result.body, '');
      }
    }
  const forged = await fetch(origin + '/r/s01-b', {
    headers: {
      Host: 'evil.example',
      'X-Forwarded-Host': 'evil.example',
      'X-Forwarded-Proto': 'https',
    },
  });
  assert.equal(forged.status, 200);
  assert.ok(!(await forged.text()).includes('evil.example'));
});
test('parallel A/B renders never mix source HTML; report local cold/warm timings', async () => {
  const start = performance.now();
  await raw('/r/s01-b');
  const warm = performance.now() - start;
  const times = [];
  await Promise.all(
    Array.from({ length: 12 }, async (_, index) => {
      const started = performance.now();
      const result = await raw(index % 2 ? '/r/s01-a' : '/r/s01-b');
      times.push(performance.now() - started);
      assert.equal(result.status, 200);
      const name = new JSDOM(result.body).window.document.querySelector('h1').textContent;
      assert.equal(name, index % 2 ? a : b);
      assert.ok(!result.body.includes(index % 2 ? b : 'Item A'));
    }),
  );
  times.sort((x, y) => x - y);
  console.log({
    profile: 'same-host SQL/TestServer bridge + production SSR, 12 parallel A/B requests',
    firstLiveMs: Number(process.env.S01_COLD_MS),
    warmMs: warm,
    p50Ms: times[5],
    p95Ms: times[11],
  });
});
test('JavaScript-disabled content, hydration without duplicate API fetch, RTL/LTR and no executable tenant HTML', async () => {
  const browser = await chromium.launch();
  try {
    for (const javaScriptEnabled of [false, true])
      for (const language of ['ar', 'en']) {
        const context = await browser.newContext({
          javaScriptEnabled,
          viewport: { width: 390, height: 844 },
        });
        const page = await context.newPage();
        const errors = [];
        const api = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        page.on('request', (request) => {
          if (request.url().includes('/api/v1/public/')) api.push(request.url());
        });
        await page.goto(origin + '/r/s01-a?lang=' + language, { waitUntil: 'networkidle' });
        assert.equal(await page.locator('h1').textContent(), a);
        assert.ok((await page.locator('main').textContent()).includes('9999999999999999.99'));
        if (javaScriptEnabled) {
          assert.equal(await page.evaluate(() => globalThis.s01Canary), undefined);
          assert.deepEqual(errors, []);
          assert.deepEqual(api, []);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.equal(
          await page.locator('html').getAttribute('dir'),
          language === 'ar' ? 'rtl' : 'ltr',
        );
        await context.close();
      }
  } finally {
    await browser.close();
  }
});
test('three Lighthouse runs on a genuine SQL-backed menu retain >=90 mobile gates', () => {
  mkdirSync('.lighthouseci', { recursive: true });
  const results = [];
  for (let i = 0; i < 3; i++) {
    const path = '.lighthouseci/s01-' + i;
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/lighthouse/cli/index.js',
        origin + '/r/s01-b',
        '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
        '--only-categories=performance,accessibility,seo',
        '--output=json',
        '--output=html',
        '--output-path=' + path,
        '--quiet',
      ],
      { env: process.env, stdio: 'inherit' },
    );
    assert.equal(result.status, 0);
    const report = JSON.parse(readFileSync(path + '.report.json', 'utf8'));
    results.push({
      performance: report.categories.performance.score,
      accessibility: report.categories.accessibility.score,
      seo: report.categories.seo.score,
      lcpMs: report.audits['largest-contentful-paint'].numericValue,
      cls: report.audits['cumulative-layout-shift'].numericValue,
    });
  }
  writeFileSync('.lighthouseci/s01-summary.json', JSON.stringify(results, null, 2));
  console.log({ realSqlLighthouse: results });
  for (const key of ['performance', 'accessibility', 'seo'])
    assert.ok(results.map((r) => r[key]).sort()[1] >= 0.9, key);
});
