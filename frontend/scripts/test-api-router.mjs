import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import {
  apiProxy,
  canonicalApiPathname,
  isIdentityApiPath,
  normalizeClientEntry,
  upstreamTimeoutMs,
} from '../src/api-proxy.ts';

/**
 * Contract tests for the same-origin /api router (docs/09-DEVOPS):
 * identity paths preserve cookie/CSRF protections end to end while public
 * paths stay identity-free in both directions. Non-canonical paths are
 * rejected before classification, because new URL() and ASP.NET normalize
 * dot segments/encoding differently and classification must describe the
 * exact pathname the upstream routes.
 */

function startUpstream() {
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen.push({
        url: req.url,
        method: req.method,
        cookie: req.headers.cookie ?? null,
        xsrf: req.headers['x-xsrf-token'] ?? null,
        contentType: req.headers['content-type'] ?? null,
        authorization: req.headers.authorization ?? null,
        forwardedFor: req.headers['x-forwarded-for'] ?? null,
        forwardedProto: req.headers['x-forwarded-proto'] ?? null,
        proxyToken: req.headers['x-menu-proxy-token'] ?? null,
        clientIp: req.headers['x-menu-client-ip'] ?? null,
        body,
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', [
        '__Host-DigitalMenu.Session=abc; Path=/; HttpOnly; Secure; SameSite=Strict',
      ]);
      res.end(JSON.stringify({ ok: true }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, seen, origin: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

async function startRouter(origin, options) {
  const app = express();
  app.use('/api', apiProxy(origin, options));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

/**
 * Sends a request-target byte-identically over a raw socket. fetch/undici
 * normalize dot segments before sending, so canonicality attacks can only
 * be tested at the raw HTTP layer.
 */
function rawRequest(port, target, extraHeaders = '') {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(
        `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n${extraHeaders}\r\n`,
      );
    });
    let data = '';
    socket.on('data', (chunk) => (data += chunk));
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
}

test('path classification', () => {
  for (const path of [
    '/api/v1/auth/login',
    '/api/v1/auth/csrf',
    '/api/v1/admin/categories',
    '/api/v1/admin/items/00000000-0000-0000-0000-000000000000/images',
    '/api/v1/platform/restaurants',
    // ASP.NET routes case-insensitively; classification must match it.
    '/API/V1/AUTH/LOGIN',
    '/Api/V1/Admin/Categories',
    '/api/v1/auth/login/',
  ]) {
    assert.equal(isIdentityApiPath(path), true, path);
  }
  for (const path of [
    '/api/v1/public/menus/abc',
    '/api/v1/public/restaurants/by-slug/demo',
    '/api/health/live',
    '/api/v1/authecho',
    '/api/v1/administrative',
    '/r/demo',
  ]) {
    assert.equal(isIdentityApiPath(path), false, path);
  }
});

test('non-canonical paths are rejected by validation and classify as non-identity', () => {
  for (const path of [
    '/api/v1/auth/../public/menus/abc',
    '/api/v1/public/../admin/categories',
    '/api/v1/auth/./login',
    '/api/v1/auth/login/..',
    '/api/v1/auth/%2e%2e/public/menus/abc',
    '/api/v1/auth/%2E%2E/public/menus/abc',
    '/api/v1/%61uth/login',
    '/api//v1/public/menus/abc',
    '/api/v1/public/menus/a%20b',
    '/api/v1/auth/login\\..\\public',
  ]) {
    assert.equal(canonicalApiPathname(path), null, path);
    assert.equal(isIdentityApiPath(path), false, path);
  }
  assert.equal(
    canonicalApiPathname('/api/v1/public/menus/abc?lang=ar'),
    '/api/v1/public/menus/abc',
  );
});

test('identity paths forward credentials and return Set-Cookie', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin);
  try {
    const response = await fetch(router.base + '/api/v1/auth/login', {
      method: 'POST',
      headers: {
        Cookie: '__Host-DigitalMenu.Antiforgery=xyz',
        'X-XSRF-TOKEN': 'token-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'a@b.c', password: 'secret-password' }),
    });
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie?.includes('__Host-DigitalMenu.Session'), 'Set-Cookie must pass through');

    assert.equal(upstream.seen.length, 1);
    const forwarded = upstream.seen[0];
    assert.equal(forwarded.cookie, '__Host-DigitalMenu.Antiforgery=xyz');
    assert.equal(forwarded.xsrf, 'token-1');
    assert.equal(forwarded.contentType, 'application/json');
    assert.equal(forwarded.body, JSON.stringify({ email: 'a@b.c', password: 'secret-password' }));
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('admin mutations forward the antiforgery header', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin);
  try {
    const response = await fetch(router.base + '/api/v1/admin/categories', {
      method: 'POST',
      headers: {
        Cookie: '__Host-DigitalMenu.Session=abc',
        'X-XSRF-TOKEN': 'token-2',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nameAr: 'مشروبات', sortOrder: 0, isPublished: true }),
    });
    assert.equal(response.status, 200);
    assert.equal(upstream.seen[0].xsrf, 'token-2');
    assert.equal(upstream.seen[0].cookie, '__Host-DigitalMenu.Session=abc');
    assert.ok(response.headers.get('set-cookie'));
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('public paths never forward identity and strip Set-Cookie', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin);
  try {
    for (const path of ['/api/v1/public/menus/abc', '/api/health/live']) {
      const response = await fetch(router.base + path, {
        headers: {
          Cookie: '__Host-DigitalMenu.Session=abc',
          Authorization: 'Bearer leaked',
          'X-XSRF-TOKEN': 'token-3',
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('set-cookie'), null, 'Set-Cookie must be stripped');
    }
    assert.equal(upstream.seen.length, 2);
    for (const forwarded of upstream.seen) {
      assert.equal(forwarded.cookie, null, 'Cookie must not reach the upstream');
      assert.equal(forwarded.authorization, null, 'Authorization must not reach the upstream');
      assert.equal(forwarded.xsrf, null, 'CSRF header is not forwarded on public paths');
    }
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('non-canonical request-targets get 400 and never reach the upstream', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin);
  const port = new URL(router.base).port;
  try {
    for (const target of [
      '/api/v1/auth/../public/menus/abc',
      '/api/v1/auth/%2e%2e/public/menus/abc',
      '/api/v1/auth/%2E%2E/public/menus/abc',
      '/api/v1/%61uth/login',
      '/api//v1/public/menus/abc',
      '/api/v1/auth/./login',
      '/api/v1/auth/login/..',
      '/api/v1/authecho/../auth/login',
    ]) {
      // Even with credential headers attached, nothing may be proxied.
      const raw = await rawRequest(
        port,
        target,
        'Cookie: __Host-DigitalMenu.Session=abc\r\nX-XSRF-TOKEN: t\r\n',
      );
      assert.match(raw, /^HTTP\/1\.1 400 /, target);
    }
    assert.equal(upstream.seen.length, 0, 'non-canonical targets must never be proxied');
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('case-variant identity paths keep identity treatment end to end', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin);
  const port = new URL(router.base).port;
  try {
    const raw = await rawRequest(
      port,
      '/API/V1/AUTH/login',
      'Cookie: __Host-DigitalMenu.Antiforgery=xyz\r\nX-XSRF-TOKEN: token-case\r\n',
    );
    assert.match(raw, /^HTTP\/1\.1 200 /);
    assert.match(raw, /__Host-DigitalMenu\.Session=abc/, 'Set-Cookie must pass through');
    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0].cookie, '__Host-DigitalMenu.Antiforgery=xyz');
    assert.equal(upstream.seen[0].xsrf, 'token-case');
    assert.equal(upstream.seen[0].url, '/API/V1/AUTH/login', 'path forwarded byte-identically');
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('query strings are forwarded unchanged and do not affect classification', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin);
  try {
    const response = await fetch(router.base + '/api/v1/public/menus/abc?lang=ar&x=1', {
      headers: { Cookie: '__Host-DigitalMenu.Session=abc' },
    });
    assert.equal(response.status, 200);
    assert.equal(upstream.seen[0].url, '/api/v1/public/menus/abc?lang=ar&x=1');
    assert.equal(upstream.seen[0].cookie, null);
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('a client-supplied X-Forwarded-For is overwritten with the socket peer', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin);
  try {
    for (const path of ['/api/v1/public/menus/abc', '/api/v1/auth/csrf']) {
      const response = await fetch(router.base + path, {
        headers: { 'X-Forwarded-For': '203.0.113.9' },
      });
      assert.equal(response.status, 200);
    }
    assert.equal(upstream.seen.length, 2);
    for (const forwarded of upstream.seen) {
      assert.equal(
        forwarded.forwardedFor,
        '127.0.0.1',
        'the forged client header must be replaced by the direct peer',
      );
    }
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('platform mode forwards only the edge-stamped last XFF entry and proto', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin, { trustPlatformForwarding: true });
  try {
    for (const path of ['/api/v1/public/menus/abc', '/api/v1/auth/csrf']) {
      const response = await fetch(router.base + path, {
        headers: {
          // The edge appends the real client IP last; the earlier entries
          // are client-supplied and must never reach the upstream.
          'X-Forwarded-For': '203.0.113.9, 198.51.100.7',
          'X-Forwarded-Proto': 'https',
        },
      });
      assert.equal(response.status, 200);
    }
    assert.equal(upstream.seen.length, 2);
    for (const forwarded of upstream.seen) {
      assert.equal(forwarded.forwardedFor, '198.51.100.7');
      assert.equal(forwarded.forwardedProto, 'https');
    }
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('platform mode falls back to the socket peer and never trusts a bogus proto', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin, { trustPlatformForwarding: true });
  try {
    const response = await fetch(router.base + '/api/v1/public/menus/abc', {
      headers: { 'X-Forwarded-Proto': 'gopher' },
    });
    assert.equal(response.status, 200);
    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0].forwardedFor, '127.0.0.1');
    assert.equal(upstream.seen[0].forwardedProto, 'http');
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('default mode never forwards a proto', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin);
  try {
    const response = await fetch(router.base + '/api/v1/public/menus/abc', {
      headers: { 'X-Forwarded-Proto': 'https' },
    });
    assert.equal(response.status, 200);
    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0].forwardedProto, null);
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('platform mode with a shared secret authenticates the hop and overwrites forgeries', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin, {
    trustPlatformForwarding: true,
    sharedSecret: 's3cret-boundary-token',
  });
  try {
    const response = await fetch(router.base + '/api/v1/public/menus/abc', {
      headers: {
        'X-Forwarded-For': '203.0.113.9, 198.51.100.7',
        // Client-supplied boundary headers must never survive the allowlist.
        'X-Menu-Proxy-Token': 'forged',
        'X-Menu-Client-Ip': '203.0.113.9',
      },
    });
    assert.equal(response.status, 200);
    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0].forwardedFor, '198.51.100.7');
    assert.equal(upstream.seen[0].clientIp, '198.51.100.7');
    assert.equal(upstream.seen[0].proxyToken, 's3cret-boundary-token');
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('platform mode without a secret sends no boundary headers', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin, { trustPlatformForwarding: true });
  try {
    const response = await fetch(router.base + '/api/v1/public/menus/abc', {
      headers: { 'X-Forwarded-For': '198.51.100.7' },
    });
    assert.equal(response.status, 200);
    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0].clientIp, null);
    assert.equal(upstream.seen[0].proxyToken, null);
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('normalizeClientEntry strips a parsed port and rejects malformed input', () => {
  assert.equal(normalizeClientEntry('198.51.100.7'), '198.51.100.7');
  assert.equal(normalizeClientEntry('198.51.100.7:63546'), '198.51.100.7'); // Azure XFF shape
  assert.equal(normalizeClientEntry('[2001:db8::7]:443'), '2001:db8::7');
  assert.equal(normalizeClientEntry('[2001:db8::7]'), '2001:db8::7');
  assert.equal(normalizeClientEntry('2001:db8::7'), '2001:db8::7');
  // IPv4-mapped IPv6, bare and as a bracketed endpoint (node:net isIP = 6).
  assert.equal(normalizeClientEntry('::ffff:192.0.2.7'), '::ffff:192.0.2.7');
  assert.equal(normalizeClientEntry('[::ffff:192.0.2.7]:443'), '::ffff:192.0.2.7');
  for (const bad of [
    '198.51.100.7:99999',
    '198.51.100.7:',
    '198.51.100.7:abc',
    '999.1.2.3:80',
    'not-an-ip',
    ':::', // colon-only: not an address
    '1:2:3:4:5:6:7:8:9', // nine groups: not IPv6
    '[1:2:3:4:5:6:7:8:9]:443',
    '',
  ]) {
    assert.equal(normalizeClientEntry(bad), undefined, bad);
  }
});

test('platform+secret mode normalizes an IPv4:port XFF entry into the client-ip header', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin, {
    trustPlatformForwarding: true,
    sharedSecret: 's3cret-boundary-token',
  });
  try {
    const response = await fetch(router.base + '/api/v1/public/menus/abc', {
      headers: { 'X-Forwarded-For': '198.51.100.7:63546' },
    });
    assert.equal(response.status, 200);
    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0].forwardedFor, '198.51.100.7:63546');
    assert.equal(upstream.seen[0].clientIp, '198.51.100.7');
    assert.equal(upstream.seen[0].proxyToken, 's3cret-boundary-token');
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('platform+secret mode sends no client-ip header for a malformed entry', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin, {
    trustPlatformForwarding: true,
    sharedSecret: 's3cret-boundary-token',
  });
  try {
    const response = await fetch(router.base + '/api/v1/public/menus/abc', {
      headers: { 'X-Forwarded-For': 'not-an-ip' },
    });
    assert.equal(response.status, 200);
    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0].forwardedFor, 'not-an-ip');
    assert.equal(upstream.seen[0].clientIp, null);
    assert.equal(upstream.seen[0].proxyToken, null);
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('platform+secret mode forwards a bare IPv4-mapped IPv6 entry unchanged', async () => {
  const upstream = await startUpstream();
  const router = await startRouter(upstream.origin, {
    trustPlatformForwarding: true,
    sharedSecret: 's3cret-boundary-token',
  });
  try {
    const response = await fetch(router.base + '/api/v1/public/menus/abc', {
      headers: { 'X-Forwarded-For': '::ffff:192.0.2.7' },
    });
    assert.equal(response.status, 200);
    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0].clientIp, '::ffff:192.0.2.7');
    assert.equal(upstream.seen[0].proxyToken, 's3cret-boundary-token');
  } finally {
    router.server.close();
    upstream.server.close();
  }
});

test('identity paths get a longer bounded upstream timeout than public paths', () => {
  assert.equal(upstreamTimeoutMs(false), 5000);
  assert.equal(upstreamTimeoutMs(true), 90000);
});

test('upstream failure surfaces a 502 problem', async () => {
  const router = await startRouter('http://127.0.0.1:1');
  try {
    const response = await fetch(router.base + '/api/v1/public/menus/abc');
    assert.equal(response.status, 502);
    assert.match(response.headers.get('content-type') ?? '', /problem\+json/);
  } finally {
    router.server.close();
  }
});
