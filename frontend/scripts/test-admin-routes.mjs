import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test, before, after } from 'node:test';

const port = 4390 + Math.floor(Math.random() * 50);
const base = `http://127.0.0.1:${port}`;
let server;

before(async () => {
  server = spawn('node', ['dist/digital-menu/server/server.mjs'], {
    env: {
      ...process.env,
      F01_LOCAL_ONLY: '1',
      PORT: String(port),
      PUBLIC_API_ORIGIN: 'http://127.0.0.1:1',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(base + '/login');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error('server did not start');
});
after(() => server?.kill());

for (const path of [
  '/login',
  '/admin',
  '/admin/categories',
  '/admin/items',
  '/admin/branding',
  '/admin/qr',
  '/platform',
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

test('unknown admin child stays a 404 noindex', async () => {
  const res = await fetch(base + '/admin/not-a-screen');
  assert.equal(res.status, 404);
  assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
});

test('admin API without a session is rejected, not proxied as public', async () => {
  const res = await fetch(base + '/api/v1/admin/items');
  assert.notEqual(res.status, 200);
});
