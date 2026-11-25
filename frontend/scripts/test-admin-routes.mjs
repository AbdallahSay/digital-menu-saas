import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test, before, after } from 'node:test';

import { createServer } from 'node:net';

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

let port;
let base;
let server;
let exited = false;

before(async () => {
  port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn('node', ['dist/digital-menu/server/server.mjs'], {
    env: {
      ...process.env,
      F01_LOCAL_ONLY: '1',
      PORT: String(port),
      PUBLIC_API_ORIGIN: 'http://127.0.0.1:1',
    },
    stdio: 'ignore',
  });
  server.once('exit', () => (exited = true));
  for (let i = 0; i < 80; i++) {
    if (exited) throw new Error('server exited before listening');
    try {
      const res = await fetch(base + '/login');
      // Our server always marks client shells noindex; anything else is not our process.
      if (/noindex/.test(res.headers.get('x-robots-tag') ?? '')) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not become ready');
});
after(async () => {
  if (!server || exited) return;
  const done = new Promise((resolve) => server.once('exit', resolve));
  server.kill();
  await done;
});

for (const path of [
  '/login',
  '/admin',
  '/admin/categories',
  '/admin/items',
  '/admin/branding',
  '/admin/qr',
  '/platform',
  '/owner-setup',
]) {
  test(`${path} is a 200 no-store noindex client shell`, async () => {
    const res = await fetch(base + path, { redirect: 'manual' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
    assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
    const html = await res.text();
    assert.doesNotMatch(html, /local-test|owner@|password/i);
  });
}

test('/owner-setup sends no referrer', async () => {
  const res = await fetch(base + '/owner-setup');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});

test('unknown admin child stays a 404 noindex', async () => {
  const res = await fetch(base + '/admin/not-a-screen');
  assert.equal(res.status, 404);
  assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
});
