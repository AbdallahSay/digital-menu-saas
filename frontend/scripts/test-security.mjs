/**
 * HTTP Security Regression Tests — M02 Path Traversal Guard
 *
 * Validates that the gzip middleware in server.ts never serves files outside
 * the Angular browser output directory, while confirming that ordinary static
 * assets are still delivered correctly with gzip encoding.
 *
 * Requires the SSR server running on http://localhost:4000.
 * Run: node --test scripts/test-security.mjs
 */

import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';

const BASE = 'http://localhost:4000';
const GZIP = { 'Accept-Encoding': 'gzip' };

async function get(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { headers, redirect: 'manual' });
  return res;
}

// ─── Connectivity check ──────────────────────────────────────────────────────
before(async () => {
  let alive = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(3000) });
      if (r.status < 600) {
        alive = true;
        break;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!alive) throw new Error('SSR server is not reachable on localhost:4000 — start it first.');
});

// ─── Path traversal rejection ─────────────────────────────────────────────────
describe('Path Traversal — gzip middleware must not serve outside browserRoot', () => {
  it('rejects raw ../ traversal (package.json)', async () => {
    // Express normalises /../package.json → /package.json (not in browser dir → 404).
    // Any other resolution must NOT be 200.
    const r = await get('/../package.json', GZIP);
    assert.notEqual(r.status, 200, `Expected non-200 for /../package.json but got ${r.status}`);
  });

  it('rejects multiple ../ segments to reach server source', async () => {
    const r = await get('/../../src/server.ts', GZIP);
    assert.notEqual(r.status, 200, `Expected non-200 for deep traversal but got ${r.status}`);
  });

  it('rejects URL-encoded %2e%2e traversal', async () => {
    // Fetch itself decodes the URL, but this tests the server response.
    const r = await fetch(`${BASE}/%2e%2e/package.json`, { headers: GZIP, redirect: 'manual' });
    assert.notEqual(r.status, 200, `Expected non-200 for %2e%2e/package.json but got ${r.status}`);
  });

  it('rejects double-encoded %252e%252e traversal', async () => {
    const r = await fetch(`${BASE}/%252e%252e/package.json`, { headers: GZIP, redirect: 'manual' });
    assert.notEqual(
      r.status,
      200,
      `Expected non-200 for double-encoded traversal but got ${r.status}`,
    );
  });

  it('rejects null-byte injection attempt', async () => {
    const r = await fetch(`${BASE}/main.js%00.css`, { headers: GZIP, redirect: 'manual' });
    assert.notEqual(r.status, 200, `Expected non-200 for null-byte path but got ${r.status}`);
  });

  it('does not expose /etc/passwd via gzip route', async () => {
    const r = await fetch(`${BASE}//etc/passwd`, { headers: GZIP, redirect: 'manual' });
    assert.notEqual(r.status, 200, `Expected non-200 for /etc/passwd attempt but got ${r.status}`);
    if (r.status === 200) {
      const body = await r.text();
      assert.ok(!body.includes('root:'), 'Response must not contain /etc/passwd content');
    }
  });
});

// ─── Correct static asset delivery ───────────────────────────────────────────
describe('Static Asset Delivery — gzip middleware must still serve assets', () => {
  it('landing page (/) returns 200 HTML', async () => {
    const r = await get('/', GZIP);
    assert.equal(r.status, 200);
    const ct = r.headers.get('content-type') ?? '';
    assert.ok(ct.includes('text/html'), `Expected text/html but got: ${ct}`);
  });

  it('landing page returns gzip encoding', async () => {
    const r = await get('/', GZIP);
    const ce = r.headers.get('content-encoding');
    assert.equal(ce, 'gzip', 'Expected Content-Encoding: gzip for SSR page');
  });

  it('font file is served with immutable cache header', async () => {
    const r = await get('/fonts/tajawal-regular-arabic.woff2', GZIP);
    assert.equal(r.status, 200, 'Font file should be accessible');
    const cc = r.headers.get('cache-control') ?? '';
    assert.ok(cc.includes('max-age=31536000'), `Expected immutable cache but got: ${cc}`);
  });

  it('/robots.txt returns 200 text/plain', async () => {
    const r = await get('/robots.txt');
    assert.equal(r.status, 200);
    const ct = r.headers.get('content-type') ?? '';
    assert.ok(ct.includes('text/plain'));
  });

  it('/sitemap.xml returns 200 XML', async () => {
    const r = await get('/sitemap.xml');
    assert.equal(r.status, 200);
    const ct = r.headers.get('content-type') ?? '';
    assert.ok(ct.includes('xml'));
  });

  it('/favicon.ico returns 204 no content', async () => {
    const r = await get('/favicon.ico');
    assert.equal(r.status, 204);
  });
});

// ─── Security headers present ─────────────────────────────────────────────────
describe('Security Headers — X-Content-Type-Options must be set', () => {
  it('landing page includes X-Content-Type-Options: nosniff', async () => {
    const r = await get('/');
    const h = r.headers.get('x-content-type-options');
    assert.equal(h, 'nosniff');
  });

  it('static .css files include X-Content-Type-Options: nosniff', async () => {
    // Find an actual CSS file from the server root (styles- hashed)
    const r = await get('/styles.css', GZIP);
    // Whether or not the file exists, the header should be set (middleware runs first).
    const h = r.headers.get('x-content-type-options');
    assert.equal(h, 'nosniff');
  });

  it('Referrer-Policy is same-origin', async () => {
    const r = await get('/');
    const h = r.headers.get('referrer-policy');
    assert.equal(h, 'same-origin');
  });
});
