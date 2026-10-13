/**
 * HTTP Security Regression Tests — M02 Path Traversal Guard
 *
 * Uses node:http.request so dot-segments are sent verbatim to the server
 * without the WHATWG URL normalisation that fetch() applies.
 *
 * Lifecycle:
 *   before()  — write a canary JSON file OUTSIDE dist/…/browser, start server check
 *   tests     — attempt raw / encoded / double-encoded access to the canary
 *   after()   — delete canary and symlink fixtures unconditionally
 *
 * Requires the SSR server running on http://localhost:4000.
 * Run: node --test scripts/test-security.mjs
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  symlinkSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Paths ───────────────────────────────────────────────────────────────────
const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const frontendDir = resolve(scriptDir, '..');
const browserDir = resolve(frontendDir, 'dist/digital-menu/browser');
// Canary is placed one directory ABOVE browser — within traversal reach of
// the old vulnerable code but outside the secured browserRoot boundary.
const canaryDir = resolve(browserDir, '..');
const canaryPath = join(canaryDir, 'security-canary.json');
const canaryContent = JSON.stringify({ secret: 'CANARY_MUST_NOT_LEAK' });
const canaryMark = 'CANARY_MUST_NOT_LEAK';

// Symlink placed inside browser dir but pointing to the canary above.
const symlinkPath = join(browserDir, '_sec-symlink-test.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Discover an existing hashed JS/CSS filename from the browser dist. */
function findHashedAsset(ext) {
  if (!existsSync(browserDir)) return null;
  return readdirSync(browserDir).find((f) => f.endsWith(ext) && f.includes('-')) ?? null;
}

/**
 * Send a raw HTTP GET to localhost:4000 with the path delivered **verbatim**
 * (no URL normalization). Returns { status, headers, body }.
 */
function rawGet(rawPath, extraHeaders = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        method,
        path: rawPath, // sent byte-for-byte; Node does NOT normalise this
        headers: { 'Accept-Encoding': 'gzip', ...extraHeaders },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const bytes = Buffer.concat(chunks);
            const decoded =
              res.headers['content-encoding'] === 'gzip' && method !== 'HEAD'
                ? gunzipSync(bytes)
                : bytes;
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: decoded.toString('utf8'),
              bytes: decoded,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error(`rawGet timeout for path: ${rawPath}`));
    });
    req.on('error', reject);
    req.end();
  });
}

/** WHATWG fetch helper for non-traversal assertions. */
async function get(path, headers = {}) {
  return fetch(`http://localhost:4000${path}`, { headers, redirect: 'manual' });
}

// ─── Setup / teardown ────────────────────────────────────────────────────────
before(async () => {
  // Connectivity check
  let alive = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch('http://localhost:4000/', { signal: AbortSignal.timeout(3000) });
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

  // Write the canary file outside the browser root
  writeFileSync(canaryPath, canaryContent, 'utf8');

  // Required fixture: inability to create the symlink fails this security gate.
  if (existsSync(symlinkPath)) unlinkSync(symlinkPath);
  symlinkSync(canaryPath, symlinkPath);
});

