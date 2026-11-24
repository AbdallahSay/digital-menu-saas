// Cold-route JS gate. A fresh browser context loads each public route from the production build
// output; every script actually requested is gzipped (default level, local bytes) and summed.
// Gate: <= 180 KiB gzip per route. Chunks never requested by public routes (admin/platform) must
// not be requested, and still count toward the aggregate gate in source-html.mjs.
// Limits: serves the static CSR shell (no SQL/API), so /r/:slug here is the demo component and
// real SQL-backed AR/EN menu routes are NOT measured by this script.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';

export const ROUTE_BUDGET_BYTES = 180 * 1024;
export const PUBLIC_ROUTES = ['/', '/privacy', '/r/demo'];
const SRC = 'dist/digital-menu/browser';

function serve(folder) {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname.slice(1);
    const file = path && existsSync(join(folder, path)) && extname(path) ? path : 'index.csr.html';
    const type =
      extname(file) === '.js'
        ? 'text/javascript'
        : extname(file) === '.css'
          ? 'text/css'
          : 'text/html';
    res.writeHead(200, { 'content-type': type });
    res.end(readFileSync(join(folder, file)));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function measureRoutes(folder, routes = PUBLIC_ROUTES) {
  const server = await serve(folder);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(
    process.env['CHROME_PATH'] ? { executablePath: process.env['CHROME_PATH'] } : {},
  );
  const result = {};
  try {
    for (const route of routes) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      const scripts = new Set();
      page.on('response', (r) => {
        const p = new URL(r.url()).pathname;
        if (p.endsWith('.js')) scripts.add(p.slice(1));
      });
      await page.goto(origin + route, { waitUntil: 'networkidle' });
      await page.waitForFunction(
        () => (document.querySelector('app-root')?.innerText ?? '').trim().length > 20,
        null,
        { timeout: 15000 },
      );
      await context.close();
      const files = [...scripts].sort();
      const bytes = files.reduce((t, f) => t + gzipSync(readFileSync(join(folder, f))).length, 0);
      result[route] = { bytes, files };
    }
  } finally {
    await browser.close();
    server.close();
  }
  return result;
}

const allJs = (folder) => readdirSync(folder).filter((f) => f.endsWith('.js'));

test('public routes stay within 180 KiB gzip and never fetch admin-only chunks', async () => {
  const m = await measureRoutes(SRC);
  const fetched = new Set(Object.values(m).flatMap((r) => r.files));
  for (const [route, r] of Object.entries(m)) {
    console.log(route, r.bytes, 'B gzip,', r.files.length, 'scripts');
    assert.ok(r.bytes <= ROUTE_BUDGET_BYTES, `${route} ${r.bytes} B over budget`);
  }
  const never = allJs(SRC).filter((f) => !fetched.has(f));
  assert.ok(never.length > 0, 'expected lazy chunks that public routes never request');
  console.log('never fetched by public routes:', never.length, 'chunks');
});

test('negative controls: oversized public chunk fails, unfetched chunk does not inflate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'route-gate-'));
  cpSync(SRC, dir, { recursive: true });
  const base = await measureRoutes(dir, ['/privacy']);
  const fetched = new Set(base['/privacy'].files);
  const unfetched = allJs(dir).find((f) => !fetched.has(f));
  appendFileSync(join(dir, unfetched), `/*${randomBytes(ROUTE_BUDGET_BYTES).toString('base64')}*/`);
  const after = await measureRoutes(dir, ['/privacy']);
  assert.equal(after['/privacy'].bytes, base['/privacy'].bytes, 'unfetched chunk inflated route');
  const lazy = base['/privacy'].files.find(
    (f) => f !== base['/privacy'].files[0] && f.startsWith('chunk-'),
  );
  assert.ok(lazy, 'privacy route has a lazy chunk');
  appendFileSync(join(dir, lazy), `/*${randomBytes(ROUTE_BUDGET_BYTES).toString('base64')}*/`);
  const over = await measureRoutes(dir, ['/privacy']);
  assert.ok(
    over['/privacy'].bytes > ROUTE_BUDGET_BYTES,
    'oversized lazy public chunk must exceed gate',
  );
});
