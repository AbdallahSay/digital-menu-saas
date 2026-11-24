// Cold-route JS gate against the production build output, served by a small static server.
// Routes: '/', '/privacy', '/r/demo'. The only API the static pages call is
// /api/v1/leads/status, answered with a closed status. Real SQL-backed AR/EN menu routes are
// measured in test-public-menu.mjs (PublicSsrTests). Admin/platform chunks are named by content
// markers (route-js-lib.mjs) and must not be requested by any public route.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  appendFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve, sep } from 'node:path';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import {
  ADMIN_MARKERS,
  ROUTE_BUDGET_BYTES,
  adminChunks,
  chunksContaining,
  coldScripts,
  writeRouteEvidence,
  enforceBudget,
  gzipBytes,
  verifyBuildManifest,
  jsFiles,
} from './route-js-lib.mjs';

const SRC = 'dist/digital-menu/browser';
// Client-interaction readiness for STATIC CSR shells only (the static server serves index.csr.html,
// so this is not SSR hydration of the real menu). '/' proves the marketing component's click handler runs. '/privacy'
// proves the client router is live: a routerLink click must navigate without a document reload
// (a window marker set before the click survives) and render the marketing component.
// '/r/demo' has no interactive control, so it keeps the bootstrap oracle only.
const ROUTES = {
  '/': {
    interact: async (page, timeout) => {
      const button = page.locator('button.mobile-menu-btn');
      await button.click({ timeout });
      await page.waitForFunction(
        () =>
          document.querySelector('button.mobile-menu-btn')?.getAttribute('aria-expanded') ===
          'true',
        null,
        { timeout },
      );
    },
    lang: 'ar',
    dir: 'rtl',
    readySelector: 'h1.hero-headline',
    expectText: 'منيو مطعمك',
  },
  '/privacy': {
    interact: async (page, timeout) => {
      await page.evaluate(() => (window.__routeProbe = 'alive'));
      await page.locator('app-privacy a[href="/"]').click({ timeout });
      await page.waitForFunction(
        () => location.pathname === '/' && !!document.querySelector('h1.hero-headline'),
        null,
        { timeout },
      );
      assert.equal(
        await page.evaluate(() => window.__routeProbe),
        'alive',
        'document reloaded; not a client navigation',
      );
    },
    lang: 'ar',
    dir: 'rtl',
    readySelector: 'app-privacy h1',
    expectText: 'سياسة الخصوصية',
  },
  '/r/demo': { lang: 'ar', dir: 'rtl', readySelector: 'main', expectText: 'مطعم' },
};
const MIME = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
const ROUTE_PATHS = new Set(Object.keys(ROUTES));

function serve(folder) {
  const root = resolve(folder);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/api/v1/leads/status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ open: false }));
    }
    if (path === '/favicon.ico' && !existsSync(join(root, 'favicon.ico'))) {
      res.writeHead(204); // the browser asks on its own; no page resource
      return res.end();
    }
    if (ROUTE_PATHS.has(path)) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      return res.end(readFileSync(join(root, 'index.csr.html')));
    }
    const file = resolve(root, '.' + path);
    const type = MIME[extname(file)];
    if (!file.startsWith(root + sep) || !type || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': type });
    res.end(readFileSync(file));
  });
  return new Promise((resolveP, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveP(server));
  });
}

const versionOut = { browser: 'unknown' };