after(() => {
  // Unlink first: existsSync is false for a dangling symlink. Fixture paths only.
  for (const path of [symlinkPath, canaryPath]) {
    try {
      unlinkSync(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
});

// ─── Raw traversal rejection (canary-based) ───────────────────────────────────
describe('Path Traversal — forbidden assets never reach static fallback or SSR', () => {
  for (const encoding of ['gzip', 'identity']) {
    for (const method of ['GET', 'HEAD']) {
      for (const path of [
        '/../security-canary.json',
        '/../../security-canary.json',
        '/%2e%2e/security-canary.json',
        '/%252e%252e/security-canary.json',
        '/%2e%2e%2fsecurity-canary.json',
        '/%252e%252e%252fsecurity-canary.json',
        '/%2e%2e%5csecurity-canary.json',
        '/%00security-canary.json',
        '/_sec-symlink-test.json',
      ]) {
        it(method + ' ' + encoding + ' rejects ' + path, async () => {
          const { status, body } = await rawGet(path, { 'Accept-Encoding': encoding }, method);
          assert.ok([403, 404].includes(status), 'Forbidden path status: ' + status);
          assert.ok(!body.includes(canaryMark), 'Decoded response disclosed the outside canary');
          if (method === 'HEAD') assert.equal(body, '');
        });
      }
    }
  }
});

// ─── Correct static asset delivery ───────────────────────────────────────────
describe('Static Asset Delivery — gzip middleware must still serve real assets', () => {
  it('landing page (/) returns 200 gzip HTML', async () => {
    const r = await get('/', { 'Accept-Encoding': 'gzip' });
    assert.equal(r.status, 200);
    assert.ok(
      (r.headers.get('content-type') ?? '').includes('text/html'),
      'Expected text/html content-type',
    );
    assert.equal(r.headers.get('content-encoding'), 'gzip', 'Expected gzip encoding');
  });

  it('hashed CSS asset serves correct MIME and gzip encoding', async () => {
    const cssFile = findHashedAsset('.css');
    assert.ok(cssFile, 'No hashed .css file found in browser dist — run npm run build first');
    const { status, headers } = await rawGet(`/${cssFile}`, { 'Accept-Encoding': 'gzip' });
    assert.equal(status, 200, `Expected 200 for /${cssFile} but got ${status}`);
    const ct = headers['content-type'] ?? '';
    assert.ok(ct.includes('text/css'), `Expected text/css MIME but got: ${ct}`);
    assert.equal(headers['content-encoding'], 'gzip', 'Expected gzip encoding for hashed CSS');
    const cc = headers['cache-control'] ?? '';
    assert.ok(cc.includes('immutable'), `Expected immutable cache for hashed CSS but got: ${cc}`);
  });

  it('hashed JS asset serves correct MIME and gzip encoding', async () => {
    const jsFile = findHashedAsset('.js');
    assert.ok(jsFile, 'No hashed .js file found in browser dist — run npm run build first');
    const { status, headers } = await rawGet(`/${jsFile}`, { 'Accept-Encoding': 'gzip' });
    assert.equal(status, 200, `Expected 200 for /${jsFile} but got ${status}`);
    const ct = headers['content-type'] ?? '';
    assert.ok(
      ct.includes('javascript') || ct.includes('text/js'),
      `Expected JS MIME but got: ${ct}`,
    );
    assert.equal(headers['content-encoding'], 'gzip', 'Expected gzip encoding for hashed JS');
  });

  it('font file is served with immutable cache header', async () => {
    const r = await get('/fonts/tajawal-regular-arabic.woff2');
    assert.equal(r.status, 200, 'Font file should be accessible');
    const cc = r.headers.get('cache-control') ?? '';
    assert.ok(cc.includes('max-age=31536000'), `Expected immutable cache but got: ${cc}`);
  });

  it('/robots.txt returns 200 text/plain', async () => {
    const r = await get('/robots.txt');
    assert.equal(r.status, 200);
    assert.ok((r.headers.get('content-type') ?? '').includes('text/plain'));
  });

  it('/sitemap.xml returns 200 XML', async () => {
    const r = await get('/sitemap.xml');
    assert.equal(r.status, 200);
    assert.ok((r.headers.get('content-type') ?? '').includes('xml'));
  });

  it('/favicon.ico returns 204 no content', async () => {
    const r = await get('/favicon.ico');
    assert.equal(r.status, 204);
  });
});

// ─── Security headers ─────────────────────────────────────────────────────────
describe('Security Headers — must be present on all responses', () => {
  it('X-Content-Type-Options: nosniff on landing page', async () => {
    const r = await get('/');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });

  it('X-Content-Type-Options: nosniff on hashed CSS via rawGet', async () => {
    const cssFile = findHashedAsset('.css');
    if (!cssFile) return; // already checked in asset delivery suite
    const { headers } = await rawGet(`/${cssFile}`);
    assert.equal(headers['x-content-type-options'], 'nosniff');
  });

  it('Referrer-Policy: same-origin on landing page', async () => {
    const r = await get('/');
    assert.equal(r.headers.get('referrer-policy'), 'same-origin');
  });
});

// Cover both encodings and HEAD using the exact built Express server.
describe('Static and SSR encoding regression', () => {
  for (const encoding of ['gzip', 'identity']) {
    for (const method of ['GET', 'HEAD']) {
      for (const ext of ['.js', '.css']) {
        it(method + ' ' + encoding + ' delivers hashed ' + ext, async () => {
          const file = findHashedAsset(ext);
          assert.ok(file);
          const { status, headers, body, bytes } = await rawGet(
            '/' + file,
            { 'Accept-Encoding': encoding },
            method,
          );
          assert.equal(status, 200);
          assert.ok(headers['content-type'].includes(ext === '.js' ? 'javascript' : 'text/css'));
          assert.equal(headers['content-encoding'], encoding === 'gzip' ? 'gzip' : undefined);
          assert.ok(headers['vary'].includes('Accept-Encoding'));
          assert.ok(headers['cache-control'].includes('immutable'));
          if (method === 'HEAD') assert.equal(body, '');
          else assert.deepEqual(bytes, fsRead(file));
        });
      }
      it(method + ' ' + encoding + ' preserves SSR and missing-route status', async () => {
        const page = await rawGet('/r/demo', { 'Accept-Encoding': encoding }, method);
        assert.equal(page.status, 200);
        assert.ok(page.headers['content-type'].includes('text/html'));
        const missing = await rawGet('/r/nonexistent', { 'Accept-Encoding': encoding }, method);
        assert.equal(missing.status, 404);
        if (method === 'HEAD') {
          assert.equal(page.body, '');
          assert.equal(missing.body, '');
        } else {
          assert.ok(page.body.includes('<h1'));
          assert.ok(missing.body.includes('noindex'));
        }
      });
    }
  }
});
function fsRead(file) {
  return readFileSync(join(browserDir, file));
}
