// Built-server sitemap checks (needs `npm run build`). Synthetic stub backend only; counts every request it receives.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { JSDOM } from 'jsdom';

const listen = (server) =>
  new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const get = (port, path, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, headers, timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
  });

async function withServer(env, backendReply, fn) {
  const seen = [];
  const backend = http.createServer((req, res) => {
    seen.push({
      url: req.url,
      host: req.headers.host,
      cookie: req.headers.cookie,
      auth: req.headers.authorization,
    });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(backendReply));
  });
  const backendPort = await listen(backend);
  const port = await new Promise((r) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
  const child = spawn(process.execPath, ['dist/digital-menu/server/server.mjs'], {
    env: {
      ...process.env,
      F01_LOCAL_ONLY: '1',
      PORT: String(port),
      PUBLIC_ORIGIN: 'https://public.example.test',
      PUBLIC_API_ORIGIN: 'http://127.0.0.1:' + backendPort,
      SITEMAP_ENABLED: '',
      SITEMAP_ORIGIN: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => (stderr += c));
  const exited = new Promise((r) => child.once('exit', r));
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('server did not start')), 15000);
      child.once('exit', (c) => {
        clearTimeout(t);
        reject(new Error('exited early ' + c));
      });
      child.stdout.on('data', (c) => {
        if (String(c).includes('Local SSR listening')) {
          clearTimeout(t);
          resolve();
        }
      });
    });
    await fn({ port, seen, stderr: () => stderr });
  } finally {
    child.kill();
    // Bounded teardown: force-kill if the child does not exit, never wait forever.
    const killer = setTimeout(() => child.kill('SIGKILL'), 3000);
    await exited;
    clearTimeout(killer);
    backend.closeAllConnections?.();
    await new Promise((r) => backend.close(r));
  }
}

const reply = {
  page: 1,
  pageSize: 1000,
  hasMore: false,
  truncated: false,
  entries: [
    { slug: 'listed-one', lastModifiedUtc: '2026-11-24T21:46:43.8674314Z' },
    { slug: 'demo', lastModifiedUtc: '2026-11-24T21:46:43Z' },
  ],
};

test('built server, default config: 404/no-store/noindex, robots without Sitemap, ZERO backend requests, forged Host changes nothing', async () => {
  await withServer({}, reply, async ({ port, seen }) => {
    const forged = { host: 'evil.example', 'x-forwarded-host': 'evil.example' };
    const sm = await get(port, '/sitemap.xml', forged);
    assert.equal(sm.status, 404);
    assert.equal(sm.headers['cache-control'], 'no-store');
    assert.equal(sm.headers['x-robots-tag'], 'noindex');
    assert.doesNotMatch(sm.body, /<url|evil\.example|\/r\/demo/);
    const robots = await get(port, '/robots.txt', forged);
    assert.equal(robots.status, 200);
    assert.doesNotMatch(robots.body, /Sitemap:|evil\.example|localhost|127\.0\.0\.1/);
    assert.match(robots.body, /Disallow: \/admin/);
    assert.deepEqual(seen, [], 'disabled sitemap must make no backend request');
  });
});

test('built server, invalid enabled config stays disabled, logs a fixed reason only, no backend request', async () => {
  await withServer(
    { SITEMAP_ENABLED: 'true', SITEMAP_ORIGIN: 'http://u:secret-token@menu.example/x' },
    reply,
    async ({ port, seen, stderr }) => {
      assert.equal((await get(port, '/sitemap.xml')).status, 404);
      assert.doesNotMatch((await get(port, '/robots.txt')).body, /Sitemap:/);
      assert.deepEqual(seen, []);
      await new Promise((r) => setTimeout(r, 100));
      assert.doesNotMatch(stderr(), /secret-token/);
    },
  );
});

test('built server, enabled with a valid origin: synthetic page, demo excluded, origin from config only, one credential-free backend request', async () => {
  await withServer(
    { SITEMAP_ENABLED: 'true', SITEMAP_ORIGIN: 'https://menu.example' },
    reply,
    async ({ port, seen }) => {
      const forged = {
        host: 'evil.example',
        'x-forwarded-host': 'evil.example',
        cookie: 'a=b',
        authorization: 'Bearer x',
      };
      const sm = await get(port, '/sitemap.xml', forged);
      assert.equal(sm.status, 200);
      assert.match(sm.headers['content-type'], /xml/);
      assert.equal(sm.headers['cache-control'], 'no-store');
      const doc = new JSDOM(sm.body, { contentType: 'text/xml' }).window.document;
      assert.deepEqual(
        [...doc.querySelectorAll('loc')].map((n) => n.textContent),
        ['https://menu.example/r/listed-one'],
      );
      assert.doesNotMatch(sm.body, /evil\.example/);
      assert.match(
        (await get(port, '/robots.txt', forged)).body,
        /^Sitemap: https:\/\/menu\.example\/sitemap\.xml$/m,
      );
      assert.equal(seen.length, 1);
      assert.equal(seen[0].url, '/api/v1/public/sitemap?page=1');
      assert.equal(seen[0].cookie, undefined);
      assert.equal(seen[0].auth, undefined);
    },
  );
});

test('built server, enabled but backend payload hostile: 503, no URLs', async () => {
  await withServer(
    { SITEMAP_ENABLED: 'true', SITEMAP_ORIGIN: 'https://menu.example' },
    { ...reply, hasMore: true },
    async ({ port }) => {
      const sm = await get(port, '/sitemap.xml');
      assert.equal(sm.status, 503);
      assert.doesNotMatch(sm.body, /<url/);
    },
  );
});
