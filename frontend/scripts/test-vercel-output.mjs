// Packaged-handler checks for the Vercel bundle: the configured host renders
// SSR pages (static demo and a live-menu route backed by a loopback stub API),
// an unlisted or hostile Host is rejected, and a bad PUBLIC_ORIGIN fails closed.
// Needs a prior `npm run build`; this test packages it itself.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { join } from 'node:path';
import { test, before, after } from 'node:test';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');
// Only the emitted output tree is copied to a clean temp dir outside the repo, so the
// function must be self-contained (no ancestor node_modules or repo files).
const outDir = mkdtempSync(join(tmpdir(), 'vercel-output-'));
const fnDir = join(outDir, 'output/functions/index.func');
const entry = pathToFileURL(join(fnDir, 'index.mjs')).href;
const HOST = 'menu.example.test';
let api, server, port, handler;

const menu = (lang) => ({
  restaurant: {
    name: 'El Nour',
    slug: 'elnour',
    primaryColor: '#d97706',
    currency: 'EGP',
    logoUrl: null,
  },
  language: lang,
  publishedMenuVersion: 3,
  categories: [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'Grills',
      items: [
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          name: 'Mixed grill platter',
          description: 'Kebab and kofta.',
          price: 185.5,
          image: null,
        },
      ],
    },
  ],
});

function get(path, host) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  execFileSync(process.execPath, [join(root, 'scripts/vercel-output.mjs')], { stdio: 'ignore' });
  cpSync(join(root, '.vercel/output'), join(outDir, 'output'), { recursive: true });
  api = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/v1/public/restaurants/by-slug/elnour') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(menu(url.searchParams.get('lang') === 'en' ? 'en' : 'ar')));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/problem+json' });
    res.end('{"title":"not found"}');
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  process.env.PUBLIC_API_ORIGIN = `http://127.0.0.1:${api.address().port}`;
  process.env.PUBLIC_ORIGIN = `https://${HOST}`;
  delete process.env.NG_ALLOWED_HOSTS;
  handler = (await import(entry)).default;
  server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(() => {
  rmSync(outDir, { recursive: true, force: true });
  server?.close();
  api?.close();
});

test('configured host renders the static demo and a live-menu SSR route', async () => {
  const demo = await get('/r/demo', HOST);
  assert.equal(demo.status, 200);
  const live = await get('/r/elnour', HOST);
  assert.equal(live.status, 200);
  assert.match(live.body, /Mixed grill platter|El Nour/);
});

test('an unlisted or hostile Host is rejected on Angular-rendered routes', async () => {
  for (const host of ['evil.example.test', `${HOST}.evil.example.test`]) {
    for (const path of ['/r/demo', '/']) {
      const response = await get(path, host);
      assert.equal(response.status, 400, `${host} ${path}`);
    }
  }
});

test('live-menu routes never use the Host header: pages are built from trusted PUBLIC_ORIGIN only', async () => {
  const response = await get('/r/elnour', 'evil.example.test');
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.body, /evil\.example\.test/);
  assert.match(response.body, new RegExp(`https://${HOST.replaceAll('.', '\\.')}/r/elnour`));
});

test('the derived allowlist is exactly the PUBLIC_ORIGIN hostname, never a wildcard', () => {
  assert.equal(process.env.NG_ALLOWED_HOSTS, HOST);
});

test('a missing, http or wildcard PUBLIC_ORIGIN fails closed at cold start', () => {
  for (const bad of [
    '',
    'http://menu.example.test',
    'https://*.example.test',
    'https://menu.example.test/x',
  ]) {
    const env = { ...process.env, PUBLIC_ORIGIN: bad, PUBLIC_API_ORIGIN: 'http://127.0.0.1:1' };
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          ['--input-type=module', '-e', `await import(${JSON.stringify(entry)})`],
          {
            env,
            stdio: 'pipe',
          },
        ),
      /PUBLIC_ORIGIN/,
      bad,
    );
  }
});

test('the function profile enables response streaming and the platform request cap is documented', () => {
  const config = JSON.parse(readFileSync(join(fnDir, '.vc-config.json'), 'utf8'));
  assert.equal(config.runtime, 'nodejs24.x');
  assert.equal(config.supportsResponseStreaming, true);
  // Vercel rejects request bodies over ~4.5 MB before the app runs, so the 5 MiB
  // image-upload contract is limited in this preview profile; the README must say so.
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /4\.5 MB/);
  assert.match(readme, /image uploads/i);
});

test('hashed JS and font files are served from the self-contained copy', async () => {
  const browser = join(fnDir, 'browser');
  const js = readdirSync(browser).find((f) => /^main-.*\.js$/.test(f));
  const font = readdirSync(join(browser, 'fonts')).find((f) => /\.woff2?$/.test(f));
  assert.ok(js, 'main js emitted');
  for (const path of [`/${js}`, ...(font ? [`/fonts/${font}`] : [])]) {
    const response = await get(path, HOST);
    assert.equal(response.status, 200, path);
    assert.ok(response.body.length > 100, path);
  }
});

test('an unknown API path goes through the app, not the platform', async () => {
  const response = await get('/api/v1/public/restaurants/by-slug/missing', HOST);
  assert.ok([404, 502, 503].includes(response.status), String(response.status));
});
