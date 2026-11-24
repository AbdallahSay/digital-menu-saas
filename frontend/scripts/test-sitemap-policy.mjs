import test from 'node:test';
import assert from 'node:assert/strict';
import { readSitemapConfig, robotsTxt, renderSitemap, sitemapResponse } from '../src/sitemap-policy.ts';

const on = { SITEMAP_ENABLED: 'true', SITEMAP_ORIGIN: 'https://menu.example' };
const page = (over = {}) => ({ page: 1, hasMore: false, truncated: false, entries: [{ slug: 'cafe-1', lastModifiedUtc: '2026-01-02T03:04:05Z' }], ...over });

test('default is disabled, robots omits Sitemap and renders nothing', () => {
  for (const env of [{}, { SITEMAP_ENABLED: 'TRUE', SITEMAP_ORIGIN: 'https://menu.example' }, { SITEMAP_ENABLED: '1', SITEMAP_ORIGIN: 'https://menu.example' }, { SITEMAP_ENABLED: 'true' }]) {
    const c = readSitemapConfig(env);
    assert.equal(c.enabled, false);
    assert.ok(!robotsTxt(c).includes('Sitemap'));
    assert.equal(renderSitemap(c, page()), null);
  }
  assert.ok(robotsTxt(readSitemapConfig({})).includes('Disallow: /admin'));
});

test('origin must be a bare https origin; anything else stays disabled', () => {
  for (const o of ['http://menu.example', 'https://u:p@menu.example', 'https://menu.example/x', 'https://menu.example/', 'https://menu.example?a=1', 'https://menu.example#h', 'menu.example', '', 'javascript:alert(1)'])
    assert.equal(readSitemapConfig({ SITEMAP_ENABLED: 'true', SITEMAP_ORIGIN: o }).enabled, false, o);
});

test('enabled: robots and loc come only from the configured origin', () => {
  const c = readSitemapConfig(on);
  assert.equal(c.enabled, true);
  assert.ok(robotsTxt(c).endsWith('Sitemap: https://menu.example/sitemap.xml\n'));
  const xml = renderSitemap(c, page());
  assert.ok(xml.includes('<loc>https://menu.example/r/cafe-1</loc>'));
  assert.ok(!xml.includes('/r/demo'));
  assert.ok(xml.includes('<lastmod>2026-01-02T03:04:05.000Z</lastmod>'));
});

test('fail closed on malformed, truncated, multi-page or hostile backend payloads', () => {
  const c = readSitemapConfig(on);
  for (const bad of [null, 'x', {}, page({ page: 2 }), page({ hasMore: true }), page({ truncated: true }), page({ entries: 'x' }),
    page({ entries: [{ slug: '<script>', lastModifiedUtc: '2026-01-01T00:00:00Z' }] }),
    page({ entries: [{ slug: 'a--b', lastModifiedUtc: '2026-01-01T00:00:00Z' }] }),
    page({ entries: [{ slug: 'a/../b', lastModifiedUtc: '2026-01-01T00:00:00Z' }] }),
    page({ entries: [{ slug: 'ok', lastModifiedUtc: 'nope' }] }), page({ entries: [null] })])
    assert.equal(renderSitemap(c, bad), null, JSON.stringify(bad));
  assert.ok(renderSitemap(c, page({ entries: [] })).includes('<urlset'));
});

const url = 'http://127.0.0.1:5080/api/v1/public/sitemap?page=1';
const json = (body, status = 200) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const counting = (impl) => { const f = async (...a) => { f.calls++; return impl(...a); }; f.calls = 0; return f; };

test('disabled route: 404, no-store, noindex, and NO backend request', async () => {
  const f = counting(json(page()));
  const r = await sitemapResponse(readSitemapConfig({}), url, f);
  assert.equal(r.status, 404);
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.equal(r.headers['X-Robots-Tag'], 'noindex');
  assert.ok(!r.body.includes('<url'));
  assert.equal(f.calls, 0);
});

test('enabled: valid synthetic page renders, demo is excluded even if the backend lists it', async () => {
  const f = counting(json(page({ entries: [{ slug: 'demo', lastModifiedUtc: '2026-01-01T00:00:00Z' }, { slug: 'cafe-1', lastModifiedUtc: '2026-01-01T00:00:00Z' }] })));
  const r = await sitemapResponse(readSitemapConfig(on), url, f);
  assert.equal(r.status, 200);
  assert.equal(f.calls, 1);
  assert.ok(r.body.includes('/r/cafe-1') && !r.body.includes('/r/demo'));
});

test('enabled: backend 503/429/500, malformed JSON, timeout/throw, oversize, duplicates, >1000 entries all fail closed with 503', async () => {
  const c = readSitemapConfig(on);
  const many = Array.from({ length: 1001 }, (_, i) => ({ slug: 's' + i, lastModifiedUtc: '2026-01-01T00:00:00Z' }));
  const dup = [{ slug: 'a', lastModifiedUtc: '2026-01-01T00:00:00Z' }, { slug: 'a', lastModifiedUtc: '2026-01-01T00:00:00Z' }];
  for (const impl of [json('x', 503), json('x', 429), json('x', 500), json('{not json'), json('x'.repeat(1_000_001)), json(page({ entries: many })), json(page({ entries: dup })), async () => { throw new Error('timeout'); }]) {
    const r = await sitemapResponse(c, url, impl);
    assert.equal(r.status, 503);
    assert.ok(!r.body.includes('<url'));
  }
});

test('destination and origin are fixed inputs: request-controlled values cannot reach them', async () => {
  let seen;
  const r = await sitemapResponse(readSitemapConfig(on), url, async (u, init) => { seen = { u, init }; return new Response(JSON.stringify(page())); });
  assert.equal(seen.u, url);
  assert.equal(seen.init.redirect, 'error');
  assert.ok(!('cookie' in (seen.init.headers ?? {})) && !('authorization' in (seen.init.headers ?? {})));
  assert.ok(r.body.includes('https://menu.example/r/cafe-1'));
});