async function measureRoutes(folder, routes = Object.keys(ROUTES), overrides = {}) {
  const server = await serve(folder);
  let browser;
  try {
    browser = await chromium.launch(
      process.env['CHROME_PATH'] ? { executablePath: process.env['CHROME_PATH'] } : {},
    );
    const origin = `http://127.0.0.1:${server.address().port}`;
    const result = {};
    versionOut.browser = browser.version();
    for (const route of routes) {
      const files = await coldScripts(browser, origin + route, folder, {
        ...ROUTES[route],
        ...overrides,
      });
      result[route] = { files, bytes: gzipBytes(folder, files) };
    }
    return result;
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
}

const aggregate = (folder) => gzipBytes(folder, jsFiles(folder));

test('public routes pass the budget and never request the named marker chunks', async () => {
  verifyBuildManifest(SRC);
  const named = adminChunks(SRC);
  for (const m of ADMIN_MARKERS)
    assert.ok(chunksContaining(SRC, [m]).length > 0, `marker ${m} matches no chunk`);
  const m = await measureRoutes(SRC);
  writeRouteEvidence('route-js-static', SRC, m, versionOut.browser);
  for (const [route, r] of Object.entries(m)) {
    console.log(route, r.bytes, 'B gzip,', r.files.length, 'scripts');
    enforceBudget(route, r);
    assertNoNamedChunks(route, r, named);
  }
});

test('enforceBudget rejects empty and oversized measurements and accepts the real one', () => {
  assert.throws(() => enforceBudget('empty', { files: [], bytes: 0 }));
  assert.throws(() => enforceBudget('big', { files: ['a'], bytes: ROUTE_BUDGET_BYTES + 1 }));
  enforceBudget('ok', { files: ['a'], bytes: ROUTE_BUDGET_BYTES });
});

test('negative controls through the real gate, with cleanup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'route-gate-'));
  try {
    cpSync(SRC, dir, { recursive: true });
    const pad = () => `\n/*${randomBytes(ROUTE_BUDGET_BYTES).toString('base64')}*/`;
    const base = await measureRoutes(dir, ['/privacy']);
    const baseAgg = aggregate(dir);
    enforceBudget('privacy base', base['/privacy']);
    // 1. padding a chunk no public route requests: route unchanged, aggregate grows.
    const admin = adminChunks(dir)[0];
    appendFileSync(join(dir, admin), pad());
    const afterAdmin = await measureRoutes(dir, ['/privacy']);
    assert.equal(afterAdmin['/privacy'].bytes, base['/privacy'].bytes);
    enforceBudget('privacy with padded admin chunk', afterAdmin['/privacy']);
    assert.ok(aggregate(dir) > baseAgg + ROUTE_BUDGET_BYTES / 2, 'aggregate must count it');
    // 2. padding the privacy page's own lazy chunk (found by its heading text): the route still
    // renders, and the real gate rejects it.
    const [privacyChunk] = chunksContaining(dir, ['سياسة الخصوصية لطلب الخدمة']);
    assert.ok(
      privacyChunk && base['/privacy'].files.includes(privacyChunk),
      'privacy chunk is requested',
    );
    assert.ok(privacyChunk !== base['/privacy'].files.find((f) => f.startsWith('main-')));
    appendFileSync(join(dir, privacyChunk), pad());
    const over = await measureRoutes(dir, ['/privacy']);
    assert.throws(() => enforceBudget('privacy padded', over['/privacy']), /exceeds/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a foreign-origin script fails the cold load closed', async () => {
  await assert.rejects(
    measureRoutes(SRC, ['/privacy'], {
      prepare: async (page) => {
        await page.route('https://foreign.invalid/x.js', (r) =>
          r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* x */' }),
        );
        await page.addInitScript(() => {
          addEventListener('DOMContentLoaded', () => {
            const s = document.createElement('script');
            s.src = 'https://foreign.invalid/x.js';
            document.head.append(s);
          });
        });
      },
    }),
    /foreign script origin/,
  );
});

test('a dist that differs from its build manifest is refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'route-manifest-'));
  try {
    cpSync('dist/digital-menu', join(root, 'digital-menu'), { recursive: true });
    const browser = join(root, 'digital-menu', 'browser');
    verifyBuildManifest(browser);
    appendFileSync(join(browser, jsFiles(browser)[0]), '/* tampered */');
    assert.throws(() => verifyBuildManifest(browser), /differs from build manifest/);
    rmSync(join(root, 'digital-menu', 'build-manifest.json'));
    assert.throws(() => verifyBuildManifest(browser), /build-manifest.json missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('with click listeners suppressed, the route still bootstraps and settles, and only the interaction check fails', async () => {
  for (const route of ['/', '/privacy']) {
    // Precondition: the same suppression does not break the bootstrap/text/lang/dir oracle or
    // measurement when no interaction is requested.
    const plain = await measureRoutes(SRC, [route], {
      interact: undefined,
      prepare: suppressClicks,
    });
    enforceBudget(route + ' (clicks suppressed, no interaction)', plain[route]);
    // The interaction check must then be what rejects it.
    await assert.rejects(
      measureRoutes(SRC, [route], { timeout: 4000, prepare: suppressClicks }),
      /interaction failed for/,
      route,
    );
  }
});

test('a script that arrives late in the initial route window is counted in its measurement', async () => {
  const late = adminChunks(SRC)[0];
  const m = await measureRoutes(SRC, ['/privacy'], {
    interact: undefined,
    prepare: (page) =>
      page.addInitScript((file) => {
        addEventListener('load', () =>
          setTimeout(() => {
            const s = document.createElement('script');
            s.type = 'module';
            s.src = '/' + file;
            document.head.append(s);
          }, 400),
        );
      }, late),
  });
  assert.ok(m['/privacy'].files.includes(late), 'late initial-route script missing from the set');
  assert.throws(
    () => assertNoNamedChunks('/privacy', m['/privacy'], [late]),
    /requested admin chunk/,
  );
});

function suppressClicks(page) {
  return page.addInitScript(() => {
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, ...rest) {
      if (type === 'click') return; // click handlers are never registered
      return original.call(this, type, ...rest);
    };
  });
}

function assertNoNamedChunks(route, measurement, named) {
  for (const f of named)
    assert.ok(!measurement.files.includes(f), `${route} requested admin chunk ${f}`);
}
